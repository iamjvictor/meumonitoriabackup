export type VisualAssetForLinking = {
  id: string; assetKey: string; sourceItemRef: string; pageNumber: number;
  readingOrder: number | null; bbox: number[] | null; caption: string | null; contentAvailable: boolean;
};

export type VisualSourceProvenance = { page?: number; item_ref?: string; reading_order?: number; bbox?: number[] | null };
export type VisualChunkForLinking = {
  id: string; text: string; pages: number[]; provenance: VisualSourceProvenance[];
};
export type QuestionVisualSpanForLinking = {
  questionSpanId: string; questionId: string | null; pages: number[];
  provenance: VisualSourceProvenance[]; text: string; visualRequired: boolean;
};

export type VisualAssociationMethod = 'ITEM_REF' | 'BBOX' | 'CAPTION' | 'PAGE_CANDIDATE';
export type VisualLink = {
  assetId: string; assetKey: string; method: VisualAssociationMethod;
  confidence: number; role: string; chunkId?: string; questionSpanId?: string; questionId?: string;
};
export type VisualLinkReport = {
  linked: VisualLink[];
  ambiguous: Array<{ targetId: string; method: 'PAGE_CANDIDATE'; candidateAssetIds: string[] }>;
  missing: Array<{ targetId: string; reason: 'NO_ASSET_ON_PAGE' | 'CROP_UNAVAILABLE' }>;
  detectedByPage: Record<number, number>; linkedByPage: Record<number, number>;
  ambiguousByPage: Record<number, number>; missingByPage: Record<number, number>;
};

export type VisualLinkStore = {
  findAssetsForParseRun(parseRunId: string): Promise<VisualAssetForLinking[]>;
  findAssetsForDocument(documentId: string): Promise<VisualAssetForLinking[]>;
  persistChunkLinks(links: VisualLink[]): Promise<void>;
  persistQuestionLinks(links: VisualLink[]): Promise<void>;
  persistQuestionSpanLinks(links: VisualLink[]): Promise<void>;
  updateQuestionSpanVisualStatuses(rows: Array<{ questionSpanId: string; status: 'AVAILABLE' | 'PENDING_EXTRACTION' | 'MISSING' }>): Promise<void>;
};

type Match = { asset: VisualAssetForLinking; method: VisualAssociationMethod; confidence: number };

export class DocumentVisualLinkingService {
  constructor(private readonly store: VisualLinkStore, private readonly log: (event: string, fields: Record<string, unknown>) => void = () => {}) {}

  async linkVisualAssetsToChunks(parseRunId: string, chunks: VisualChunkForLinking[]): Promise<VisualLinkReport> {
    const assets = await this.store.findAssetsForParseRun(parseRunId);
    const report = emptyReport(assets);
    for (const chunk of chunks) {
      const result = matchVisuals(assets, chunk.pages, chunk.provenance, chunk.text);
      for (const match of result.matches) report.linked.push({
        assetId: match.asset.id, assetKey: match.asset.assetKey,
        method: match.method,
        confidence: match.confidence, role: match.method === 'CAPTION' ? 'CAPTION' : 'INLINE', chunkId: chunk.id,
      });
      if (result.ambiguous.length) report.ambiguous.push({
        targetId: chunk.id, method: 'PAGE_CANDIDATE', candidateAssetIds: result.ambiguous.map((asset) => asset.id),
      });
      if (!result.matches.length && !result.ambiguous.length) report.missing.push({
        targetId: chunk.id, reason: result.cropUnavailable ? 'CROP_UNAVAILABLE' : 'NO_ASSET_ON_PAGE',
      });
      countByPage(report, chunk.pages, result);
    }
    if (report.linked.length) await this.store.persistChunkLinks(report.linked);
    this.emitReport('document_visual_assets.chunk_linking_completed', parseRunId, report);
    return report;
  }

  async linkVisualAssetsToQuestions(documentId: string, questionSpans: QuestionVisualSpanForLinking[]): Promise<VisualLinkReport> {
    const assets = await this.store.findAssetsForDocument(documentId);
    const report = emptyReport(assets);
    const statusUpdates: Array<{ questionSpanId: string; status: 'AVAILABLE' | 'PENDING_EXTRACTION' | 'MISSING' }> = [];
    const spanReviewCandidates: VisualLink[] = [];
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    for (const span of questionSpans) {
      if (!span.visualRequired && !assets.some((asset) => span.pages.includes(asset.pageNumber))) continue;
      const result = matchVisuals(assets, span.pages, span.provenance, span.text);
      for (const match of result.matches) {
        const link: VisualLink = {
          assetId: match.asset.id, assetKey: match.asset.assetKey,
          method: match.method,
          confidence: match.confidence, role: 'STATEMENT', questionSpanId: span.questionSpanId,
          ...(span.questionId ? { questionId: span.questionId } : {}),
        };
        report.linked.push(link);
      }
      if (result.matches.length) statusUpdates.push({ questionSpanId: span.questionSpanId, status: 'AVAILABLE' });
      else if (result.ambiguous.length) {
        report.ambiguous.push({ targetId: span.questionSpanId, method: 'PAGE_CANDIDATE', candidateAssetIds: result.ambiguous.map((asset) => asset.id) });
        for (const candidateAssetId of result.ambiguous.map((asset) => asset.id)) {
          const asset = assetById.get(candidateAssetId);
          if (asset) spanReviewCandidates.push({
            assetId: asset.id, assetKey: asset.assetKey, method: 'PAGE_CANDIDATE',
            confidence: 0.2, role: 'REVIEW_CANDIDATE', questionSpanId: span.questionSpanId,
          });
        }
        statusUpdates.push({ questionSpanId: span.questionSpanId, status: 'PENDING_EXTRACTION' });
      } else {
        report.missing.push({ targetId: span.questionSpanId, reason: result.cropUnavailable ? 'CROP_UNAVAILABLE' : 'NO_ASSET_ON_PAGE' });
        statusUpdates.push({ questionSpanId: span.questionSpanId, status: 'MISSING' });
      }
      countByPage(report, span.pages, result);
    }
    const questionLinks = report.linked.filter((link) => link.questionId);
    if (questionLinks.length) await this.store.persistQuestionLinks(questionLinks);
    if (report.linked.length || spanReviewCandidates.length) {
      await this.store.persistQuestionSpanLinks([...report.linked, ...spanReviewCandidates]);
    }
    if (statusUpdates.length) await this.store.updateQuestionSpanVisualStatuses(statusUpdates);
    this.emitReport('document_visual_assets.question_linking_completed', documentId, report);
    return report;
  }

  private emitReport(event: string, ownerId: string, report: VisualLinkReport) {
    this.log(event, {
      owner_id: ownerId, detected_count: Object.values(report.detectedByPage).reduce((a, b) => a + b, 0),
      linked_count: report.linked.length, ambiguous_count: report.ambiguous.length,
      missing_count: report.missing.length, detected_by_page: report.detectedByPage,
      linked_by_page: report.linkedByPage, ambiguous_by_page: report.ambiguousByPage,
      missing_by_page: report.missingByPage,
    });
  }
}

function matchVisuals(
  assets: VisualAssetForLinking[], pages: number[], provenance: VisualSourceProvenance[], text: string,
): { matches: Match[]; ambiguous: VisualAssetForLinking[]; cropUnavailable: boolean } {
  const pageSet = new Set(pages);
  const candidates = assets.filter((asset) => pageSet.has(asset.pageNumber));
  const matches: Match[] = [];
  let cropUnavailable = false;
  const matched = new Set<string>();
  for (const source of provenance) {
    const relevant = candidates.filter((asset) => asset.pageNumber === source.page);
    let candidate: Match | undefined;
    if (source.item_ref) {
      const exact = relevant.find((asset) => asset.sourceItemRef === source.item_ref);
      if (exact) candidate = { asset: exact, method: 'ITEM_REF', confidence: 1 };
    }
    if (!candidate && source.bbox) {
      const overlaps = relevant.map((asset) => ({ asset, ratio: bboxOverlapRatio(source.bbox!, asset.bbox) }))
        .filter((entry) => entry.ratio >= 0.35).sort((a, b) => b.ratio - a.ratio);
      const bestOverlap = overlaps[0]?.ratio;
      const tied = bestOverlap === undefined ? [] : overlaps.filter((entry) => bestOverlap - entry.ratio < 0.12);
      const readingOrderMatch = source.reading_order === undefined ? undefined
        : tied.find((entry) => entry.asset.readingOrder === source.reading_order);
      if (readingOrderMatch || (overlaps.length && (!overlaps[1] || overlaps[0]!.ratio - overlaps[1]!.ratio >= 0.12))) {
        const selected = readingOrderMatch ?? overlaps[0]!;
        candidate = { asset: selected.asset, method: 'BBOX', confidence: Math.min(0.98, selected.ratio) };
      }
    }
    if (candidate && !matched.has(candidate.asset.id)) {
      if (!candidate.asset.contentAvailable) cropUnavailable = true;
      else { matches.push(candidate); matched.add(candidate.asset.id); }
    }
  }

  if (!matches.length && candidates.length) {
    const captionMatches = candidates.map((asset) => ({ asset, confidence: captionOverlap(asset.caption, text) }))
      .filter((entry) => entry.confidence >= 0.72).sort((a, b) => b.confidence - a.confidence);
    if (captionMatches.length && (!captionMatches[1] || captionMatches[0]!.confidence - captionMatches[1]!.confidence >= 0.12)) {
      const best = captionMatches[0]!;
      if (!best.asset.contentAvailable) cropUnavailable = true;
      else { matches.push({ asset: best.asset, method: 'CAPTION', confidence: best.confidence }); matched.add(best.asset.id); }
    }
  }

  const unresolved = candidates.filter((asset) => !matched.has(asset.id));
  const ambiguous = matches.length === 0 && unresolved.some((asset) => asset.contentAvailable) ? unresolved.filter((asset) => asset.contentAvailable) : [];
  return { matches, ambiguous, cropUnavailable };
}

function bboxOverlapRatio(a: number[], b: number[] | null): number {
  if (!b || a.length !== 4 || b.length !== 4) return 0;
  const intersection = Math.max(0, Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!))
    * Math.max(0, Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!));
  const areaA = Math.max(0, a[2]! - a[0]!) * Math.max(0, a[3]! - a[1]!);
  const areaB = Math.max(0, b[2]! - b[0]!) * Math.max(0, b[3]! - b[1]!);
  const denominator = Math.min(areaA, areaB);
  return denominator > 0 ? intersection / denominator : 0;
}

function captionOverlap(caption: string | null, text: string): number {
  if (!caption) return 0;
  const ignored = new Set(['com', 'para', 'uma', 'que', 'das', 'dos', 'the', 'and', 'figure', 'figura']);
  const terms = caption.toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}]{3,}/gu)?.filter((term) => !ignored.has(term)) ?? [];
  const unique = [...new Set(terms)];
  if (unique.length < 2) return 0;
  const normalizedText = text.toLocaleLowerCase('pt-BR');
  return unique.filter((term) => normalizedText.includes(term)).length / unique.length;
}

function emptyReport(assets: VisualAssetForLinking[]): VisualLinkReport {
  const detectedByPage: Record<number, number> = {};
  for (const asset of assets) detectedByPage[asset.pageNumber] = (detectedByPage[asset.pageNumber] ?? 0) + 1;
  return { linked: [], ambiguous: [], missing: [], detectedByPage, linkedByPage: {}, ambiguousByPage: {}, missingByPage: {} };
}

function countByPage(report: VisualLinkReport, pages: number[], result: { matches: Match[]; ambiguous: VisualAssetForLinking[]; cropUnavailable: boolean }) {
  for (const page of pages) {
    const matches = result.matches.filter((match) => match.asset.pageNumber === page).length;
    if (matches) report.linkedByPage[page] = (report.linkedByPage[page] ?? 0) + matches;
    else if (result.ambiguous.length) report.ambiguousByPage[page] = (report.ambiguousByPage[page] ?? 0) + result.ambiguous.length;
    else if (result.cropUnavailable) report.missingByPage[page] = (report.missingByPage[page] ?? 0) + 1;
  }
}

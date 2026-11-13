export type VisualContextScope = { studentId: string; teacherId: string; monitorId: string; subjectId: string };
export type ChatVisualAssetReference = {
  assetId: string;
  page: number | null;
  checksum: string;
  description: string | null;
  totalCount?: number;
};
export type ChatVisualContextImage = ChatVisualAssetReference & {
  source: 'STUDENT_UPLOAD' | 'QUESTION' | 'KNOWLEDGE';
};

export type ChatVisualContextDependencies = {
  questionAssets(questionId: string, scope: VisualContextScope): Promise<ChatVisualAssetReference[]>;
  knowledgeAssets(assetIds: string[], scope: VisualContextScope): Promise<ChatVisualAssetReference[]>;
  studentAssets(assetIds: string[], scope: VisualContextScope): Promise<ChatVisualAssetReference[]>;
};

export class ChatVisualContextService {
  constructor(private readonly dependencies: ChatVisualContextDependencies) {}

  async resolveVisualContext(input: {
    scope: VisualContextScope;
    currentQuestionId: string | null;
    resolvedAttachment: { type: 'QUESTION' | 'FLASHCARD'; id: string } | null;
    rag: { citations: Array<{ visualAssetIds?: string[] }> };
    studentImageIds: string[];
  }): Promise<{ text: string; images: ChatVisualContextImage[]; contextManifest: Array<Omit<ChatVisualContextImage, 'description'>> }> {
    const questionId = input.currentQuestionId
      ?? (input.resolvedAttachment?.type === 'QUESTION' ? input.resolvedAttachment.id : null);
    const [studentAssets, questionAssets, knowledgeAssets] = await Promise.all([
      input.studentImageIds.length ? this.dependencies.studentAssets(input.studentImageIds, input.scope) : Promise.resolve([]),
      questionId ? this.dependencies.questionAssets(questionId, input.scope) : Promise.resolve([]),
      input.rag.citations.flatMap((citation) => citation.visualAssetIds ?? []).length
        ? this.dependencies.knowledgeAssets(Array.from(new Set(input.rag.citations.flatMap((citation) => citation.visualAssetIds ?? []))), input.scope)
        : Promise.resolve([]),
    ]);
    const seen = new Set<string>();
    const images: ChatVisualContextImage[] = [];
    const omittedCounts = new Map<ChatVisualContextImage['source'], number>();
    const addOmitted = (source: ChatVisualContextImage['source'], count = 1) => {
      if (count > 0) omittedCounts.set(source, (omittedCounts.get(source) ?? 0) + count);
    };
    const questionAssetCount = questionAssets[0]?.totalCount;
    if (questionAssetCount !== undefined) {
      addOmitted('QUESTION', questionAssetCount - questionAssets.length);
    }
    for (const [source, assets] of [
      ['QUESTION', questionAssets],
      ['STUDENT_UPLOAD', studentAssets],
      ['KNOWLEDGE', knowledgeAssets],
    ] as const) {
      for (const asset of assets) {
        if (seen.has(asset.assetId)) continue;
        if (images.length >= 4) {
          addOmitted(source);
          continue;
        }
        seen.add(asset.assetId);
        const { assetId, page, checksum, description } = asset;
        images.push({ assetId, page, checksum, description, source });
      }
    }
    const visualSections = images.map((image, index) => [
      `[CONTEXTO VISUAL ${index + 1}]`,
      `Origem: ${image.source}`,
      `Página: ${image.page ?? 'não informada'}`,
      image.description ?? 'A imagem foi selecionada para análise visual; use somente o que puder verificar nela.',
    ].join('\n'));
    if (omittedCounts.size > 0) {
      const omittedSummary = Array.from(omittedCounts, ([source, count]) => `${source} (${count})`).join(', ');
      visualSections.push(`[LIMITE DE IMAGENS] Limite de 4 imagens. Assets omitidos por fonte: ${omittedSummary}. Não afirme que viu imagens omitidas.`);
    }
    const text = visualSections.join('\n\n');
    return {
      text,
      images,
      contextManifest: images.map(({ description: _description, ...reference }) => reference),
    };
  }
}

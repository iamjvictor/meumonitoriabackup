import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { supabaseAdmin } from '../lib/supabase.js';

const BUCKET = 'document-parser-artifacts';
const MAX_ASSETS = 500;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export type IncomingVisualAsset = {
  assetKey: string; sourceItemRef: string; readingOrder: number; pageNumber: number; bbox: number[] | null;
  coordOrigin: string | null; caption: string | null; mimeType: 'image/png';
  width: number; height: number; sha256: string; content: Buffer;
};

type AssetRow = { id: string; checksum: string | null; storagePath: string };
type Tx = {
  documentParseRun: { findUnique(args: unknown): Promise<{ id: string; documentId: string } | null> };
  documentVisualAsset: {
    findUnique(args: unknown): Promise<AssetRow | null>;
    upsert(args: unknown): Promise<{ id: string }>;
  };
};
type Database = { $transaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T> };
type Storage = {
  upload(path: string, body: Buffer, options: { contentType: string; upsert: boolean }): Promise<{ error: unknown | null }>;
  remove(paths: string[]): Promise<{ error: unknown | null }>;
};

export class DocumentVisualAssetRepository {
  constructor(
    private readonly database: Database = prisma as unknown as Database,
    private readonly storage: Storage = supabaseAdmin.storage.from(BUCKET) as unknown as Storage,
  ) {}

  async persistVisualParseRun(input: {
    documentId: string; parseRunId: string; docHash: string; assets: IncomingVisualAsset[];
  }): Promise<{ parseRunId: string; assetIdsByKey: Record<string, string> }> {
    validateInput(input);
    const candidatePaths = input.assets.map((asset) => buildPath(input.documentId, input.parseRunId, asset));
    const preexisting = new Set<string>();
    const uploaded: string[] = [];
    try {
      // Reuse already persisted assets without rewriting their private objects.
      await this.database.$transaction(async (tx) => {
        const run = await tx.documentParseRun.findUnique({ where: { id: input.parseRunId }, select: { id: true, documentId: true } });
        if (!run || run.documentId !== input.documentId) throw new Error('Parse run não encontrado ou pertence a outro documento.');
        for (const asset of input.assets) {
          const existing = await tx.documentVisualAsset.findUnique({ where: {
            documentId_parseRunId_sourceKey: {
              documentId: input.documentId, parseRunId: input.parseRunId, sourceKey: asset.assetKey,
            },
          } });
          if (existing) {
            if (existing.checksum !== asset.sha256) throw new Error('A chave do asset já existe com outro hash.');
            preexisting.add(asset.assetKey);
          }
        }
      });

      for (const [index, asset] of input.assets.entries()) {
        if (preexisting.has(asset.assetKey)) continue;
        const path = candidatePaths[index]!;
        const result = await this.storage.upload(path, asset.content, {
          contentType: 'image/png', upsert: true,
        });
        if (result.error) throw new Error('Falha ao guardar imagem extraída no Storage privado.');
        uploaded.push(path);
      }

      const assetIdsByKey = await this.database.$transaction(async (tx) => {
        const run = await tx.documentParseRun.findUnique({ where: { id: input.parseRunId }, select: { id: true, documentId: true } });
        if (!run || run.documentId !== input.documentId) throw new Error('Parse run não encontrado ou pertence a outro documento.');
        const result: Record<string, string> = {};
        for (const [index, asset] of input.assets.entries()) {
          const path = candidatePaths[index]!;
          const row = await tx.documentVisualAsset.upsert({
            where: { documentId_parseRunId_sourceKey: {
              documentId: input.documentId, parseRunId: input.parseRunId, sourceKey: asset.assetKey,
            } },
            create: {
              id: randomUUID(), documentId: input.documentId, parseRunId: input.parseRunId,
              sourceKey: asset.assetKey, pageNumber: asset.pageNumber, assetType: 'figure',
              storagePath: path, mimeType: asset.mimeType, width: asset.width, height: asset.height,
              bbox: asset.bbox, checksum: asset.sha256,
              metadata: { sourceItemRef: asset.sourceItemRef, readingOrder: asset.readingOrder, coordOrigin: asset.coordOrigin, caption: asset.caption, docHash: input.docHash },
            },
            update: { checksum: asset.sha256, storagePath: path, width: asset.width, height: asset.height,
              pageNumber: asset.pageNumber, bbox: asset.bbox,
              metadata: { sourceItemRef: asset.sourceItemRef, readingOrder: asset.readingOrder, coordOrigin: asset.coordOrigin, caption: asset.caption, docHash: input.docHash } },
            select: { id: true },
          });
          result[asset.assetKey] = row.id;
        }
        return result;
      });
      return { parseRunId: input.parseRunId, assetIdsByKey };
    } catch (error) {
      if (uploaded.length) await this.storage.remove(uploaded).catch(() => undefined);
      throw error;
    }
  }
}

export function buildPath(documentId: string, parseRunId: string, asset: Pick<IncomingVisualAsset, 'assetKey' | 'sha256'>) {
  return `${documentId}/${parseRunId}/assets/${asset.assetKey}-${asset.sha256}.png`;
}

function validateInput(input: { documentId: string; parseRunId: string; docHash: string; assets: IncomingVisualAsset[] }) {
  if (!isUuid(input.documentId) || !isUuid(input.parseRunId) || !/^[a-f0-9]{64}$/.test(input.docHash)) {
    throw new Error('Identificadores ou hash inválidos para persistir assets visuais.');
  }
  if (input.assets.length > MAX_ASSETS) throw new Error('O pacote contém imagens acima do limite permitido.');
  const seen = new Set<string>();
  for (const asset of input.assets) {
    if (!/^[a-f0-9]{32}$/.test(asset.assetKey) || seen.has(asset.assetKey)
        || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.pageNumber) || asset.pageNumber < 1
        || asset.mimeType !== 'image/png' || asset.width < 1 || asset.width > 4096 || asset.height < 1 || asset.height > 4096
        || asset.content.length > MAX_ASSET_BYTES
        || createHash('sha256').update(asset.content).digest('hex') !== asset.sha256
        || !asset.content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error('Metadados ou bytes de imagem inválidos.');
    }
    seen.add(asset.assetKey);
  }
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

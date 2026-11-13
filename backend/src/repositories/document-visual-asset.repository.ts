import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { supabaseAdmin } from '../lib/supabase.js';

const BUCKET = 'document-parser-artifacts';
const MAX_ASSETS = 500;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export type IncomingVisualAsset = {
  assetKind: 'FIGURE' | 'PAGE';
  assetKey: string; sourceItemRef: string; readingOrder: number; pageNumber: number; bbox: number[] | null;
  coordOrigin: string | null; caption: string | null; mimeType: 'image/png';
  width: number; height: number; sha256: string; content: Buffer;
};

type AssetRow = { id: string; sourceKey: string; checksum: string | null; storagePath: string };
type Tx = {
  documentParseRun: { findUnique(args: unknown): Promise<{ id: string; documentId: string } | null> };
  documentVisualAsset: {
    findMany(args: unknown): Promise<AssetRow[]>;
  };
  $executeRaw(query: Prisma.Sql): Promise<number>;
};
type Database = {
  $transaction<T>(callback: (tx: Tx) => Promise<T>): Promise<T>;
};
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
    // Reuse already persisted assets without rewriting their private objects.
    await this.database.$transaction(async (tx) => {
        const run = await tx.documentParseRun.findUnique({ where: { id: input.parseRunId }, select: { id: true, documentId: true } });
        if (!run || run.documentId !== input.documentId) throw new Error('Parse run não encontrado ou pertence a outro documento.');
        const existingRows = await tx.documentVisualAsset.findMany({
          where: { documentId: input.documentId, parseRunId: input.parseRunId, sourceKey: { in: input.assets.map((asset) => asset.assetKey) } },
          select: { id: true, sourceKey: true, checksum: true, storagePath: true },
        });
        const assetsByKey = new Map(input.assets.map((asset) => [asset.assetKey, asset]));
        for (const existing of existingRows) {
          const asset = assetsByKey.get(existing.sourceKey);
          if (!asset) continue;
          if (existing.checksum !== asset.sha256) throw new Error('A chave do asset já existe com outro hash.');
          if (existing.storagePath === buildPath(input.documentId, input.parseRunId, asset)) preexisting.add(asset.assetKey);
        }
    });

    for (const [index, asset] of input.assets.entries()) {
        if (preexisting.has(asset.assetKey)) continue;
        const path = candidatePaths[index]!;
        const result = await this.storage.upload(path, asset.content, {
          contentType: 'image/png', upsert: true,
        });
        if (result.error) throw new Error('Falha ao guardar imagem extraída no Storage privado.');
    }

    const assetIdsByKey = await this.database.$transaction(async (tx) => {
        const run = await tx.documentParseRun.findUnique({ where: { id: input.parseRunId }, select: { id: true, documentId: true } });
        if (!run || run.documentId !== input.documentId) throw new Error('Parse run não encontrado ou pertence a outro documento.');
        if (input.assets.length) {
          const rows = input.assets.map((asset) => ({
              id: randomUUID(), documentId: input.documentId, parseRunId: input.parseRunId,
              sourceKey: asset.assetKey, pageNumber: asset.pageNumber, assetType: asset.assetKind.toLowerCase(),
              storagePath: buildPath(input.documentId, input.parseRunId, asset), mimeType: asset.mimeType,
              width: asset.width, height: asset.height, bbox: asset.bbox, checksum: asset.sha256,
              metadata: { sourceItemRef: asset.sourceItemRef, readingOrder: asset.readingOrder, coordOrigin: asset.coordOrigin, caption: asset.caption, docHash: input.docHash, assetKind: asset.assetKind },
          }));
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "document_visual_assets" (
              "id", "document_id", "parse_run_id", "source_key", "page_number", "asset_type",
              "storage_path", "mime_type", "width", "height", "bbox", "checksum", "metadata"
            )
            SELECT
              (asset->>'id')::uuid,
              (asset->>'documentId')::uuid,
              (asset->>'parseRunId')::uuid,
              asset->>'sourceKey',
              (asset->>'pageNumber')::integer,
              asset->>'assetType',
              asset->>'storagePath',
              asset->>'mimeType',
              (asset->>'width')::integer,
              (asset->>'height')::integer,
              NULLIF(asset->>'bbox', 'null')::jsonb,
              asset->>'checksum',
              asset->'metadata'
            FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb) AS source(asset)
            ON CONFLICT ("document_id", "parse_run_id", "source_key") DO UPDATE SET
              "page_number" = EXCLUDED."page_number",
              "asset_type" = EXCLUDED."asset_type",
              "storage_path" = EXCLUDED."storage_path",
              "mime_type" = EXCLUDED."mime_type",
              "width" = EXCLUDED."width",
              "height" = EXCLUDED."height",
              "bbox" = EXCLUDED."bbox",
              "checksum" = EXCLUDED."checksum",
              "metadata" = EXCLUDED."metadata"
            WHERE "document_visual_assets"."checksum" = EXCLUDED."checksum"
          `);
        }
        const rows = await tx.documentVisualAsset.findMany({
          where: { documentId: input.documentId, parseRunId: input.parseRunId, sourceKey: { in: input.assets.map((asset) => asset.assetKey) } },
          select: { id: true, sourceKey: true, checksum: true, storagePath: true },
        });
        const rowsByKey = new Map(rows.map((row) => [row.sourceKey, row]));
        const result: Record<string, string> = {};
        for (const asset of input.assets) {
          const row = rowsByKey.get(asset.assetKey);
          if (!row) throw new Error('Não foi possível confirmar a persistência de todos os assets visuais.');
          if (row.checksum !== asset.sha256) throw new Error('A chave do asset já existe com outro hash.');
          result[asset.assetKey] = row.id;
        }
        return result;
    });
    return { parseRunId: input.parseRunId, assetIdsByKey };
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
    if (!['FIGURE', 'PAGE'].includes(asset.assetKind)
        || !/^[a-f0-9]{32}$/.test(asset.assetKey) || seen.has(asset.assetKey)
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

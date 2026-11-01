import { prisma } from '../lib/prisma.js';
import { supabaseAdmin } from '../lib/supabase.js';
import type { VisualIndexAsset, VisualIndexRecord } from '../worker/services/document-visual-indexing.service.js';

const BUCKET = 'document-parser-artifacts';

type Storage = {
  download(path: string): Promise<{ data: Blob | null; error: unknown | null }>;
};

export class DocumentVisualIndexRepository {
  constructor(
    private readonly database = prisma,
    private readonly storage: Storage = supabaseAdmin.storage.from(BUCKET) as unknown as Storage,
  ) {}

  async findForIndexing(assetId: string): Promise<VisualIndexAsset | null> {
    const asset = await this.database.documentVisualAsset.findUnique({
      where: { id: assetId },
      select: { id: true, documentId: true, pageNumber: true, mimeType: true, storagePath: true },
    });
    if (!asset) return null;
    const { data, error } = await this.storage.download(asset.storagePath);
    if (error || !data) throw new Error('Falha ao ler a imagem do Storage privado para indexação.');
    return { id: asset.id, documentId: asset.documentId, pageNumber: asset.pageNumber, mimeType: asset.mimeType, bytes: Buffer.from(await data.arrayBuffer()) };
  }

  async saveIndex(assetId: string, record: VisualIndexRecord) {
    await this.database.documentVisualAssetIndex.upsert({
      where: { visualAssetId: assetId },
      create: {
        visualAssetId: assetId,
        description: record.description,
        descriptionStatus: record.status,
        descriptionModel: record.model,
        descriptionVersion: record.version,
        embeddingModel: record.embeddingModel ?? null,
        embeddingVersion: record.embedding ? 'document-visual-embedding-v1' : null,
        errorCode: record.errorCode,
      },
      update: {
        description: record.description ?? undefined,
        descriptionStatus: record.status,
        descriptionModel: record.model ?? undefined,
        descriptionVersion: record.version ?? undefined,
        embeddingModel: record.embeddingModel ?? null,
        embeddingVersion: record.embedding ? 'document-visual-embedding-v1' : null,
        errorCode: record.errorCode ?? null,
      },
    });
    if (record.embedding) {
      await this.database.$executeRaw`
        UPDATE document_visual_asset_indexes
        SET embedding = ${JSON.stringify(record.embedding)}::extensions.vector,
            embedding_model = ${record.embeddingModel ?? 'configured-default'},
            updated_at = NOW()
        WHERE visual_asset_id = ${assetId}::uuid
      `;
    } else {
      await this.database.$executeRaw`
        UPDATE document_visual_asset_indexes
        SET embedding = NULL, updated_at = NOW()
        WHERE visual_asset_id = ${assetId}::uuid
      `;
    }
  }
}

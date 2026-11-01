import { env } from '../../config/env.js';
import { OpenRouterClient } from '../client/openrouter.client.js';
import { DocumentVisualIndexRepository } from '../../repositories/document-visual-index.repository.js';

export type VisualDescription = {
  description: string;
  model: string;
  version: string;
};

export type VisualIndexAsset = {
  id: string;
  documentId: string;
  pageNumber: number;
  mimeType: string | null;
  bytes: Buffer;
};

export type VisualIndexRecord = {
  status: 'READY' | 'FAILED_RETRYABLE';
  description?: string;
  model?: string;
  version?: string;
  embedding?: number[];
  embeddingModel?: string;
  errorCode?: string;
};

export type DocumentVisualIndexingDependencies = {
  assets: {
    findForIndexing(assetId: string): Promise<VisualIndexAsset | null>;
    saveIndex(assetId: string, record: VisualIndexRecord): Promise<void>;
  };
  vision: { describe(input: VisualIndexAsset): Promise<VisualDescription> };
  embeddings: { createEmbeddings(input: string[]): Promise<number[][]> };
};

const MAX_DESCRIPTION_CHARS = 2_000;
const MAX_EMBEDDING_INPUT_CHARS = 4_000;

export class DocumentVisualIndexingService {
  constructor(private readonly dependencies: DocumentVisualIndexingDependencies = createDefaultDependencies()) {}

  async describeAndIndexAsset(assetId: string): Promise<{
    descriptionStatus: 'READY';
    visualChunkId: string;
  }> {
    const asset = await this.dependencies.assets.findForIndexing(assetId);
    if (!asset) throw new Error(`Imagem visual não encontrada: ${assetId}`);

    try {
      const result = await this.dependencies.vision.describe(asset);
      const description = result.description.trim();
      if (!description || description.length > MAX_DESCRIPTION_CHARS) {
        throw new Error('A descrição visual está vazia ou ultrapassa o limite permitido.');
      }

      const searchableText = [
        `Figura do documento ${asset.documentId}, página ${asset.pageNumber}.`,
        description,
      ].join('\n');
      if (searchableText.length > MAX_EMBEDDING_INPUT_CHARS) {
        throw new Error('O texto de indexação visual ultrapassa o limite permitido.');
      }
      const [embedding] = await this.dependencies.embeddings.createEmbeddings([searchableText]);
      if (!embedding?.length) throw new Error('O embedding da descrição visual não foi retornado.');

      await this.dependencies.assets.saveIndex(asset.id, {
        status: 'READY',
        description,
        model: result.model,
        version: result.version,
        embedding,
        embeddingModel: env.OPENROUTER_EMBEDDING_MODEL,
      });
      return { descriptionStatus: 'READY', visualChunkId: asset.id };
    } catch (error) {
      await this.dependencies.assets.saveIndex(asset.id, {
        status: 'FAILED_RETRYABLE',
        errorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      });
      throw error;
    }
  }
}

function createDefaultDependencies(): DocumentVisualIndexingDependencies {
  const repository = new DocumentVisualIndexRepository();
  const client = new OpenRouterClient();
  return {
    assets: repository,
    vision: {
      async describe(asset) {
        return client.describeVisualAsset({ imageBase64: asset.bytes.toString('base64'), mimeType: asset.mimeType ?? 'image/png', pageNumber: asset.pageNumber });
      },
    },
    embeddings: client,
  };
}

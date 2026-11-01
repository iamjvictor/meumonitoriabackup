import type { OpenRouterClient, ChatCompletionResult, ChatMessage } from '../../../worker/client/openrouter.client.js';
import type { ChatGenerationPort } from '../ports/chat-generation.port.js';
import type { ChatGenerationInput, ChatPromptMessage } from '../models/chat-generation.model.js';
import { ChatPromptBuilder } from '../services/chat-prompt.builder.js';
import { ChatVisualImageLoader } from '../rag/services/chat-visual-image-loader.service.js';

type ChatClient = Pick<OpenRouterClient, 'createChatCompletion'>;

export type OpenRouterChatGatewayConfig = {
  model: string;
  imageModel?: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
};

export class ChatGenerationError extends Error {
  constructor(
    readonly code: 'CHAT_GENERATION_FAILED' | 'CHAT_GENERATION_TIMEOUT' | 'CHAT_GENERATION_EMPTY',
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export class OpenRouterChatGateway implements ChatGenerationPort {
  constructor(
    private readonly client: ChatClient,
    private readonly promptBuilder = new ChatPromptBuilder(),
    private readonly config: OpenRouterChatGatewayConfig,
    private readonly visualImageLoader: Pick<ChatVisualImageLoader, 'load'> = new ChatVisualImageLoader(),
  ) {}

  async generate(input: ChatGenerationInput) {
    const messages: ChatMessage[] = this.promptBuilder.build(input).map((message) => ({ ...message }));
    const visualImages = input.visualContext?.images ?? [];
    let model = this.config.model;
    if (visualImages.length > 0) {
      if (!this.config.imageModel) throw new ChatGenerationError('CHAT_GENERATION_FAILED', 'O modelo visual do chat não está configurado.');
      model = this.config.imageModel;
      let loaded: Awaited<ReturnType<ChatVisualImageLoader['load']>>;
      try {
        loaded = await this.visualImageLoader.load(visualImages, {
          studentId: input.studentId,
          teacherId: input.teacherId,
          monitorId: input.monitorId,
          subjectId: input.subjectId,
        });
      } catch (error) {
        console.error('Falha ao carregar imagens autorizadas para o chat', {
          event: 'chat.visual_image_load_failed', requestId: input.requestId ?? null,
          imageCount: visualImages.length, errorType: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
        });
        loaded = { images: [], omittedCount: visualImages.length, totalBytes: 0 };
      }
      const lastMessage = messages.at(-1);
      if (lastMessage?.role !== 'user' || typeof lastMessage.content !== 'string') {
        throw new ChatGenerationError('CHAT_GENERATION_FAILED', 'Não foi possível preparar o contexto visual do chat.');
      }
      if (loaded.images.length > 0) {
        const text = `${lastMessage.content}\n\n[IMAGENS VISUAIS ANEXADAS]${loaded.omittedCount ? `\n${loaded.omittedCount} imagem(ns) não pôde(ram) ser anexada(s); não afirme que viu o que não recebeu.` : ''}`;
        lastMessage.content = [
          { type: 'text', text },
          ...loaded.images.map((image) => ({ type: 'image_url' as const, image_url: { url: image.dataUrl } })),
        ];
      } else {
        lastMessage.content = `${lastMessage.content}\n\n[Imagem não pôde ser anexada. Não afirme que a viu; explique essa limitação e peça o reenvio se necessário.]`;
      }
      console.log('Payload multimodal do chat preparado', {
        event: 'chat.multimodal_payload_prepared', requestId: input.requestId ?? null,
        requestedImageCount: visualImages.length, attachedImageCount: loaded.images.length,
        omittedImageCount: loaded.omittedCount, imageBytes: loaded.totalBytes,
        attachedAssets: loaded.images.map(({ assetId, sha256 }) => ({ assetId, sha256 })), model,
      });
    }

    try {
      const response = await this.client.createChatCompletion({
        messages,
        model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        timeoutMs: this.config.timeoutMs,
      });

      return { content: normalizeResponse(response) };
    } catch (error) {
      if (error instanceof ChatGenerationError) throw error;
      if (isTimeoutError(error)) {
        throw new ChatGenerationError(
          'CHAT_GENERATION_TIMEOUT',
          'A geração da resposta excedeu o tempo limite.',
          error,
        );
      }
      if (isEmptyResponseError(error)) {
        throw new ChatGenerationError(
          'CHAT_GENERATION_EMPTY',
          'A IA não retornou uma resposta válida.',
          error,
        );
      }
      throw new ChatGenerationError(
        'CHAT_GENERATION_FAILED',
        'Não foi possível gerar a resposta do chat.',
        error,
      );
    }
  }
}

function normalizeResponse(response: ChatCompletionResult) {
  const content = response.content.trim();
  if (!content) {
    throw new ChatGenerationError('CHAT_GENERATION_EMPTY', 'A IA não retornou uma resposta válida.');
  }
  return content;
}

function isTimeoutError(error: unknown) {
  return isStructuredErrorWithCode(error, 'TIMEOUT');
}

function isEmptyResponseError(error: unknown) {
  return isStructuredErrorWithCode(error, 'EMPTY_RESPONSE');
}

function isStructuredErrorWithCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === code);
}

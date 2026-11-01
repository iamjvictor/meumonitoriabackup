import { ChatImageAttachmentRepository } from '../repositories/chat-image-attachment.repository.js';

export class ChatImageCleanupService {
  constructor(private readonly repository = new ChatImageAttachmentRepository()) {}

  async deleteExpired(now = new Date(), batchSize = 100) {
    const result = await this.repository.deleteExpiredBatch(now, batchSize);
    console.log('Limpeza de anexos de imagem do chat concluída', {
      event: 'chat.image_attachments_cleanup_completed',
      selectedCount: result.selected,
      deletedCount: result.deleted,
    });
    return result;
  }
}

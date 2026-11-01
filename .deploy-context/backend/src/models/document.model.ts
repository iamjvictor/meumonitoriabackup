import { z } from 'zod';

export const documentTagSchema = z.enum(['knowledge', 'questions', 'flashcards']);

export const uploadDocumentSchema = z.object({
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().optional(),
  tag: documentTagSchema,
}).refine((input) => input.tag === 'knowledge' || Boolean(input.topicId), {
  path: ['topicId'],
  message: 'Tópico obrigatório para questões e flashcards.',
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const documentTagToDatabase = {
  knowledge: 'KNOWLEDGE_BASE',
  questions: 'QUESTIONS',
  flashcards: 'FLASHCARDS',
} as const;

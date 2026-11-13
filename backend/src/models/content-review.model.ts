import { z } from 'zod';

const reviewStatusSchema = z.enum(['APPROVED', 'REJECTED', 'PENDING_REVIEW']);

export const questionReviewSchema = z.object({
  status: reviewStatusSchema.optional(),
  subjectId: z.string().uuid().nullable().optional(),
  primaryTopicId: z.string().uuid().nullable().optional(),
  text: z.string().trim().min(1).max(20000).optional(),
  alternatives: z.array(z.object({ label: z.string().min(1).max(10), text: z.string().min(1).max(5000) })).max(10).optional(),
  correctAnswer: z.string().trim().min(1).max(1000).nullable().optional(),
  explanation: z.string().trim().max(10000).nullable().optional(),
});

export const flashcardReviewSchema = z.object({
  status: reviewStatusSchema.optional(),
  front: z.string().trim().min(1).max(2000).optional(),
  back: z.string().trim().min(1).max(10000).optional(),
});

export const manualFlashcardSchema = z.object({
  topicId: z.string().uuid(),
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(10000),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
}).strict();

export type QuestionReviewInput = z.infer<typeof questionReviewSchema>;
export type FlashcardReviewInput = z.infer<typeof flashcardReviewSchema>;
export type ManualFlashcardInput = z.infer<typeof manualFlashcardSchema>;

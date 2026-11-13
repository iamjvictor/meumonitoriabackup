import dotenv from 'dotenv';
import { z } from 'zod';

// No desenvolvimento, o .env do projeto prevalece sobre variáveis antigas do
// terminal. Testes e produção preservam valores injetados, como URLs isoladas.
dotenv.config({ override: process.env.NODE_ENV === 'development' });

export function isValidAsaasCredentialEncryptionKey(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return false;
  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url().refine((value) => !value.includes('/rest/v1'), {
    message: 'SUPABASE_URL deve ser a URL raiz do projeto, sem /rest/v1',
  }),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url().optional(),
  PUBLIC_FRONT_URL: z.string().url().optional(),
  DOCUMENT_INGESTION_V3_ENABLED: z.preprocess((value) => value === 'true', z.boolean()).default(false),
  DOCUMENT_PARSER_BASE_URL: z.string().url().optional(),
  DOCUMENT_PARSER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  DOCUMENT_TEXT_SOURCE: z.enum(['pdfjs', 'docling', 'auto']).default('pdfjs'),
  DOCUMENT_EXTRACTION_CONTENT_LOG_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  DOCUMENT_EXTRACTION_CONTENT_LOG_MAX_CHARS: z.coerce.number().int().positive().max(50_000).default(2_000),
  DOCUMENT_CHUNKER_BASE_URL: z.string().url().optional(),
  DOCUMENT_CHUNKER_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  DOCUMENT_CHUNKER_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),
  KNOWLEDGE_BATCH_PROCESSING_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  KNOWLEDGE_BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(10),
  KNOWLEDGE_BATCH_TIMEOUT_MS: z.coerce.number().int().min(2_000).max(7_200_000).default(600_000),
  KNOWLEDGE_DOC_TIMEOUT_SECONDS: z.coerce.number().positive().max(7200).default(540),
  KNOWLEDGE_DO_OCR: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  KNOWLEDGE_FORMULA_ENRICHMENT: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  KNOWLEDGE_TABLE_STRUCTURE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  KNOWLEDGE_OCR_SCALE: z.coerce.number().positive().max(8).default(3),
  KNOWLEDGE_IMAGES_SCALE: z.coerce.number().positive().max(8).default(1),
  KNOWLEDGE_NUM_THREADS: z.coerce.number().int().min(1).max(64).default(4),
  KNOWLEDGE_DOCUMENT_BUDGET_SECONDS: z.coerce.number().int().positive().default(14_400),
  KNOWLEDGE_BATCH_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(2).default(2),
  KNOWLEDGE_BATCH_RETRY_DELAY_MS: z.coerce.number().int().positive().default(30_000),
  KNOWLEDGE_BATCH_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(660_000),
  KNOWLEDGE_BATCH_SERVICE_TOKEN: z.string().optional(),
  DOCUMENT_VISUAL_ASSETS_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  DOCUMENT_VISUAL_DESCRIPTION_MODEL: z.string().min(1).default('google/gemini-2.5-flash'),
  CHAT_IMAGE_INPUT_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  CHAT_IMAGE_MODEL: z.string().min(1).default('google/gemini-2.5-flash'),
  DOCUMENT_PARSER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(1),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  AI_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high']).default('low'),
  OPENROUTER_EMBEDDING_MODEL: z.string().min(1),
  OPENROUTER_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(2048),
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().positive().max(256).default(64),
  RAG_PARENT_CHUNK_TARGET_TOKENS: z.coerce.number().int().positive().default(900),
  RAG_PARENT_CHUNK_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
  RAG_CHILD_CHUNK_TARGET_TOKENS: z.coerce.number().int().positive().default(350),
  RAG_CHILD_CHUNK_MAX_TOKENS: z.coerce.number().int().positive().default(500),
  RAG_CHILD_CHUNK_OVERLAP_TOKENS: z.coerce.number().int().positive().default(50),
  EMBEDDING_MIN_TOKENS: z.coerce.number().int().positive().default(40),
  EMBEDDING_MIN_CHARS: z.coerce.number().int().positive().default(180),
  OPENROUTER_QUESTION_MODEL: z.string().min(1),
  OPENROUTER_STRUCTURED_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CHAT_AI_MODEL: z.string().min(1).optional(),
  CHAT_AI_MAX_TOKENS: z.coerce.number().int().positive().default(600),
  CHAT_AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  CHAT_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  FLASHCARD_GENERATION_MODEL: z.string().min(1).default('openai/gpt-5-mini'),
  FLASHCARD_GENERATION_FALLBACK_MODEL: z.string().min(1).nullable().optional().default('google/gemini-3.7-flash'),
  QUESTION_EXTRACTION_MODEL: z.string().min(1).optional(),
  QUESTION_EXTRACTION_INPUT_MAX_TOKENS: z.coerce.number().int().positive().default(100000),
  QUESTION_EXTRACTION_MAX_TOKENS: z.coerce.number().int().positive().default(16000),
  QUESTION_EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  QUESTION_EXTRACTION_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high']).default('none'),
  QUESTION_EXTRACTION_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  QUESTION_SOURCE_RECONSTRUCTION_MODEL: z.string().min(1).optional(),
  QUESTION_SOURCE_RECONSTRUCTION_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
  QUESTION_SOURCE_RECONSTRUCTION_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  QUESTION_COMPLETION_MODEL: z.string().min(1).default('gpt-5.4-mini'),
  QUESTION_CATEGORIZE_MODEL: z.string().min(1).optional(),
  QUESTION_CATEGORIZE_MAX_TOKENS: z.coerce.number().int().positive().default(256),
  QUESTION_CATEGORIZE_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  TOPIC_PROFILE_MODEL: z.string().min(1).optional(),
  TOPIC_PROFILE_MAX_TOKENS: z.coerce.number().int().positive().default(1200),
  TOPIC_PROFILE_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  QUESTION_ALTERNATIVES_MODEL: z.string().min(1).optional(),
  QUESTION_ALTERNATIVES_MAX_TOKENS: z.coerce.number().int().positive().default(300),
  QUESTION_ALTERNATIVES_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.6),
  QUESTION_ANSWER_MODEL: z.string().min(1).optional(),
  QUESTION_ANSWER_MAX_TOKENS: z.coerce.number().int().positive().default(400),
  QUESTION_ANSWER_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  QUESTION_EXPLANATION_MODEL: z.string().min(1).optional(),
  QUESTION_EXPLANATION_MAX_TOKENS: z.coerce.number().int().positive().default(350),
  QUESTION_EXPLANATION_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  QUESTION_QUALITY_REVIEW_MODEL: z.string().min(1).optional(),
  QUESTION_QUALITY_REVIEW_MAX_TOKENS: z.coerce.number().int().positive().default(800),
  QUESTION_QUALITY_REVIEW_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  DOCUMENT_BLOCK_TOPIC_CLASSIFICATION_MODEL: z.string().min(1).optional(),
  QUESTION_COMPLETION_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),
  QUESTION_COMPLETION_MAX_TOKENS: z.coerce.number().int().positive().default(700),
  QUESTION_COMPLETION_FALLBACK_MODEL: z.string().optional().default(''),
  ENABLE_PAID_STRUCTURED_FALLBACK: z.enum(['true', 'false']).default('true'),
  BLOCK_TOPIC_CLASSIFICATION_MAX_TOKENS: z.coerce.number().int().positive().default(3000),
  DOCUMENT_BLOCK_TOPIC_CLASSIFICATION_MAX_TOKENS: z.coerce.number().int().positive().optional(),
  DOCUMENT_BLOCK_TOPIC_CLASSIFICATION_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  BLOCK_TOPIC_CLASSIFICATION_BATCH_SIZE: z.coerce.number().int().positive().max(20).default(20),
  QUESTION_CANDIDATE_CONCURRENCY: z.coerce.number().int().positive().max(8).default(3),
  FLASHCARD_GENERATION_CONCURRENCY: z.coerce.number().int().positive().max(8).default(3),
  CORS_ORIGINS: z.string().default(''),
  LOAD_TEST_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  PAYMENTS_PROVIDER: z.enum(['SIMULATED', 'ASAAS']).default('SIMULATED'),
  ASAAS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  ASAAS_API_KEY_SANDBOX: z.string().min(1).optional(),
  ASAAS_API_KEY: z.string().min(1).optional(),
  ASAAS_CREDENTIAL_ENCRYPTION_KEY: z.string().min(1).optional(),
  ASAAS_DASHBOARD_URL: z.string().url().default('https://www.asaas.com/login'),
  ASAAS_WEBHOOK_AUTH_TOKEN: z.string().min(32).max(255).optional(),
  ASAAS_WEBHOOK_URL: z.string().url().optional(),
  ASAAS_WEBHOOK_EMAIL: z.string().email().optional(),
  ASAAS_WEBHOOK_ID: z.string().optional(),
  PAYMENTS_RETURN_BASE_URL: z.string().url().optional(),
  ASAAS_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  PAYMENTS_SIMULATION_ENABLED: z.preprocess((value) => value === 'true', z.boolean()).default(false),
  PAYMENTS_TEST_PRICE_CENTS: z.coerce.number().int().positive().default(1990),
  EMAIL_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  EMAIL_OUTBOX_ENCRYPTION_KEY: z.string().optional(),
  EMAIL_SANDBOX_ALLOWED_RECIPIENTS: z.string().default(''),
}).superRefine((value, context) => {
  if (value.EMAIL_ENABLED) {
    if (!value.RESEND_API_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY é obrigatória quando EMAIL_ENABLED=true' });
    if (!value.RESEND_WEBHOOK_SECRET) context.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_WEBHOOK_SECRET'], message: 'RESEND_WEBHOOK_SECRET é obrigatória quando EMAIL_ENABLED=true' });
    if (!value.EMAIL_FROM) context.addIssue({ code: z.ZodIssueCode.custom, path: ['EMAIL_FROM'], message: 'EMAIL_FROM é obrigatória quando EMAIL_ENABLED=true' });
    if (!value.EMAIL_OUTBOX_ENCRYPTION_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ['EMAIL_OUTBOX_ENCRYPTION_KEY'], message: 'EMAIL_OUTBOX_ENCRYPTION_KEY é obrigatória quando EMAIL_ENABLED=true' });
    else if (!isValidAsaasCredentialEncryptionKey(value.EMAIL_OUTBOX_ENCRYPTION_KEY)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['EMAIL_OUTBOX_ENCRYPTION_KEY'], message: 'EMAIL_OUTBOX_ENCRYPTION_KEY deve ser Base64 de exatamente 32 bytes' });
    if (!value.PUBLIC_FRONT_URL) context.addIssue({ code: z.ZodIssueCode.custom, path: ['PUBLIC_FRONT_URL'], message: 'PUBLIC_FRONT_URL é obrigatória quando EMAIL_ENABLED=true' });
    if (value.ASAAS_ENV === 'sandbox' && !value.EMAIL_SANDBOX_ALLOWED_RECIPIENTS.split(',').map((item) => item.trim()).filter(Boolean).length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['EMAIL_SANDBOX_ALLOWED_RECIPIENTS'], message: 'EMAIL_SANDBOX_ALLOWED_RECIPIENTS é obrigatória quando EMAIL_ENABLED=true e ASAAS_ENV=sandbox' });
  }
  if (value.DOCUMENT_TEXT_SOURCE !== 'pdfjs' && !value.DOCUMENT_CHUNKER_BASE_URL && !value.DOCUMENT_PARSER_BASE_URL) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['DOCUMENT_CHUNKER_BASE_URL'], message: 'DOCUMENT_CHUNKER_BASE_URL é obrigatória para DOCUMENT_TEXT_SOURCE=docling|auto' });
  }
  if (value.DOCUMENT_VISUAL_ASSETS_ENABLED && !value.DOCUMENT_CHUNKER_BASE_URL && !value.DOCUMENT_PARSER_BASE_URL) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['DOCUMENT_CHUNKER_BASE_URL'], message: 'DOCUMENT_CHUNKER_BASE_URL é obrigatória quando DOCUMENT_VISUAL_ASSETS_ENABLED=true' });
  }
  if (!value.ASAAS_CREDENTIAL_ENCRYPTION_KEY) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ASAAS_CREDENTIAL_ENCRYPTION_KEY'], message: 'ASAAS_CREDENTIAL_ENCRYPTION_KEY é obrigatória' });
  } else if (!isValidAsaasCredentialEncryptionKey(value.ASAAS_CREDENTIAL_ENCRYPTION_KEY)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ASAAS_CREDENTIAL_ENCRYPTION_KEY'], message: 'ASAAS_CREDENTIAL_ENCRYPTION_KEY deve ser Base64 de exatamente 32 bytes' });
  }
  const configuredAsaasApiKey = value.ASAAS_ENV === 'sandbox' ? value.ASAAS_API_KEY_SANDBOX : value.ASAAS_API_KEY;
  if (value.PAYMENTS_PROVIDER === 'ASAAS' && !configuredAsaasApiKey) {
    const keyName = value.ASAAS_ENV === 'sandbox' ? 'ASAAS_API_KEY_SANDBOX' : 'ASAAS_API_KEY';
    context.addIssue({ code: z.ZodIssueCode.custom, path: [keyName], message: `${keyName} é obrigatória quando PAYMENTS_PROVIDER=ASAAS e ASAAS_ENV=${value.ASAAS_ENV}` });
  }
  if (value.PAYMENTS_PROVIDER === 'ASAAS') {
    const returnBaseUrl = value.PAYMENTS_RETURN_BASE_URL ?? value.PUBLIC_FRONT_URL;
    if (!returnBaseUrl) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['PUBLIC_FRONT_URL'], message: 'PUBLIC_FRONT_URL ou PAYMENTS_RETURN_BASE_URL é obrigatória quando PAYMENTS_PROVIDER=ASAAS' });
    } else if (!returnBaseUrl.startsWith('https://')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['PUBLIC_FRONT_URL'], message: 'A URL de retorno do checkout Asaas deve usar HTTPS' });
    }
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const missingVariables = parsedEnv.error.issues
    .filter((issue) => issue.code === 'invalid_type')
    .map((issue) => issue.path.join('.'));

  throw new Error(
    missingVariables.length > 0
      ? `Configuracao incompleta. Crie backend/.env a partir de .env.example e preencha: ${missingVariables.join(', ')}`
      : `Configuracao invalida: ${parsedEnv.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
  );
}

export const env = parsedEnv.data;

const configuredCorsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const publicFrontOrigin = env.PUBLIC_FRONT_URL?.trim().replace(/\/+$/, '');

export function normalizeCorsOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export const corsOrigins = [...new Set([
  ...configuredCorsOrigins,
  ...(publicFrontOrigin ? [publicFrontOrigin] : []),
])];

export const corsAllowedHeaders = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Cookie',
  'Idempotency-Key',
  'X-Sponsored-Invitation-Token',
  'X-Simulated-Session',
  'ngrok-skip-browser-warning',
];

export function isCorsOriginAllowed(origin: string): boolean {
  const normalized = normalizeCorsOrigin(origin);
  return (
    corsOrigins.includes(normalized) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
  );
}

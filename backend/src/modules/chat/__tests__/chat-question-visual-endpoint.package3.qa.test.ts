import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const userId = '10000000-0000-4000-8000-000000000001';
const teacherId = '20000000-0000-4000-8000-000000000001';
const monitorId = '30000000-0000-4000-8000-000000000001';
const subjectId = '40000000-0000-4000-8000-000000000001';
const topicId = '50000000-0000-4000-8000-000000000001';
const questionId = '60000000-0000-4000-8000-000000000001';
const assetId = '70000000-0000-4000-8000-000000000001';
const privateImageBytes = Buffer.from('private-page-3-question-figure-bytes');

function configureEnvironment() {
  process.env.NODE_ENV = 'test'; process.env.HOST = '127.0.0.1'; process.env.PORT = '3000';
  process.env.SUPABASE_URL = 'http://127.0.0.1:56321'; process.env.SUPABASE_PUBLISHABLE_KEY = 'local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local'; process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:56322/postgres';
  process.env.REDIS_URL = 'redis://127.0.0.1:6379'; process.env.OPENROUTER_API_KEY = 'test';
  process.env.OPENROUTER_EMBEDDING_MODEL = 'test-embedding'; process.env.OPENROUTER_QUESTION_MODEL = 'test-chat';
  process.env.ASAAS_WEBHOOK_URL = 'http://localhost:3000/api/webhooks/asaas';
  process.env.CHAT_IMAGE_INPUT_ENABLED = 'true'; process.env.DOCUMENT_VISUAL_ASSETS_ENABLED = 'true';
  process.env.DOCUMENT_PARSER_BASE_URL = 'http://127.0.0.1:9000'; process.env.CHAT_IMAGE_MODEL = 'test-vision-model';
}

test('chat route authorizes approved question, sends exact private image bytes, and rejects mismatched scope', { concurrency: false }, async () => {
  configureEnvironment();
  const [{ default: Fastify }, { default: cookie }, { prisma }, { supabaseAuth, supabaseAdmin }, { chatHistoryRedis }, { OpenRouterClient }] = await Promise.all([
    import('fastify'), import('@fastify/cookie'), import('../../../lib/prisma.js'), import('../../../lib/supabase.js'),
    import('../infrastructure/chat-history.redis.js'), import('../../../worker/client/openrouter.client.js'),
  ]);
  const originals = {
    getUser: supabaseAuth.auth.getUser,
    from: supabaseAdmin.storage.from,
    teacherFindUnique: prisma.teacher.findUnique,
    studentFindUnique: prisma.student.findUnique,
    subjectFindFirst: prisma.monitorSubject.findFirst,
    questionFindFirst: prisma.question.findFirst,
    queryRaw: prisma.$queryRaw,
    assetFindFirst: prisma.documentVisualAsset.findFirst,
    redisMethods: Object.fromEntries(['get', 'set', 'lrange', 'rpush', 'ltrim', 'expire', 'del'].map((key) => [key, (chatHistoryRedis as any)[key]])),
    createChatCompletion: OpenRouterClient.prototype.createChatCompletion,
  };
  let receivedGatewayInput: any;
  let gatewayCalls = 0;
  let officialQuestionStatus = 'APPROVED';
  let officialQuestionMonitorId = monitorId;
  try {
    (supabaseAuth.auth as any).getUser = async () => ({ data: { user: { id: userId, email: 'teacher@qa.local', email_confirmed_at: new Date().toISOString(), user_metadata: {}, app_metadata: {} } }, error: null });
    (supabaseAdmin.storage as any).from = () => ({ download: async (path: string) => {
      assert.equal(path, 'private/question-figure.png');
      return { data: new Blob([privateImageBytes]), error: null };
    } });
    (prisma.teacher as any).findUnique = async () => ({ id: teacherId });
    (prisma.student as any).findUnique = async () => null;
    (prisma.monitorSubject as any).findFirst = async () => ({ id: subjectId, monitor: { teacherId } });
    (prisma.question as any).findFirst = async (args: any) => {
      if (args.where.status === 'APPROVED') return officialQuestionStatus === 'APPROVED'
        ? { id: questionId, monitorId: officialQuestionMonitorId, subjectId, topicId, text: 'Questão oficial sobre o gráfico', alternatives: [{ label: 'A', text: 'opção A' }] }
        : null;
      return {
        id: questionId, correctAnswer: 'A', correctAnswerConfidence: 0.99, explanation: 'Evidência de fixture.', explanationConfidence: 0.99,
        sources: [],
      };
    };
    (prisma as any).$queryRaw = async () => [{ assetId, page: 3, checksum: createHash('sha256').update(privateImageBytes).digest('hex'), description: 'Gráfico da questão.' }];
    (prisma.documentVisualAsset as any).findFirst = async (args: any) => {
      assert.equal(args.where.id, assetId);
      assert.deepEqual(args.where.document, { teacherId, monitorId, subjectId });
      return { storagePath: 'private/question-figure.png', mimeType: 'image/png', checksum: createHash('sha256').update(privateImageBytes).digest('hex') };
    };
    Object.assign(chatHistoryRedis, {
      get: async () => null, set: async () => 'OK', lrange: async () => [], rpush: async () => 1,
      ltrim: async () => 'OK', expire: async () => 1, del: async () => 1,
    });
    (OpenRouterClient.prototype as any).createChatCompletion = async (input: unknown) => {
      gatewayCalls += 1; receivedGatewayInput = input;
      return { content: 'A curva da figura cresce no trecho indicado.', usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 } };
    };

    const { chatRoutes } = await import('../chat.routes.js');
    const app = Fastify();
    await app.register(cookie);
    await app.register(chatRoutes);
    try {
      const authorized = await app.inject({
        method: 'POST', url: `/student/monitors/${monitorId}/chat/subjects/${subjectId}/messages`,
        headers: { authorization: 'Bearer qa-valid-token' },
        payload: {
          message: 'O que a imagem mostra?',
          questionContext: { questionId, monitorId, subjectId, topicId, statement: 'Questão oficial sobre o gráfico', options: [{ label: 'A', text: 'opção A' }] },
        },
      });
      assert.equal(authorized.statusCode, 200, authorized.body);
      assert.equal(gatewayCalls, 1);
      assert.equal(receivedGatewayInput.model, 'test-vision-model');
      const message = receivedGatewayInput.messages.at(-1);
      assert.equal(message.role, 'user');
      assert.ok(Array.isArray(message.content));
      const imagePart = message.content.find((part: any) => part.type === 'image_url');
      assert.ok(imagePart, 'gateway request must contain an image part, not only a textual asset reference');
      const encoded = imagePart.image_url.url as string;
      assert.match(encoded, /^data:image\/png;base64,/);
      const gatewayBytes = Buffer.from(encoded.slice(encoded.indexOf(',') + 1), 'base64');
      assert.deepEqual(gatewayBytes, privateImageBytes);
      assert.equal(createHash('sha256').update(gatewayBytes).digest('hex'), createHash('sha256').update(privateImageBytes).digest('hex'));

      officialQuestionStatus = 'PENDING_REVIEW';
      const pending = await app.inject({
        method: 'POST', url: `/student/monitors/${monitorId}/chat/subjects/${subjectId}/messages`,
        headers: { authorization: 'Bearer qa-valid-token' },
        payload: { message: 'Leia esta questão não aprovada.', questionContext: { questionId, monitorId, subjectId, topicId, statement: 'fora', options: [] } },
      });
      assert.equal(pending.statusCode, 403, pending.body);
      assert.equal(JSON.parse(pending.body).error, 'CHAT_QUESTION_CONTEXT_DENIED');
      assert.equal(gatewayCalls, 1, 'questão pendente não pode alcançar o gateway');

      officialQuestionStatus = 'APPROVED';
      officialQuestionMonitorId = '30000000-0000-4000-8000-000000000099';
      const foreignTenantQuestion = await app.inject({
        method: 'POST', url: `/student/monitors/${monitorId}/chat/subjects/${subjectId}/messages`,
        headers: { authorization: 'Bearer qa-valid-token' },
        payload: { message: 'Leia questão de outro monitor.', questionContext: { questionId, monitorId, subjectId, topicId, statement: 'fora', options: [] } },
      });
      assert.equal(foreignTenantQuestion.statusCode, 403, foreignTenantQuestion.body);
      assert.equal(JSON.parse(foreignTenantQuestion.body).error, 'CHAT_QUESTION_CONTEXT_DENIED');
      assert.equal(gatewayCalls, 1, 'questão do outro monitor não pode alcançar o gateway');
      officialQuestionMonitorId = monitorId;

      const denied = await app.inject({
        method: 'POST', url: `/student/monitors/${monitorId}/chat/subjects/${subjectId}/messages`,
        headers: { authorization: 'Bearer qa-valid-token' },
        payload: {
          message: 'Leia esta questão de outro escopo.',
          questionContext: { questionId, monitorId: '30000000-0000-4000-8000-000000000099', subjectId, topicId, statement: 'fora', options: [] },
        },
      });
      assert.equal(denied.statusCode, 403, denied.body);
      assert.equal(JSON.parse(denied.body).error, 'CHAT_QUESTION_CONTEXT_DENIED');
      assert.equal(gatewayCalls, 1, 'a pergunta fora do escopo não pode alcançar o gateway');
    } finally {
      await app.close();
    }
  } finally {
    (supabaseAuth.auth as any).getUser = originals.getUser;
    (supabaseAdmin.storage as any).from = originals.from;
    (prisma.teacher as any).findUnique = originals.teacherFindUnique;
    (prisma.student as any).findUnique = originals.studentFindUnique;
    (prisma.monitorSubject as any).findFirst = originals.subjectFindFirst;
    (prisma.question as any).findFirst = originals.questionFindFirst;
    (prisma as any).$queryRaw = originals.queryRaw;
    (prisma.documentVisualAsset as any).findFirst = originals.assetFindFirst;
    Object.assign(chatHistoryRedis, originals.redisMethods);
    (OpenRouterClient.prototype as any).createChatCompletion = originals.createChatCompletion;
    chatHistoryRedis.disconnect();
    await prisma.$disconnect();
  }
});

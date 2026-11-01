import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../../core/errors/app-error.js';
import { CreateSponsoredSeatBatchUseCase, SponsoredBatchValidationError } from '../application/commands/create-sponsored-seat-batch.use-case.js';
import type { AsaasSubscriptionProvider } from '../infrastructure/providers/asaas/asaas-subscription.provider.js';
import type { ClaimSponsoredSeatsUseCase } from '../application/commands/claim-sponsored-seats.use-case.js';
import { SponsoredSeatClaimError } from '../application/commands/claim-sponsored-seats.use-case.js';

const createBodySchema = z.object({
  monitorId: z.string().uuid(),
  interval: z.enum(['MONTHLY', 'ANNUAL']),
  billingType: z.enum(['PIX', 'CREDIT_CARD']),
  beneficiaryEmails: z.array(z.string().trim().email()).min(1).max(100),
  expectedTotalAmountCents: z.number().int().nonnegative().optional(),
}).strict();
// A cotação calcula apenas o valor por período e vagas; o método só é necessário ao criar o checkout.
const quoteBodySchema = createBodySchema.omit({ expectedTotalAmountCents: true, billingType: true });
const batchParamsSchema = z.object({ batchId: z.string().uuid() });
const updateBatchBodySchema = z.object({ beneficiaryEmails: z.array(z.string().trim().email()).min(1).max(100), expectedTotalAmountCents: z.number().int().nonnegative() }).strict();

type SponsoredSeatControllerRepository = {
  listForTeacher(teacherUserId: string): Promise<unknown[]>;
  findBatchForTeacher(teacherUserId: string, batchId: string): Promise<{ id: string; interval: string; status: string; providerSubscriptionId: string | null; currentPeriodEnd: Date | null } | null>;
  markCancelAtPeriodEnd(batchId: string): Promise<void>;
};

export class SponsoredSeatController {
  constructor(
    private readonly createBatch: CreateSponsoredSeatBatchUseCase,
    private readonly repository: SponsoredSeatControllerRepository,
    private readonly subscriptionProvider: Pick<AsaasSubscriptionProvider, 'cancelSubscription'>,
    private readonly returnBaseUrl: string,
    private readonly claimSeats?: ClaimSponsoredSeatsUseCase,
  ) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const user = this.requireTeacher(request);
    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 422, publicMessage: 'Confira o monitor, o plano e os e-mails dos alunos.' });
    const idempotencyKey = headerValue(request.headers['idempotency-key']);
    if (!idempotencyKey || idempotencyKey.trim().length < 8) throw new AppError({ code: 'IDEMPOTENCY_KEY_REQUIRED', statusCode: 422, publicMessage: 'A chave de idempotência é obrigatória.' });
    try {
      const data = await this.createBatch.execute(user.id, { ...parsed.data, idempotencyKey: idempotencyKey.trim(), returnBaseUrl: this.returnBaseUrl });
      return reply.code(201).send({ data });
    } catch (error) {
      if (error instanceof SponsoredBatchValidationError) throw mapValidationError(error.code);
      throw error;
    }
  }

  async quote(request: FastifyRequest, reply: FastifyReply) {
    const user = this.requireTeacher(request);
    const parsed = quoteBodySchema.safeParse(request.body);
    if (!parsed.success) throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 422, publicMessage: 'Confira o monitor, o plano e os e-mails dos alunos.' });
    try { return reply.send({ data: await this.createBatch.quote(user.id, parsed.data) }); }
    catch (error) {
      if (error instanceof SponsoredBatchValidationError) throw mapValidationError(error.code);
      throw error;
    }
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const user = this.requireTeacher(request);
    return reply.send({ data: await this.repository.listForTeacher(user.id) });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const user = this.requireTeacher(request);
    const params = batchParamsSchema.safeParse(request.params);
    const body = updateBatchBodySchema.safeParse(request.body);
    if (!params.success || !body.success) throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 422, publicMessage: 'Confira o lote e os e-mails dos alunos.' });
    try {
      return reply.send({ data: await this.createBatch.updatePending(user.id, params.data.batchId, { ...body.data, returnBaseUrl: this.returnBaseUrl }) });
    } catch (error) {
      if (error instanceof SponsoredBatchValidationError) throw mapValidationError(error.code);
      throw error;
    }
  }

  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const user = this.requireTeacher(request);
    const parsed = batchParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 422, publicMessage: 'Lote inválido.' });
    const batch = await this.repository.findBatchForTeacher(user.id, parsed.data.batchId);
    if (!batch) throw new AppError({ code: 'SPONSORED_BATCH_NOT_FOUND', statusCode: 404, publicMessage: 'Turma patrocinada não encontrada.' });
    if (batch.interval !== 'MONTHLY') throw new AppError({ code: 'ANNUAL_PLAN_NOT_CANCELLABLE', statusCode: 409, publicMessage: 'O plano anual termina ao fim do período pago.' });
    if (batch.status === 'CANCEL_PENDING') return reply.send({ data: { batchId: batch.id, status: batch.status, endsAt: batch.currentPeriodEnd?.toISOString() ?? null } });
    if (batch.status !== 'ACTIVE' || !batch.providerSubscriptionId) throw new AppError({ code: 'SPONSORED_BATCH_NOT_ACTIVE', statusCode: 409, publicMessage: 'Esta turma não tem uma assinatura mensal ativa para cancelar.' });
    try {
      await this.subscriptionProvider.cancelSubscription({ subscriptionId: batch.providerSubscriptionId });
      await this.repository.markCancelAtPeriodEnd(batch.id);
    } catch {
      throw new AppError({ code: 'PAYMENT_PROVIDER_ERROR', statusCode: 503, publicMessage: 'Não foi possível cancelar a renovação agora. Tente novamente.' });
    }
    return reply.send({ data: { batchId: batch.id, status: 'CANCEL_PENDING', endsAt: batch.currentPeriodEnd?.toISOString() ?? null } });
  }

  async claim(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) throw new AppError({ code: 'UNAUTHENTICATED', statusCode: 401, publicMessage: 'Sessão de aluno obrigatória.' });
    if (user.role?.toLowerCase() !== 'student') throw new AppError({ code: 'FORBIDDEN', statusCode: 403, publicMessage: 'Somente alunos podem vincular vagas patrocinadas.' });
    if (!this.claimSeats) throw new AppError({ code: 'INTERNAL_SERVER_ERROR', statusCode: 500, publicMessage: 'Não foi possível vincular as vagas.' });
    try {
      return reply.send({ data: await this.claimSeats.execute(user.id, user.email, user.emailVerified) });
    } catch (error) {
      if (error instanceof SponsoredSeatClaimError) {
        const statusCode = error.code === 'EMAIL_NOT_VERIFIED' ? 403 : error.code === 'STUDENT_NOT_FOUND' ? 404 : 422;
        const message = error.code === 'EMAIL_NOT_VERIFIED' ? 'Confirme seu e-mail para vincular as vagas.' : error.code === 'STUDENT_NOT_FOUND' ? 'Perfil de aluno não encontrado.' : 'Não foi possível confirmar o e-mail da conta.';
        throw new AppError({ code: error.code, statusCode, publicMessage: message });
      }
      throw error;
    }
  }

  private requireTeacher(request: FastifyRequest) {
    if (!request.user) throw new AppError({ code: 'UNAUTHENTICATED', statusCode: 401, publicMessage: 'Sessão de professor obrigatória.' });
    if (request.user.role?.toLowerCase() !== 'teacher') throw new AppError({ code: 'FORBIDDEN', statusCode: 403, publicMessage: 'Somente professores podem gerenciar turmas patrocinadas.' });
    return request.user;
  }
}

function headerValue(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function mapValidationError(code: string) {
  const statusCode = code === 'MONITOR_NOT_AVAILABLE' ? 404
    : ['IDEMPOTENCY_KEY_REUSED', 'CHECKOUT_PENDING', 'CHECKOUT_CREATION_FAILED', 'BENEFICIARY_ALREADY_HAS_ACCESS', 'PLAN_NOT_AVAILABLE', 'PRICE_CHANGED', 'BATCH_NOT_EDITABLE', 'CHECKOUT_CANNOT_BE_CANCELLED'].includes(code) ? 409
    : 422;
  const messages: Record<string, string> = {
    IDEMPOTENCY_KEY_REQUIRED: 'A chave de idempotência é obrigatória.',
    IDEMPOTENCY_KEY_REUSED: 'A chave de idempotência já foi usada com outros dados.',
    CHECKOUT_PENDING: 'Já existe um checkout em processamento. Aguarde a atualização.',
    CHECKOUT_CREATION_FAILED: 'A tentativa anterior não gerou o checkout. Atualize Turmas e vagas e revise este lote no histórico antes de continuar.',
    MONITOR_NOT_AVAILABLE: 'Monitor não encontrado ou não publicado por você.',
    PLAN_NOT_AVAILABLE: 'Este plano ainda não está disponível para compra.',
    PRICE_CHANGED: 'O preço mudou desde a cotação. Atualize a revisão antes de continuar.',
    BENEFICIARY_ALREADY_HAS_ACCESS: 'Um ou mais alunos já têm acesso vigente a este monitor.',
    BATCH_NOT_EDITABLE: 'Este lote já foi pago ou não pode mais ser editado.',
    CHECKOUT_CANNOT_BE_CANCELLED: 'Não foi possível cancelar o checkout anterior. Atualize a lista e tente novamente.',
    INVALID_BENEFICIARY_EMAIL: 'Um ou mais e-mails são inválidos.',
    DUPLICATE_BENEFICIARY_EMAIL: 'Remova os e-mails repetidos antes de continuar.',
  };
  return new AppError({ code, statusCode, publicMessage: messages[code] ?? 'Não foi possível criar o lote de vagas.' });
}

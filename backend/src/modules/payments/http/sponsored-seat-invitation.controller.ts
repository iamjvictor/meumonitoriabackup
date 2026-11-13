import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../../core/errors/app-error.js';
import { AuthRepository, AuthRepositoryError } from '../../../repositories/auth.repository.js';
import { sessionCookieOptions } from '../../../controllers/session-cookie-options.js';
import { SponsoredSeatInvitationError, SponsoredSeatInvitationUseCase, type SponsoredInvitationActivationEvent } from '../application/commands/sponsored-seat-invitation.use-case.js';

const issueParamsSchema = z.object({ batchId: z.string().uuid(), seatId: z.string().uuid() });
const activationBodySchema = z.object({ name: z.string().trim().min(2).max(120), password: z.string().min(6).max(72) }).strict();

export class SponsoredSeatInvitationController {
  constructor(private readonly useCase: SponsoredSeatInvitationUseCase) {}

  async issue(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) throw new AppError({ code: 'UNAUTHENTICATED', statusCode: 401, publicMessage: 'Sessão de professor obrigatória.' });
    if (request.user.role?.toLowerCase() !== 'teacher') throw new AppError({ code: 'FORBIDDEN', statusCode: 403, publicMessage: 'Somente professores podem emitir convites.' });
    const params = issueParamsSchema.safeParse(request.params);
    if (!params.success) throw validationError();
    try {
      const idempotencyKey = getIdempotencyKey(request);
      if (!idempotencyKey) throw new SponsoredSeatInvitationError('IDEMPOTENCY_KEY_REQUIRED');
      const data = await this.useCase.issue({ teacherUserId: request.user.id, ...params.data, idempotencyKey });
      return reply.code(data.duplicate ? 200 : 202).send({ data });
    } catch (error) { throw mapInvitationError(error); }
  }

  async resolve(request: FastifyRequest, reply: FastifyReply) {
    try {
      return reply.send({ data: await this.useCase.resolve(getInvitationToken(request)) });
    } catch (error) { throw mapInvitationError(error); }
  }

  async activate(request: FastifyRequest, reply: FastifyReply) {
    const body = activationBodySchema.safeParse(request.body);
    if (!body.success) throw validationError();
    try {
      const data = await this.useCase.activate(getInvitationToken(request), body.data, (entry) => logActivationStage(request, entry));
      const cookieOptions = sessionCookieOptions(request);
      reply.setCookie('mm_access_token', data.accessToken, { httpOnly: true, ...cookieOptions, maxAge: data.expiresIn });
      reply.setCookie('mm_refresh_token', data.refreshToken, { httpOnly: true, ...cookieOptions, maxAge: 60 * 60 * 24 * 30 });
      const { refreshToken: _refreshToken, expiresIn: _expiresIn, ...publicData } = data;
      return reply.code(201).send({ data: publicData });
    } catch (error) {
      if (error instanceof AuthRepositoryError) {
        const message = error.message.toLowerCase().replace(/[_-]+/g, ' ');
        if (/\b(user|email)(\s+address)?\b.{0,80}\b(already registered|already exists|has been registered|exists)\b/.test(message)) {
          throw new AppError({ code: 'ACCOUNT_EXISTS', statusCode: 409, publicMessage: 'Já existe uma conta com este e-mail. Entre para vincular a vaga.' });
        }
        throw new AppError({ code: 'SIGNUP_UNAVAILABLE', statusCode: 503, publicMessage: 'Não foi possível criar a conta agora.' });
      }
      throw mapInvitationError(error);
    }
  }

  async redeemExisting(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) throw new AppError({ code: 'UNAUTHENTICATED', statusCode: 401, publicMessage: 'Sessão de aluno obrigatória.' });
    if (user.role?.toLowerCase() !== 'student') throw new AppError({ code: 'FORBIDDEN', statusCode: 403, publicMessage: 'Somente alunos podem vincular vagas patrocinadas.' });
    try {
      return reply.send({ data: await this.useCase.redeemExistingAccount(getInvitationToken(request), { studentUserId: user.id, email: user.email, emailVerified: user.emailVerified }) });
    } catch (error) { throw mapInvitationError(error); }
  }
}

function logActivationStage(request: FastifyRequest, entry: SponsoredInvitationActivationEvent) {
  const fields = { event: 'payments.sponsored_invitation_activation', stage: entry.stage, outcome: entry.outcome, ...(entry.outcome === 'failed' ? { errorType: entry.errorType, errorCode: entry.errorCode } : {}) };
  if (entry.outcome === 'failed') request.log.warn(fields);
  else request.log.info(fields);
}

function getInvitationToken(request: FastifyRequest) {
  const value = request.headers['x-sponsored-invitation-token'];
  return typeof value === 'string' ? value : '';
}

function getIdempotencyKey(request: FastifyRequest) {
  const value = request.headers['idempotency-key'];
  return typeof value === 'string' && value.trim().length <= 200 ? value.trim() : '';
}

function validationError() {
  return new AppError({ code: 'VALIDATION_ERROR', statusCode: 422, publicMessage: 'Confira os dados do convite e tente novamente.' });
}

function mapInvitationError(error: unknown) {
  if (!(error instanceof SponsoredSeatInvitationError)) return error;
  if (error.code === 'FORBIDDEN') return new AppError({ code: error.code, statusCode: 403, publicMessage: 'Você não pode emitir um convite para esta vaga.' });
  if (error.code === 'SEAT_NOT_ELIGIBLE') return new AppError({ code: error.code, statusCode: 409, publicMessage: 'Esta vaga não pode receber um convite no momento.' });
  if (error.code === 'ACCOUNT_EXISTS') return new AppError({ code: error.code, statusCode: 409, publicMessage: 'Já existe uma conta com este e-mail. Entre para vincular a vaga.' });
  if (error.code === 'VALIDATION_ERROR') return validationError();
  if (error.code === 'EMAIL_NOT_VERIFIED') return new AppError({ code: error.code, statusCode: 403, publicMessage: 'Confirme seu e-mail para vincular a vaga.' });
  if (error.code === 'EMAIL_REQUIRED') return new AppError({ code: error.code, statusCode: 422, publicMessage: 'Não foi possível confirmar o e-mail da conta.' });
  if (error.code === 'EMAIL_UNAVAILABLE') return new AppError({ code: error.code, statusCode: 503, publicMessage: 'O envio de convites não está disponível no momento.' });
  if (error.code === 'IDEMPOTENCY_KEY_REQUIRED') return new AppError({ code: error.code, statusCode: 422, publicMessage: 'Envie uma chave de idempotência válida para solicitar o reenvio.' });
  return new AppError({ code: 'INVALID_INVITATION', statusCode: 404, publicMessage: 'Este convite é inválido, expirou ou já foi utilizado.' });
}

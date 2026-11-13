import { createHash, randomBytes } from 'node:crypto';

export type SponsoredSeatInvitationDetails = {
  invitationId: string;
  seatId: string;
  email: string;
  teacherName: string;
  monitorName: string;
  interval: string;
  startsAt: Date;
  endsAt: Date;
};

export type SponsoredSeatInvitationRepository = {
  issue(input: { teacherUserId: string; batchId: string; seatId: string; token?: string; tokenHash: string; expiresAt: Date; idempotencyKey?: string; now: Date }): Promise<{ duplicate: boolean; expiresAt: Date }>;
  resolve(tokenHash: string, now: Date): Promise<SponsoredSeatInvitationDetails | null>;
  isEmailRegistered(email: string): Promise<boolean>;
  redeem(input: { tokenHash: string; studentUserId: string; email: string; now: Date }): Promise<{ claimedCount: number; monitorIds: string[] }>;
};

export type SponsoredInvitationAccountProvisioner = {
  createStudent(input: { email: string; name: string; password: string }): Promise<{
    userId: string; email: string; role: 'student'; session: { accessToken: string; refreshToken: string; expiresIn: number };
  }>;
};

export type SponsoredInvitationActivationStage = 'invitation_lookup' | 'account_check' | 'account_provision' | 'seat_redemption';
export type SponsoredInvitationActivationEvent = {
  stage: SponsoredInvitationActivationStage;
  outcome: 'started' | 'completed' | 'failed';
  errorType?: 'SponsoredSeatInvitationError' | 'AuthRepositoryError' | 'TypeError' | 'Error' | 'UnknownError';
  errorCode?: SponsoredSeatInvitationError['code'] | 'AUTH_REPOSITORY_ERROR' | 'UNCLASSIFIED';
};
export type SponsoredInvitationActivationObserver = (event: SponsoredInvitationActivationEvent) => void;

export class SponsoredSeatInvitationError extends Error {
  constructor(public readonly code: 'INVALID_INVITATION' | 'SEAT_NOT_ELIGIBLE' | 'FORBIDDEN' | 'ACCOUNT_EXISTS' | 'VALIDATION_ERROR' | 'EMAIL_NOT_VERIFIED' | 'EMAIL_REQUIRED' | 'EMAIL_UNAVAILABLE' | 'IDEMPOTENCY_KEY_REQUIRED') { super(code); }
}

export class SponsoredSeatInvitationUseCase {
  constructor(
    private readonly repository: SponsoredSeatInvitationRepository,
    private readonly accountProvisioner: SponsoredInvitationAccountProvisioner,
    private readonly options: { frontBaseUrl: string; emailEnabled?: boolean; now?: () => Date; generateToken?: () => string },
  ) {}

  async issue(input: { teacherUserId: string; batchId: string; seatId: string; idempotencyKey?: string }) {
    if (this.options.emailEnabled === false) throw new SponsoredSeatInvitationError('EMAIL_UNAVAILABLE');
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) throw new SponsoredSeatInvitationError('IDEMPOTENCY_KEY_REQUIRED');
    const token = (this.options.generateToken ?? (() => randomBytes(32).toString('base64url')))();
    const now = (this.options.now ?? (() => new Date()))();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const issued = await this.repository.issue({ ...input, token, tokenHash: hashToken(token), expiresAt, idempotencyKey, now });
    return { queued: true, duplicate: issued.duplicate, expiresAt: issued.expiresAt };
  }

  async resolve(token: string) {
    if (!token) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
    const details = await this.repository.resolve(hashToken(token), (this.options.now ?? (() => new Date()))());
    if (!details) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
    return {
      email: details.email,
      teacherName: details.teacherName,
      monitorName: details.monitorName,
      interval: details.interval,
      startsAt: details.startsAt.toISOString(),
      endsAt: details.endsAt.toISOString(),
    };
  }

  async activate(token: string, input: { name: string; password: string }, observe?: SponsoredInvitationActivationObserver) {
    if (!token) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
    const now = (this.options.now ?? (() => new Date()))();
    const tokenHash = hashToken(token);
    const invitation = await runActivationStage(observe, 'invitation_lookup', () => this.repository.resolve(tokenHash, now));
    if (!invitation) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
    const name = input.name.trim();
    if (name.length < 2 || name.length > 120 || input.password.length < 6 || input.password.length > 72) {
      throw new SponsoredSeatInvitationError('VALIDATION_ERROR');
    }
    const alreadyRegistered = await runActivationStage(observe, 'account_check', () => this.repository.isEmailRegistered(invitation.email));
    if (alreadyRegistered) throw new SponsoredSeatInvitationError('ACCOUNT_EXISTS');
    const account = await runActivationStage(observe, 'account_provision', () => this.accountProvisioner.createStudent({ email: invitation.email, name, password: input.password }));
    const claimed = await runActivationStage(observe, 'seat_redemption', () => this.repository.redeem({ tokenHash, studentUserId: account.userId, email: invitation.email, now }));
    return {
      userId: account.userId,
      email: invitation.email,
      role: 'student' as const,
      accessToken: account.session.accessToken,
      refreshToken: account.session.refreshToken,
      expiresIn: account.session.expiresIn,
      claimedCount: claimed.claimedCount,
      monitorIds: claimed.monitorIds,
    };
  }

  async redeemExistingAccount(token: string, input: { studentUserId: string; email: string | undefined; emailVerified: boolean }) {
    if (!input.emailVerified) throw new SponsoredSeatInvitationError('EMAIL_NOT_VERIFIED');
    const email = input.email?.trim().toLowerCase();
    if (!email) throw new SponsoredSeatInvitationError('EMAIL_REQUIRED');
    if (!token) throw new SponsoredSeatInvitationError('INVALID_INVITATION');
    const now = (this.options.now ?? (() => new Date()))();
    const claimed = await this.repository.redeem({ tokenHash: hashToken(token), studentUserId: input.studentUserId, email, now });
    return { userId: input.studentUserId, email, role: 'student' as const, claimedCount: claimed.claimedCount, monitorIds: claimed.monitorIds };
  }
}

async function runActivationStage<T>(observe: SponsoredInvitationActivationObserver | undefined, stage: SponsoredInvitationActivationStage, operation: () => Promise<T>): Promise<T> {
  notifyActivationObserver(observe, { stage, outcome: 'started' });
  try {
    const result = await operation();
    notifyActivationObserver(observe, { stage, outcome: 'completed' });
    return result;
  } catch (error) {
    notifyActivationObserver(observe, { stage, outcome: 'failed', ...safeActivationFailure(error) });
    throw error;
  }
}

function safeActivationFailure(error: unknown): Pick<SponsoredInvitationActivationEvent, 'errorType' | 'errorCode'> {
  if (error instanceof SponsoredSeatInvitationError) return { errorType: 'SponsoredSeatInvitationError', errorCode: error.code };
  if (error instanceof Error && error.name === 'AuthRepositoryError') return { errorType: 'AuthRepositoryError', errorCode: 'AUTH_REPOSITORY_ERROR' };
  if (error instanceof TypeError) return { errorType: 'TypeError', errorCode: 'UNCLASSIFIED' };
  if (error instanceof Error) return { errorType: 'Error', errorCode: 'UNCLASSIFIED' };
  return { errorType: 'UnknownError', errorCode: 'UNCLASSIFIED' };
}

function notifyActivationObserver(observe: SponsoredInvitationActivationObserver | undefined, event: SponsoredInvitationActivationEvent) {
  try { observe?.(event); } catch { /* Observability must never change activation behavior. */ }
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

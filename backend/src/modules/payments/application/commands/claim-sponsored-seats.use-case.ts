export class SponsoredSeatClaimError extends Error {
  constructor(public readonly code: 'EMAIL_NOT_VERIFIED' | 'EMAIL_REQUIRED' | 'STUDENT_NOT_FOUND') { super(code); }
}

export type SponsoredSeatClaimRepository = {
  claimPaidSeats(input: { studentUserId: string; emailNormalized: string }): Promise<{ claimedCount: number; monitorIds: string[] }>;
};

export class ClaimSponsoredSeatsUseCase {
  constructor(private readonly repository: SponsoredSeatClaimRepository, private readonly invalidateAccess?: (studentUserId: string) => Promise<void>) {}

  async execute(studentUserId: string, authenticatedEmail: string | undefined, emailVerified: boolean) {
    if (!emailVerified) throw new SponsoredSeatClaimError('EMAIL_NOT_VERIFIED');
    const emailNormalized = authenticatedEmail?.trim().toLowerCase();
    if (!emailNormalized) throw new SponsoredSeatClaimError('EMAIL_REQUIRED');
    const result = await this.repository.claimPaidSeats({ studentUserId, emailNormalized });
    if (result.claimedCount > 0) await this.invalidateAccess?.(studentUserId);
    return result;
  }
}

export type EntitlementStatus = 'ACTIVE' | 'CANCEL_PENDING';

export interface EntitlementSubject { id: string; name: string; topics: Array<{ id: string; name: string; subtopics?: Array<{ id: string; name: string }> }>; }
export interface EntitlementSubscription {
  paymentSubscriptionId: string;
  providerSubscriptionId: string | null;
  status: EntitlementStatus;
  purchasedAt: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelRequestedAt: string | null;
  accessEndsAt: string | null;
}
export interface EntitlementMonitor {
  monitorId: string;
  name: string;
  teacherId: string;
  teacherName: string;
  teacherAvatarUrl?: string | null;
  teacherBannerUrl?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  subjects: EntitlementSubject[];
  approvedQuestionCount: number;
  approvedFlashcardCount: number;
  subscription: EntitlementSubscription;
  permissions: { agent: boolean; questions: boolean; flashcards: boolean; dailyChallenges: boolean; chat: boolean; performance: boolean; ranking: boolean };
}
export interface EntitlementSnapshot {
  studentId: string;
  generatedAt: string;
  source: 'REDIS' | 'DATABASE' | string;
  monitors: EntitlementMonitor[];
}

function mergeMonitor(current: EntitlementMonitor, candidate: EntitlementMonitor): EntitlementMonitor {
  return {
    ...current,
    subjects: current.subjects.length >= candidate.subjects.length ? current.subjects : candidate.subjects,
    approvedQuestionCount: Math.max(current.approvedQuestionCount, candidate.approvedQuestionCount),
    approvedFlashcardCount: Math.max(current.approvedFlashcardCount, candidate.approvedFlashcardCount),
  };
}

export function normalizeEntitlementSnapshot(input: Partial<EntitlementSnapshot> | null | undefined): EntitlementSnapshot {
  const byMonitor = new Map<string, EntitlementMonitor>();
  for (const monitor of Array.isArray(input?.monitors) ? input.monitors : []) {
    if (!monitor?.monitorId) continue;
    const existing = byMonitor.get(monitor.monitorId);
    byMonitor.set(monitor.monitorId, existing ? mergeMonitor(existing, monitor) : monitor);
  }
  return {
    studentId: input?.studentId ?? '',
    generatedAt: input?.generatedAt ?? new Date().toISOString(),
    source: input?.source ?? 'DATABASE',
    monitors: [...byMonitor.values()],
  };
}

export function entitlementToStudentMonitor(monitor: EntitlementMonitor) {
  return {
    id: monitor.monitorId,
    name: monitor.name,
    description: monitor.description ?? undefined,
    avatarUrl: monitor.avatarUrl ?? null,
    teacherName: monitor.teacherName,
    teacher: { fullName: monitor.teacherName, avatarUrl: monitor.teacherAvatarUrl ?? null, bannerUrl: monitor.teacherBannerUrl ?? null },
    subjects: monitor.subjects,
    _count: { questions: monitor.approvedQuestionCount, flashcards: monitor.approvedFlashcardCount },
    entitlement: monitor,
  };
}

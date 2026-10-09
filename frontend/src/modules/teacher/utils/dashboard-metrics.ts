export type DashboardStudentSubscription = {
  studentId: string;
  status: string;
  priceCents: number;
  expectedTeacherCents?: number;
  itemStatus?: string;
  subscriptionStatus?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  cancelledAt?: string | null;
};

export type DashboardMonitor = {
  knowledgeBaseCount?: number;
  questionsCount?: number;
  flashcardsCount?: number;
};

export function isSameMonth(dateString?: string | null, referenceDate = new Date()): boolean {
  if (!dateString) return true;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return true;
  return date.getFullYear() === referenceDate.getFullYear() && date.getMonth() === referenceDate.getMonth();
}

export function calculateTeacherDashboardMetrics(
  subscriptions: DashboardStudentSubscription[],
  monitors: DashboardMonitor[],
  referenceDate = new Date(),
) {
  const activeSubscriptions = subscriptions.filter((item) => {
    const s = (item.itemStatus || item.status || '').toUpperCase();
    return s === 'ACTIVE';
  });

  const cancelledSubscriptions = subscriptions.filter((item) => {
    const s = (item.itemStatus || item.status || '').toUpperCase();
    const subStatus = (item.subscriptionStatus || '').toUpperCase();
    const isCancelled = s === 'CANCEL_PENDING' || s === 'CANCELLED' || subStatus === 'CANCEL_PENDING' || subStatus === 'CANCELLED';
    if (!isCancelled) return false;
    const dateToCheck = item.cancelledAt || item.updatedAt;
    return isSameMonth(dateToCheck, referenceDate);
  });

  return {
    activeStudentCount: new Set(activeSubscriptions.map((item) => item.studentId)).size,
    activeSubscriptionsCount: activeSubscriptions.length,
    activeMonthlyPayoutCents: activeSubscriptions.reduce(
      (total, item) => total + (item.expectedTeacherCents !== undefined ? item.expectedTeacherCents : item.priceCents),
      0,
    ),
    monthlyRevenueCents: activeSubscriptions.reduce((total, item) => total + item.priceCents, 0),
    monthlyCancellationsCount: cancelledSubscriptions.length,
    materialsCount: monitors.reduce(
      (total, monitor) => total + (monitor.knowledgeBaseCount ?? 0) + (monitor.questionsCount ?? 0) + (monitor.flashcardsCount ?? 0),
      0,
    ),
  };
}


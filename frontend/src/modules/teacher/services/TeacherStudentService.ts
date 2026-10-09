import { TeacherSessionError } from './TeacherSessionError';

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

export interface TeacherStudentSubscription {
  id?: string;
  subscriptionId?: string;
  studentId: string;
  studentName?: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  monitorId: string;
  monitorName: string;
  status: string;
  priceCents: number;
  grossCents?: number;
  teacherPercentageSnapshot?: number;
  expectedTeacherCents?: number;
  settledTeacherCents?: number;
  splitStatus?: string;
  subscriptionStatus?: string;
  itemStatus?: string;
  startsAt: string;
  currentPeriodEnd?: string | null;
  nextDueDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  cancelledAt?: string | null;
}

export const TeacherStudentService = {
  async listMine(): Promise<TeacherStudentSubscription[]> {
    const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/students/subscriptions`, {
      method: 'GET',
      credentials: 'include',
    });

    if (response.status === 401 || response.status === 403) throw new TeacherSessionError();
    if (!response.ok) throw new Error('Não foi possível carregar os alunos e assinaturas.');
    const payload = await response.json() as { data?: { items?: Array<Record<string, unknown>> } };
    const rows = Array.isArray(payload.data?.items) ? payload.data.items : [];
    return rows.map((row, index) => ({
      id: typeof row.id === 'string' ? row.id : `${row.studentId}-${row.monitorId}-${index}`,
      subscriptionId: typeof row.subscriptionId === 'string' ? row.subscriptionId : undefined,
      studentId: String(row.studentId),
      fullName: String(row.studentName ?? ''),
      email: String(row.email ?? ''),
      monitorId: String(row.monitorId),
      monitorName: String(row.monitorName ?? ''),
      status: String(row.itemStatus ?? row.subscriptionStatus ?? 'UNKNOWN'),
      priceCents: Number(row.grossCents ?? 0),
      grossCents: Number(row.grossCents ?? 0),
      teacherPercentageSnapshot: Number(row.teacherPercentageSnapshot ?? 0),
      expectedTeacherCents: Number(row.expectedTeacherCents ?? 0),
      settledTeacherCents: Number(row.settledTeacherCents ?? 0),
      splitStatus: String(row.splitStatus ?? 'PENDING'),
      subscriptionStatus: String(row.subscriptionStatus ?? 'UNKNOWN'),
      itemStatus: String(row.itemStatus ?? 'UNKNOWN'),
      startsAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      currentPeriodEnd: typeof row.servicePeriodEnd === 'string' ? row.servicePeriodEnd : null,
      nextDueDate: null,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
      cancelledAt: typeof row.cancelledAt === 'string' ? row.cancelledAt : null,
    }));
  },
};

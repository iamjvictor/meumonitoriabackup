import { intelligenceDemo } from './teacher-intelligence-demo';

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
export const isIntelligenceDemo = () => typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).get('demo') === 'inteligencia';

export type IntelligencePeriod = '7d' | '30d' | '90d' | 'all';
export type IntelligenceMetrics = {
  studentCount: number;
  activeStudentCount: number;
  attemptCount: number;
  accuracy: number | null;
  accuracyStudentCount: number;
  averagePracticeDays: number;
};
export type IntelligenceMonitor = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  metrics: IntelligenceMetrics;
};
export type IntelligenceOverview = {
  period: IntelligencePeriod;
  generatedAt: string;
  metrics: IntelligenceMetrics;
  monitors: IntelligenceMonitor[];
};
export type IntelligenceMonitorDetail = {
  period: IntelligencePeriod;
  monitor: { id: string; name: string };
  metrics: IntelligenceMetrics;
  topics: {
    strongest: Array<{ name: string; accuracy: number; attempts: number; studentCount: number }>;
    needsAttention: Array<{ name: string; accuracy: number; attempts: number; studentCount: number }>;
  };
  students: Array<{
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string | null;
    attemptCount: number;
    accuracy: number | null;
    lastActivityAt: string | null;
  }>;
  pagination: { page: number; pageSize: number; total: number };
};
export type IntelligenceStudentDetail = {
  period: IntelligencePeriod;
  student: { id: string; fullName: string; email: string };
  monitor: { id: string; name: string };
  metrics: {
    attemptCount: number;
    correctCount: number;
    accuracy: number | null;
    practiceDays: number;
    lastActivityAt: string | null;
    flashcardReviewCount: number;
  };
  topicPerformance: Array<{ topic: string; subject: string; attemptCount: number; accuracy: number }>;
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${getBackendUrl()}/api/v1/teachers/me/intelligence${path}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  if (response.status === 401 || response.status === 403) throw new Error('Sua sessão de professora expirou. Entre novamente.');
  if (!response.ok) throw new Error('Não foi possível carregar os indicadores. Tente novamente.');
  const body = await response.json() as { data?: T };
  if (!body.data) throw new Error('A resposta dos indicadores está incompleta.');
  return body.data;
}

const query = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  return params.toString();
};

export const TeacherIntelligenceService = {
  getOverview(period: IntelligencePeriod) {
    if (isIntelligenceDemo()) return Promise.resolve(intelligenceDemo.overview(period));
    return request<IntelligenceOverview>(`/overview?${query({ period })}`);
  },
  getMonitor(monitorId: string, options: { period: IntelligencePeriod; page: number; pageSize: number; search?: string; sort?: string }) {
    if (isIntelligenceDemo()) return Promise.resolve(intelligenceDemo.monitor(monitorId, options));
    return request<IntelligenceMonitorDetail>(`/monitors/${encodeURIComponent(monitorId)}?${query(options)}`);
  },
  getStudent(monitorId: string, studentId: string, period: IntelligencePeriod) {
    if (isIntelligenceDemo()) return Promise.resolve(intelligenceDemo.student(monitorId, studentId, period));
    return request<IntelligenceStudentDetail>(`/monitors/${encodeURIComponent(monitorId)}/students/${encodeURIComponent(studentId)}?${query({ period })}`);
  },
};

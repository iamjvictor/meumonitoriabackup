const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

const request = (path: string, init?: RequestInit) => fetch(`${apiUrl}${path}`, { credentials: 'include', ...init });

export interface WeeklySimulationStatusResponse {
  simulationId: string | null;
  status: import('../models/weekly-simulation-ui').WeeklySimulationStatus;
  requestedAt?: string;
  questionCount?: number;
  answeredCount?: number;
  correctCount?: number;
  scorePercent?: number | null;
  durationSeconds?: number | null;
  completedAt?: string | null;
}

export interface WeeklySimulationItem {
  id: string;
  position: number;
  answered: boolean;
  question: { id: string; text: string; alternatives: unknown; kind?: string; difficulty?: string; explanation?: string | null; correctAnswer?: string | null; subject?: { id: string; name: string } | null; topic?: { id: string; name: string } | null };
  answer: { selectedAnswer: string; isCorrect: boolean; answeredAt: string; responseTimeMs?: number | null } | null;
}

export interface WeeklySimulation {
  id: string;
  monitorId: string;
  cycleStartDate: string;
  status: import('../models/weekly-simulation-ui').WeeklySimulationStatus;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  scorePercent: number | null;
  solvingStartedAt: string | null;
  deadlineAt: string | null;
  timeLimitSeconds: number;
  completedAt: string | null;
  durationSeconds: number | null;
  items: WeeklySimulationItem[];
}

export const studentDashboardService = {
  loadChallenges: () => request('/api/v1/student/daily-challenges'),
  loadDailyChallengeSummary: () => request('/api/v1/student/daily-challenges/summary'),
  loadQuestions: () => request('/api/v1/student/questions?pageSize=100'),
  loadConsistency: () => request('/api/v1/student/consistency'),
  loadRandomFlashcard: (excludeFlashcardId?: string) => {
    const query = excludeFlashcardId ? `?excludeFlashcardId=${encodeURIComponent(excludeFlashcardId)}` : '';
    return request(`/api/v1/student/flashcards/random${query}`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  },
  reviewFlashcard: (id: string, rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY') => request(`/api/v1/student/flashcards/${id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating }) }),
  answerChallenge: (id: string, selectedAnswer: string) => request(`/api/v1/student/daily-challenges/${id}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedAnswer }) }),
  loadWeeklySimulationStatus: (monitorId: string) => request(`/api/v1/student/monitors/${encodeURIComponent(monitorId)}/weekly-simulation`),
  generateWeeklySimulation: (monitorId: string) => request(`/api/v1/student/monitors/${encodeURIComponent(monitorId)}/weekly-simulation/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  loadWeeklySimulation: (simulationId: string) => request(`/api/v1/student/weekly-simulations/${encodeURIComponent(simulationId)}`),
  startWeeklySimulation: (simulationId: string) => request(`/api/v1/student/weekly-simulations/${encodeURIComponent(simulationId)}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
  submitWeeklySimulation: (simulationId: string, answers: Array<{ itemId: string; selectedAnswer: string; responseTimeMs?: number }>) => request(`/api/v1/student/weekly-simulations/${encodeURIComponent(simulationId)}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) }),
  answerWeeklySimulationItem: (simulationId: string, itemId: string, selectedAnswer: string, responseTimeMs?: number) => request(`/api/v1/student/weekly-simulations/${encodeURIComponent(simulationId)}/items/${encodeURIComponent(itemId)}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedAnswer, responseTimeMs }) }),
};

export type StudentDashboardService = typeof studentDashboardService;

'use client';
/* eslint-disable react-hooks/set-state-in-effect -- Effects synchronize authenticated session and subscriptions. */

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { revokeClientSession } from '@/shared/auth/client-session';
import { buildStudentAuthHeaders } from '@/shared/auth/session-headers';
import { dedupeAsyncRequest } from '@/shared/utils/async-request-deduper';
import { entitlementToStudentMonitor, normalizeEntitlementSnapshot } from './entitlements';
import { SessionRequestTimeoutError, withSessionRequestTimeout } from './student-session-request';

const SESSION_VALIDATION_TIMEOUT_MS = 15_000;

export interface StudentData {
  userId: string;
  email: string;
  fullName?: string | null;
  firstName: string;
  initials: string;
  whatsapp?: string | null;
  cpf?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
}

export interface ActiveQuestionContext {
  id: string;
  monitorId?: string;
  subjectId?: string;
  topicId?: string;
  questionAttemptId?: string;
  number: number;
  topic?: string;
  statement: string;
  selectedOption?: string;
  options?: { label: string; text: string }[];
  correctAnswer?: string;
  explanation?: string;
}

export interface ActiveFlashcardContext {
  id: string;
  monitorId: string;
  subjectId: string;
  topicId?: string;
  topic?: string;
  front: string;
  back: string;
}

export interface StudentChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  questionContextNumber?: number;
  attachmentType?: 'QUESTION' | 'FLASHCARD';
}

export interface StudentMonitorSubject {
  id: string;
  name: string;
  title?: string;
  topics?: Array<{ id: string; name: string; subtopics?: Array<{ id: string; name: string }> }>;
}

export interface StudentMonitorRecord {
  id: string;
  name: string;
  priceCents?: number | null;
  title?: string;
  description?: string;
  detailedDescription?: string;
  avatarUrl?: string | null;
  subjectId?: string;
  subject?: string;
  area?: string;
  teacherName?: string;
  teacher?: { fullName: string; avatarUrl?: string | null; area?: string; bannerUrl?: string | null };
  subjects?: StudentMonitorSubject[];
  _count?: { questions: number; flashcards: number };
}

interface StudentContextValue {
  student: StudentData | null;
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'error';
  error: string | null;
  monitors: StudentMonitorRecord[] | null;
  isLoadingMonitors: boolean;
  activeContext: ActiveQuestionContext | null;
  setActiveContext: (context: ActiveQuestionContext | null) => void;
  activeFlashcardContext: ActiveFlashcardContext | null;
  setActiveFlashcardContext: (context: ActiveFlashcardContext | null) => void;
  chatMessages: StudentChatMessage[];
  chatScopeKey: string | null;
  chatHistoryLoaded: boolean;
  chatSelectedScopeKey: string | null;
  setChatSelectedScopeKey: (scopeKey: string) => void;
  setChatState: (state: { scopeKey: string; messages: StudentChatMessage[]; historyLoaded: boolean }) => void;
  fetchMonitors: (forceRefresh?: boolean) => Promise<StudentMonitorRecord[]>;
  refreshSession: () => Promise<void>;
  updateProfile: (data: { fullName?: string; phone?: string; cpf?: string; avatarUrl?: string }) => Promise<boolean>;
  logout: () => void;
}

const StudentContext = createContext<StudentContextValue | undefined>(undefined);

function extractFirstName(fullName?: string | null, email?: string): string {
  if (fullName && fullName.trim().length > 0) {
    const first = fullName.trim().split(/\s+/)[0];
    if (first) return first;
  }
  if (email && email.includes('@')) {
    const username = email.split('@')[0];
    const cleanUsername = username.replace(/[._-]/g, ' ');
    const first = cleanUsername.split(/\s+/)[0];
    if (first) {
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }
  }
  return 'Estudante';
}

function extractInitials(fullName?: string | null, email?: string): string {
  if (fullName && fullName.trim().length > 0) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length === 1) {
      return parts[0].toUpperCase();
    }
  }
  if (email && email.length >= 2) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'ST';
}

export function StudentProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [student, setStudent] = useState<StudentData | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [monitors, setMonitors] = useState<StudentMonitorRecord[] | null>(null);
  const monitorsRef = useRef<StudentMonitorRecord[] | null>(null);
  const monitorsRequestRef = useRef<Promise<StudentMonitorRecord[]> | null>(null);
  const [isLoadingMonitors, setIsLoadingMonitors] = useState<boolean>(false);
  const sessionRequestIdRef = useRef(0);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
  const studentRole = student?.role?.toLowerCase() || '';

  const fetchSession = useCallback(async () => {
    const requestId = ++sessionRequestIdRef.current;
    try {
      setStatus('loading');
      setError(null);

      const { response, body } = await withSessionRequestTimeout(async (signal) => {
        const response = await fetch(`${apiUrl}/api/v1/session`, {
          credentials: 'include',
          headers: buildStudentAuthHeaders(localStorage.getItem('mm_access_token')),
          cache: 'no-store',
          signal,
        });

        const body = response.ok ? await response.json() as {
          data?: {
            userId?: string;
            email?: string;
            fullName?: string | null;
            whatsapp?: string | null;
            cpf?: string | null;
            avatarUrl?: string | null;
            role?: string;
          };
        } : null;

        return { response, body };
      }, SESSION_VALIDATION_TIMEOUT_MS);

      if (requestId !== sessionRequestIdRef.current) return;

      if (!response.ok) {
        if (response.status !== 401) {
          setError('Não foi possível validar sua sessão agora. Verifique sua conexão e tente novamente.');
          setStatus('error');
          return;
        }
        setStudent(null);
        setMonitors(null);
        monitorsRef.current = null;
        setStatus('unauthenticated');
        return;
      }

      if (requestId !== sessionRequestIdRef.current) return;

      const data = body?.data;
      const role = data?.role?.toLowerCase();
      const allowedRoles = ['student', 'aluno', 'teacher', 'professor', 'admin'];

      if (!data?.userId || (role && !allowedRoles.includes(role))) {
        setError('A resposta de validação da sessão está incompleta. Tente novamente.');
        setStatus('error');
        return;
      }

      const firstName = extractFirstName(data.fullName, data.email);
      const initials = extractInitials(data.fullName, data.email);

      setStudent({
        userId: data.userId,
        email: data.email || '',
        fullName: data.fullName || null,
        firstName,
        initials,
        whatsapp: data.whatsapp || null,
        cpf: data.cpf || null,
        avatarUrl: data.avatarUrl || null,
        role: data.role || 'student',
      });
      setStatus('authenticated');
    } catch (err) {
      if (requestId !== sessionRequestIdRef.current) return;
      console.error('Erro ao carregar sessão do aluno:', err);
      setError(err instanceof SessionRequestTimeoutError
        ? 'A validação da sessão demorou demais. Verifique sua conexão e tente novamente.'
        : 'Não foi possível validar sua sessão agora. Verifique sua conexão e tente novamente.');
      setStatus('error');
    }
  }, [apiUrl]);

  const fetchMonitors = useCallback(
    async (forceRefresh = false) => {
      if (monitorsRef.current !== null && !forceRefresh) {
        return monitorsRef.current;
      }
      return dedupeAsyncRequest(monitorsRequestRef, async () => {
        setIsLoadingMonitors(true);
        try {
          const isTeacher = ['teacher', 'professor', 'admin'].includes(studentRole);
          const endpoint = isTeacher ? `${apiUrl}/api/v1/monitors` : `${apiUrl}/api/v1/student/access`;

          const res = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', ...buildStudentAuthHeaders(localStorage.getItem('mm_access_token')) },
            credentials: 'include',
          });

          if (res.ok) {
            const json = await res.json();
            const rows = Array.isArray(json.data) ? json.data : [];
            const raw = isTeacher
              ? rows
              : normalizeEntitlementSnapshot(json.data ?? json).monitors.map(entitlementToStudentMonitor) as StudentMonitorRecord[];
            monitorsRef.current = raw;
            setMonitors(raw);
            return raw;
          }
          monitorsRef.current = [];
          setMonitors([]);
          return [];
        } catch (err) {
          console.error('Erro ao carregar monitores no StudentProvider:', err);
          monitorsRef.current = [];
          setMonitors([]);
          return [];
        } finally {
          setIsLoadingMonitors(false);
        }
      });
    },
    [apiUrl, studentRole]
  );

  const updateProfile = useCallback(
    async (payload: { fullName?: string; phone?: string; cpf?: string; avatarUrl?: string }) => {
      try {
        const response = await fetch(`${apiUrl}/api/v1/student/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (!response.ok) return false;

        const body = (await response.json().catch(() => ({}))) as {
          data?: {
            userId?: string;
            email?: string;
            fullName?: string | null;
            whatsapp?: string | null;
            cpf?: string | null;
            avatarUrl?: string | null;
            role?: string;
          };
        };

        if (body.data) {
          const data = body.data;
          const firstName = extractFirstName(data.fullName, data.email);
          const initials = extractInitials(data.fullName, data.email);

          setStudent({
            userId: data.userId || student?.userId || '',
            email: data.email || student?.email || '',
            fullName: data.fullName || null,
            firstName,
            initials,
            whatsapp: data.whatsapp || null,
            cpf: data.cpf || null,
            avatarUrl: data.avatarUrl || null,
            role: data.role || 'student',
          });
        } else {
          await fetchSession();
        }
        return true;
      } catch (err) {
        console.error('Erro ao atualizar perfil:', err);
        return false;
      }
    },
    [apiUrl, fetchSession, student]
  );

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    if (status === 'authenticated') {
      void fetchMonitors();
    }
  }, [status, fetchMonitors]);

  const logout = useCallback(() => {
    void revokeClientSession(apiUrl).finally(() => {
      setStudent(null);
      setMonitors(null);
      monitorsRef.current = null;
      setStatus('unauthenticated');
      router.replace('/?login=true');
    });
  }, [apiUrl, router]);

  const [activeContext, setActiveContext] = useState<ActiveQuestionContext | null>(null);
  const [activeFlashcardContext, setActiveFlashcardContext] = useState<ActiveFlashcardContext | null>(null);
  const [chatMessages, setChatMessages] = useState<StudentChatMessage[]>([]);
  const [chatScopeKey, setChatScopeKey] = useState<string | null>(null);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [chatSelectedScopeKey, setChatSelectedScopeKey] = useState<string | null>(null);
  const setChatState = useCallback((state: { scopeKey: string; messages: StudentChatMessage[]; historyLoaded: boolean }) => {
    setChatScopeKey(state.scopeKey);
    setChatMessages(state.messages);
    setChatHistoryLoaded(state.historyLoaded);
  }, []);

  return (
    <StudentContext.Provider
      value={{
        student,
        status,
        error,
        monitors,
        isLoadingMonitors,
        activeContext,
        setActiveContext,
        activeFlashcardContext,
        setActiveFlashcardContext,
        chatMessages,
        chatScopeKey,
        chatHistoryLoaded,
        chatSelectedScopeKey,
        setChatSelectedScopeKey,
        setChatState,
        fetchMonitors,
        refreshSession: fetchSession,
        updateProfile,
        logout,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
}

export function useStudent() {
  const context = useContext(StudentContext);
  if (!context) {
    throw new Error('useStudent deve ser usado dentro de um <StudentProvider>');
  }
  return context;
}

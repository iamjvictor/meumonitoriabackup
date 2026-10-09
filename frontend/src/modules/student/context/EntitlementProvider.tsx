'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildStudentAuthHeaders } from '@/shared/auth/session-headers';
import { useStudent } from './StudentContext';
import { normalizeEntitlementSnapshot, type EntitlementMonitor, type EntitlementSnapshot } from './entitlements';

interface EntitlementContextValue {
  snapshot: EntitlementSnapshot | null;
  monitors: EntitlementMonitor[];
  isLoading: boolean;
  error: string | null;
  hasAccess: (monitorId: string) => boolean;
  refresh: () => Promise<EntitlementSnapshot | null>;
  clear: () => void;
}

const EntitlementContext = createContext<EntitlementContextValue | undefined>(undefined);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { student, status } = useStudent();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<Promise<EntitlementSnapshot | null> | null>(null);

  const clear = useCallback(() => { setSnapshot(null); setError(null); }, []);
  const refresh = useCallback(async () => {
    if (status !== 'authenticated' || !student?.userId) { clear(); return null; }
    if (requestRef.current) return requestRef.current;
    const request = (async () => {
      setIsLoading(true); setError(null);
      try {
        const response = await fetch(`${apiUrl}/api/v1/student/access`, {
          credentials: 'include', cache: 'no-store', headers: buildStudentAuthHeaders(localStorage.getItem('mm_access_token')),
        });
        if (!response.ok) throw new Error(`Não foi possível carregar seus acessos (${response.status})`);
        const body = await response.json().catch(() => ({}));
        const next = normalizeEntitlementSnapshot(body.data ?? body);
        setSnapshot(next);
        return next;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Erro ao carregar acessos';
        setError(message); setSnapshot(null); return null;
      } finally { setIsLoading(false); requestRef.current = null; }
    })();
    requestRef.current = request;
    return request;
  }, [apiUrl, clear, status, student?.userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo(() => ({ snapshot, monitors: snapshot?.monitors ?? [], isLoading, error, hasAccess: (id: string) => (snapshot?.monitors ?? []).some((m) => m.monitorId === id && Object.values(m.permissions).some(Boolean)), refresh, clear }), [clear, error, isLoading, refresh, snapshot]);
  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlements() {
  const context = useContext(EntitlementContext);
  if (!context) throw new Error('useEntitlements deve ser usado dentro de um <EntitlementProvider>');
  return context;
}

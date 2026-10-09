'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { studentDashboardService, type WeeklySimulation, type WeeklySimulationStatusResponse } from '../services/student-dashboard.service';
import { isWeeklySimulationPolling } from '../models/weekly-simulation-ui';

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 40;

export function useWeeklySimulations(status: string, monitorIds: string[]) {
  const monitorKey = monitorIds.join(',');
  const [states, setStates] = useState<Record<string, WeeklySimulationStatusResponse>>({});
  const [activeSimulation, setActiveSimulation] = useState<WeeklySimulation | null>(null);
  const [isLoadingSimulation, setIsLoadingSimulation] = useState(false);
  const [busyMonitorId, setBusyMonitorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const updateState = useCallback((monitorId: string, value: WeeklySimulationStatusResponse) => {
    if (mountedRef.current) setStates((current) => ({ ...current, [monitorId]: value }));
  }, []);

  const readStatus = useCallback(async (monitorId: string) => {
    const response = await studentDashboardService.loadWeeklySimulationStatus(monitorId);
    const body = await response.json().catch(() => ({})) as { data?: WeeklySimulationStatusResponse };
    if (!response.ok || !body.data) throw new Error('Não foi possível consultar o simulado.');
    updateState(monitorId, body.data);
    return body.data;
  }, [updateState]);

  useEffect(() => {
    mountedRef.current = true;
    if (status === 'authenticated' && monitorKey.length > 0) {
      void Promise.all(monitorKey.split(',').map((monitorId) => readStatus(monitorId).catch(() => null)));
    }
    return () => { mountedRef.current = false; };
  }, [monitorKey, readStatus, status]);

  const loadSimulation = useCallback(async (simulationId: string) => {
    setIsLoadingSimulation(true);
    setError(null);
    try {
      const response = await studentDashboardService.loadWeeklySimulation(simulationId);
      const body = await response.json().catch(() => ({})) as { data?: WeeklySimulation };
      if (!response.ok || !body.data) throw new Error('Não foi possível abrir o simulado.');
      if (mountedRef.current) setActiveSimulation(body.data);
      return body.data;
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o simulado.');
      return null;
    } finally {
      if (mountedRef.current) setIsLoadingSimulation(false);
    }
  }, []);

  const generate = useCallback(async (monitorId: string) => {
    setBusyMonitorId(monitorId);
    setError(null);
    try {
      const response = await studentDashboardService.generateWeeklySimulation(monitorId);
      const body = await response.json().catch(() => ({})) as { data?: WeeklySimulationStatusResponse };
      if (!response.ok || !body.data) {
        const apiError = (body as { message?: string; error?: string }).message || (body as { error?: string }).error;
        throw new Error(apiError ? `Não foi possível solicitar o simulado: ${apiError}` : 'Não foi possível solicitar o simulado.');
      }
      updateState(monitorId, body.data);
      let current = body.data;
      for (let attempt = 0; attempt < MAX_POLLS && isWeeklySimulationPolling(current.status); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
        current = await readStatus(monitorId);
      }
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o simulado.');
    } finally {
      if (mountedRef.current) setBusyMonitorId(null);
    }
  }, [readStatus, updateState]);

  const openSimulationForMonitor = useCallback(async (monitorId: string) => {
    const state = states[monitorId] ?? await readStatus(monitorId).catch(() => null);
    if (state?.simulationId) return loadSimulation(state.simulationId);
    return null;
  }, [loadSimulation, readStatus, states]);

  const startSimulation = useCallback(async () => {
    if (!activeSimulation) return false;
    const response = await studentDashboardService.startWeeklySimulation(activeSimulation.id);
    const body = await response.json().catch(() => ({})) as { data?: Pick<WeeklySimulation, 'solvingStartedAt' | 'deadlineAt' | 'timeLimitSeconds' | 'status'>; message?: string };
    if (!response.ok || !body.data) throw new Error(body.message || 'Não foi possível iniciar o simulado.');
    setActiveSimulation((current) => current ? { ...current, ...body.data } : current);
    return true;
  }, [activeSimulation]);

  const reloadAll = useCallback(async () => {
    if (monitorKey.length > 0) {
      await Promise.all(monitorKey.split(',').map((monitorId) => readStatus(monitorId).catch(() => null)));
    }
  }, [monitorKey, readStatus]);

  const submitSimulation = useCallback(async (answers: Array<{ itemId: string; selectedAnswer: string; responseTimeMs?: number }>) => {
    if (!activeSimulation) return false;
    const response = await studentDashboardService.submitWeeklySimulation(activeSimulation.id, answers);
    const body = await response.json().catch(() => ({})) as { data?: unknown; message?: string };
    if (!response.ok || !body.data) throw new Error(body.message || 'Não foi possível finalizar o simulado.');
    await loadSimulation(activeSimulation.id);
    if (activeSimulation.monitorId) {
      await readStatus(activeSimulation.monitorId).catch(() => null);
    }
    return true;
  }, [activeSimulation, loadSimulation, readStatus]);

  return { states, activeSimulation, setActiveSimulation, isLoadingSimulation, busyMonitorId, error, generate, openSimulationForMonitor, loadSimulation, startSimulation, submitSimulation, readStatus, reloadAll };
}

'use client';
import { useCallback, useState } from 'react';
import { TeacherMonitorService } from '../services/TeacherMonitorService';
export function useMonitorSettings<T>(initial: T) {
  const [settings, setSettings] = useState(initial);
  const save = useCallback(async (monitorId: string, patch: Record<string, unknown>) => { const monitor = await TeacherMonitorService.update(monitorId, patch as never); setSettings(monitor as T); return monitor; }, []);
  return { settings, setSettings, save };
}

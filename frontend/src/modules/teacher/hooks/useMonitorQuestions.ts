'use client';
import { useCallback, useState } from 'react';
import { TeacherMonitorService } from '../services/TeacherMonitorService';
export function useMonitorQuestions<T>(initial: T[] = []) {
  const [questions, setQuestions] = useState<T[]>(initial);
  const load = useCallback(async (monitorId: string) => { const data = await TeacherMonitorService.listQuestions(monitorId); setQuestions(data as T[]); return data as T[]; }, []);
  return { questions, setQuestions, load };
}

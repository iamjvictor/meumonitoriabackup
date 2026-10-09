'use client';
import { useCallback, useState } from 'react';
import { TeacherMonitorService } from '../services/TeacherMonitorService';
export function useMonitorFlashcards<T>(initial: T[] = []) {
  const [flashcards, setFlashcards] = useState<T[]>(initial);
  const load = useCallback(async (monitorId: string) => { const data = await TeacherMonitorService.listFlashcards(monitorId); setFlashcards(data as T[]); return data as T[]; }, []);
  return { flashcards, setFlashcards, load };
}

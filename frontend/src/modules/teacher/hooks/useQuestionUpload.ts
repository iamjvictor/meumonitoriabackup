'use client';
import { useCallback, useState } from 'react';
import { TeacherMonitorService } from '../services/TeacherMonitorService';
export function useQuestionUpload() {
  const [uploading, setUploading] = useState(false);
  const upload = useCallback(async (monitorId: string, file: File, subjectId: string, topicId: string | undefined, tag: 'knowledge'|'questions'|'flashcards' = 'questions') => { setUploading(true); try { return await TeacherMonitorService.uploadDocument({ monitorId, file, subjectId, topicId, tag }); } finally { setUploading(false); } }, []);
  return { upload, uploading };
}

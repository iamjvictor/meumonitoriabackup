export type TeacherDocumentStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'PARTIAL_SUCCESS'
  | 'READY'
  | 'FAILED'
  | 'NEEDS_OCR';

export function isTeacherDocumentProcessing(status: TeacherDocumentStatus) {
  return status === 'QUEUED' || status === 'PROCESSING';
}

export function isTeacherDocumentValid(status: TeacherDocumentStatus) {
  return status === 'READY';
}

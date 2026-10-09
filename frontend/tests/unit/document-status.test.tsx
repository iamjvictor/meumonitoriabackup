import { describe, expect, it } from 'vitest';
import { isTeacherDocumentProcessing, isTeacherDocumentValid } from '../../src/modules/teacher/models/document-status';

describe('document status model', () => {
  it('considera somente READY uma base válida', () => {
    expect(isTeacherDocumentValid('READY')).toBe(true);
    expect(isTeacherDocumentValid('FAILED')).toBe(false);
    expect(isTeacherDocumentValid('PARTIAL_SUCCESS')).toBe(false);
    expect(isTeacherDocumentValid('NEEDS_OCR')).toBe(false);
  });

  it('mantém QUEUED e PROCESSING em acompanhamento', () => {
    expect(isTeacherDocumentProcessing('QUEUED')).toBe(true);
    expect(isTeacherDocumentProcessing('PROCESSING')).toBe(true);
    expect(isTeacherDocumentProcessing('FAILED')).toBe(false);
  });
});

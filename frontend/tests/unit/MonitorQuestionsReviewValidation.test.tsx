import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MonitorQuestionsReviewTab } from '@/modules/teacher/components/monitor/MonitorQuestionsReviewTab';
import { TeacherMonitorService } from '@/modules/teacher/services/TeacherMonitorService';

const fetchMock = vi.fn();
const monitorId = 'monitor-review-validation';
const questionId = 'question-review-validation';
const validAlternatives = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, text: `Alternativa ${label}` }));

function successResponse(data: unknown = { id: questionId }) {
  return { status: 200, ok: true, json: async () => ({ data }) };
}

function ReviewTabHarness() {
  const [draft, setDraft] = useState({
    id: questionId,
    topicName: 'Álgebra',
    sourceDocName: 'simulado.pdf',
    originType: 'source_doc' as const,
    prompt: '  ',
    options: validAlternatives.map((option) => option.label === 'A' ? { letter: option.label, text: '' } : { letter: option.label, text: option.text }),
    correctAnswer: 'A',
    explanation: '',
    status: 'pending_review' as const,
  });
  const noop = vi.fn();
  const props = {
    questionFileInputRef: { current: null },
    selectedTopicId: null,
    isSubmittingUploads: false,
    handleFilesSelected: noop,
    showAlert: noop,
    queuedUploads: [],
    setUploadsByView: noop,
    formatFileSize: () => '',
    stagedCount: 0,
    setIsUploadConfirmModalOpen: noop,
    isDraggingFiles: false,
    setIsDraggingFiles: noop,
    queueFiles: noop,
    reviewFilter: 'all',
    setReviewFilter: noop,
    pendingQuestionsCount: 1,
    approvedQuestionsCount: 0,
    incompleteQuestionsCount: 0,
    noTopicQuestionsCount: 0,
    noOptionsQuestionsCount: 0,
    noAnswerQuestionsCount: 0,
    noExplanationQuestionsCount: 0,
    monitor: null,
    setQuestions: noop,
    setEditingQuestionId: noop,
    setEditQuestionDraft: setDraft,
    filteredQuestions: [draft],
    questions: [draft],
    selectedQuestionIds: [],
    setSelectedQuestionIds: noop,
    isBulkProcessing: false,
    handleBulkApproveQuestions: noop,
    handleBulkRejectQuestions: noop,
    editingQuestionId: questionId,
    editQuestionDraft: draft,
    isQuestionIncomplete: () => true,
    toggleSelectQuestion: noop,
    isQuestionNoTopic: () => false,
    isQuestionNoOptions: () => true,
    isQuestionNoAnswer: () => true,
    isQuestionNoExplanation: () => false,
    handleStartEditQuestion: noop,
    handleOpenCreateQuestion: noop,
    handleCancelEditQuestion: noop,
    isSavingQuestion: false,
    handleSaveQuestionEdit: noop,
    handleQuestionAction: noop,
    showQuestionEditValidation: true,
  };
  return <MonitorQuestionsReviewTab {...props} />;
}

describe('edição e serviço de revisão de questões', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows inline invalid-field feedback and lets the teacher correct the draft', () => {
    render(<ReviewTabHarness />);

    const prompt = screen.getByPlaceholderText(/digite o enunciado da questão/i);
    const optionA = screen.getByPlaceholderText(/texto da alternativa A/i);
    expect(prompt).toHaveAttribute('aria-invalid', 'true');
    expect(optionA).toHaveAttribute('aria-invalid', 'true');
    const inlineErrors = screen.getAllByRole('alert').map((alert) => alert.textContent).join(' ');
    expect(inlineErrors).toMatch(/enunciado/i);
    expect(inlineErrors).toMatch(/Preencha a alternativa A/i);
    expect(inlineErrors).toMatch(/gabarito/i);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(prompt, { target: { value: 'Enunciado válido' } });
    fireEvent.change(optionA, { target: { value: 'Alternativa A' } });
    expect(prompt).not.toHaveAttribute('aria-invalid', 'true');
    expect(optionA).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('blocks invalid content updates before fetch, but allows status-only moderation', async () => {
    fetchMock.mockResolvedValue(successResponse());
    await expect(TeacherMonitorService.reviewQuestion(monitorId, questionId, {
      status: 'PENDING_REVIEW', text: '  ', alternatives: validAlternatives, correctAnswer: 'A',
    })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(TeacherMonitorService.reviewQuestion(monitorId, questionId, { status: 'REJECTED' }))
      .resolves.toEqual({ id: questionId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ status: 'REJECTED' });
  });

  it('allows a valid content update with an omitted or empty explanation', async () => {
    fetchMock.mockResolvedValue(successResponse());
    const basePayload = {
      status: 'APPROVED' as const,
      text: 'Enunciado válido',
      alternatives: validAlternatives,
      correctAnswer: 'A',
    };

    await expect(TeacherMonitorService.reviewQuestion(monitorId, questionId, basePayload))
      .resolves.toEqual({ id: questionId });
    await expect(TeacherMonitorService.reviewQuestion(monitorId, questionId, { ...basePayload, explanation: '' }))
      .resolves.toEqual({ id: questionId });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonitorQuestionsReviewTab } from '@/modules/teacher/components/monitor/MonitorQuestionsReviewTab';

const question = {
  id: 'question-1',
  topicName: 'Cinética química',
  sourceDocName: 'simulado.pdf',
  originType: 'source_doc' as const,
  prompt: 'A velocidade é $$v = k[H_2O_2]$$.',
  options: [{ letter: 'A', text: 'A constante é $4,0 \\times 10^{-7}\\,s^{-1}$.' }],
  correctAnswer: 'A',
  explanation: '',
  status: 'pending_review' as const,
};

type VisualAsset = { assetId: string; role: string; pageNumber: number; imageUrl: string | null; width: number | null; height: number | null; anchorText?: string | null; bbox?: [left: number, top: number, right: number, bottom: number] | null };

function renderReview(visualAssets?: VisualAsset[], prompt = question.prompt) {
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
    setEditQuestionDraft: noop,
    filteredQuestions: [{ ...question, prompt, visualAssets }],
    questions: [{ ...question, prompt, visualAssets }],
    selectedQuestionIds: [],
    setSelectedQuestionIds: noop,
    isBulkProcessing: false,
    handleBulkApproveQuestions: noop,
    handleBulkRejectQuestions: noop,
    editingQuestionId: null,
    editQuestionDraft: null,
    isQuestionIncomplete: () => false,
    toggleSelectQuestion: noop,
    isQuestionNoTopic: () => false,
    isQuestionNoOptions: () => false,
    isQuestionNoAnswer: () => false,
    isQuestionNoExplanation: () => false,
    handleStartEditQuestion: noop,
    handleOpenCreateQuestion: noop,
    handleCancelEditQuestion: noop,
    isSavingQuestion: false,
    handleSaveQuestionEdit: noop,
    handleQuestionAction: noop,
  };
  return { ...render(<MonitorQuestionsReviewTab {...props} />), props };
}

describe('MonitorQuestionsReviewTab rich question content', () => {
  it('renders math in the statement and alternatives as KaTeX', () => {
    const { container } = renderReview();

    expect(container.querySelectorAll('.katex')).toHaveLength(2);
    expect(screen.getByText(/A velocidade é/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('$v =');
  });

  it('places a linked figure at its exact text anchor and falls back to the end when the anchor is missing', () => {
    const anchored = renderReview([{
      assetId: 'figure-asset', role: 'STATEMENT', pageNumber: 5, imageUrl: '/figure.png', width: 320, height: 200, anchorText: 'figura aqui', bbox: [12, 24, 300, 180],
    }], 'Texto antes da figura aqui texto depois da figura.');
    const paragraphs = [...anchored.container.querySelectorAll('p')];
    const before = paragraphs.find((paragraph) => paragraph.textContent?.includes('Texto antes da'))!;
    const figure = anchored.container.querySelector('figure')!;
    const after = paragraphs.find((paragraph) => paragraph.textContent?.includes('texto depois da figura.'))!;
    expect(before.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(figure.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(figure).toHaveTextContent('Figura extraída do documento fonte · página 5');

    anchored.unmount();
    const missingAnchor = renderReview([{
      assetId: 'fallback-asset', role: 'STATEMENT', pageNumber: 6, imageUrl: '/fallback.png', width: 320, height: 200, anchorText: 'trecho inexistente',
    }], 'Texto antes da figura aqui texto depois da figura.');
    const fallbackFigure = missingAnchor.container.querySelector('figure')!;
    const fullPrompt = [...missingAnchor.container.querySelectorAll('p')].find((paragraph) => paragraph.textContent?.includes('Texto antes da figura aqui texto depois da figura.'))!;
    expect(fullPrompt.compareDocumentPosition(fallbackFigure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fallbackFigure).toHaveTextContent('Figura extraída do documento fonte · página 6');
  });

  it('shows only a visual asset linked to the question and no image placeholder', () => {
    const firstRender = renderReview();

    expect(firstRender.container.querySelector('img')).not.toBeInTheDocument();

    firstRender.unmount();
    const withAsset = renderReview([
      { assetId: 'page-asset', role: 'PAGE', pageNumber: 5, imageUrl: '/whole-page.png', width: 320, height: 200 },
      { assetId: 'figure-asset', role: 'STATEMENT', pageNumber: 5, imageUrl: '/figure.png', width: 320, height: 200 },
    ]);
    expect(withAsset.container.querySelectorAll('img')).toHaveLength(1);
    expect(withAsset.container.querySelector('img')).toHaveAttribute('src', '/figure.png');
  });
});

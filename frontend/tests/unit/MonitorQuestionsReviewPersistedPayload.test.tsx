import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonitorQuestionsReviewTab } from '@/modules/teacher/components/monitor/MonitorQuestionsReviewTab';

type PersistedQuestion = {
  id: string;
  number: string;
  text: string;
  alternatives: Array<{ label: string; text: string }>;
  correctAnswer: string | null;
  status: string;
  visualAssets: Array<{
    assetId: string;
    role: string;
    pageNumber: number;
    bbox: [number, number, number, number] | null;
    width: number | null;
    height: number | null;
    anchorText: string | null;
    readingOrder: number | null;
    sourceItemRef: string | null;
    imageUrlPresent: boolean;
  }>;
};

const savedPayload = JSON.parse(readFileSync(
  resolve(process.cwd(), '../tests/document-parser/results/quimica-3-content-review-local-2026-11-06.json'),
  'utf8',
)) as { questions: PersistedQuestion[] };

function renderSavedQuestion(questionNumber: string) {
  const saved = savedPayload.questions.find((question) => question.number === questionNumber);
  if (!saved) throw new Error(`Questão ${questionNumber} não encontrada no payload salvo.`);
  const question = {
    id: saved.id,
    topicName: 'Cinética química',
    sourceDocName: 'Quimica-3-QA-2026-11-06.pdf',
    originType: 'source_doc' as const,
    prompt: saved.text,
    options: saved.alternatives.map((alternative) => ({ letter: alternative.label, text: alternative.text })),
    correctAnswer: saved.correctAnswer ?? '',
    explanation: '',
    status: 'pending_review' as const,
    visualAssets: saved.visualAssets.map((asset) => ({ ...asset,
      imageUrl: asset.imageUrlPresent ? `/local-storage/${asset.assetId}.png` : null,
    })),
  };
  const noop = vi.fn();
  const props = {
    questionFileInputRef: { current: null }, selectedTopicId: null, isSubmittingUploads: false,
    handleFilesSelected: noop, showAlert: noop, queuedUploads: [], setUploadsByView: noop,
    formatFileSize: () => '', stagedCount: 0, setIsUploadConfirmModalOpen: noop,
    isDraggingFiles: false, setIsDraggingFiles: noop, queueFiles: noop,
    reviewFilter: 'all', setReviewFilter: noop, pendingQuestionsCount: 1, approvedQuestionsCount: 0,
    incompleteQuestionsCount: 0, noTopicQuestionsCount: 0, noOptionsQuestionsCount: 0,
    noAnswerQuestionsCount: 0, noExplanationQuestionsCount: 0, monitor: null,
    setQuestions: noop, setEditingQuestionId: noop, setEditQuestionDraft: noop,
    filteredQuestions: [question], questions: [question], selectedQuestionIds: [],
    setSelectedQuestionIds: noop, isBulkProcessing: false, handleBulkApproveQuestions: noop,
    handleBulkRejectQuestions: noop, editingQuestionId: null, editQuestionDraft: null,
    isQuestionIncomplete: () => false, toggleSelectQuestion: noop,
    isQuestionNoTopic: () => false, isQuestionNoOptions: () => false,
    isQuestionNoAnswer: () => false, isQuestionNoExplanation: () => false,
    handleStartEditQuestion: noop, handleOpenCreateQuestion: noop, handleCancelEditQuestion: noop,
    isSavingQuestion: false, handleSaveQuestionEdit: noop, handleQuestionAction: noop,
  };
  return render(<MonitorQuestionsReviewTab {...props} />);
}

describe('revisão renderiza o payload real persistido de Quimica-3', () => {
  it('renderiza a equação Q04, 10^7, L^-1 e s^-1 como matemática', () => {
    const { container } = renderSavedQuestion('04');
    const math = [...container.querySelectorAll('.katex')];

    expect(math.length).toBeGreaterThanOrEqual(5);
    expect(container.textContent).not.toContain('$10^{7}$');
    expect(container.textContent).not.toContain('$L^{-1}$');
    expect(container.textContent).not.toContain('$s^{-1}$');
    expect(screen.getByText(/4,0 x/)).toBeInTheDocument();
  });

  it('renderiza a fração 1/2 O2 da Q05 como fração matemática', () => {
    const { container } = renderSavedQuestion('05');

    expect(container.querySelector('.katex .mfrac')).toBeInTheDocument();
    expect(container.textContent).not.toContain('\\lceil');
  });

  it('mantém a figura da tabela periódica da Q01 no ponto ancorado e com proveniência', () => {
    const { container } = renderSavedQuestion('01');
    const figure = container.querySelector('figure')!;
    const image = figure.querySelector('img')!;
    const paragraphs = [...container.querySelectorAll('p')];
    const before = paragraphs.find((paragraph) => paragraph.textContent?.includes('Indique o grupo e o período'))!;
    const after = paragraphs.find((paragraph) => paragraph.textContent?.includes('Nomeie, ainda, a ligação'))!;

    expect(image).toHaveAttribute('src', `/local-storage/${savedPayload.questions.find((question) => question.number === '01')!.visualAssets[0]!.assetId}.png`);
    expect(image).toHaveAttribute('alt', expect.stringContaining('página 15'));
    expect(figure).toHaveTextContent('Figura extraída do documento fonte · página 15');
    expect(before.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(figure.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

'use client';
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization, @typescript-eslint/no-explicit-any -- controller legado preservado sem alterar a UI. */

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BrainCircuit,
  FileText,
  ListChecks,
  LoaderCircle,
  Sparkles,
} from 'lucide-react';
import { TeacherMonitor, TeacherMonitorService } from '@/modules/teacher/services/TeacherMonitorService';
import type { MonitorDraft } from '@/modules/teacher/components/TeacherMonitorCreationModal';
import { TeacherSessionError } from '@/modules/teacher/services/TeacherSessionError';
import { TeacherProfileService, TeacherProfile } from '@/modules/teacher/services/TeacherProfileService';
import { AlertModal } from '@/shared';
import { MonitorHeader } from '@/modules/teacher/components/monitor/MonitorHeader';
import { MonitorStructureSidebar } from '@/modules/teacher/components/monitor/MonitorStructureSidebar';
import { MonitorKnowledgeTab } from '@/modules/teacher/components/monitor/MonitorKnowledgeTab';
import { MonitorQuestionsReviewTab } from '@/modules/teacher/components/monitor/MonitorQuestionsReviewTab';
import { MonitorFlashcardsReviewTab } from '@/modules/teacher/components/monitor/MonitorFlashcardsReviewTab';
import { MonitorSettingsPanel } from '@/modules/teacher/components/monitor/MonitorSettingsPanel';
import { useMonitorQuestions } from '@/modules/teacher/hooks/useMonitorQuestions';
import { useMonitorFlashcards } from '@/modules/teacher/hooks/useMonitorFlashcards';
import { useMonitorSettings } from '@/modules/teacher/hooks/useMonitorSettings';
import { useQuestionUpload } from '@/modules/teacher/hooks/useQuestionUpload';
import { isTeacherDocumentProcessing, isTeacherDocumentValid, type TeacherDocumentStatus } from '@/modules/teacher/models/document-status';

const MonitorFlashcardEditorModal = dynamic(
  () => import('@/modules/teacher/components/monitor/MonitorFlashcardEditorModal').then((module) => module.MonitorFlashcardEditorModal),
  { ssr: false, loading: () => null }
);
const TeacherMonitorStructureModal = dynamic(
  () => import('@/modules/teacher/components/TeacherMonitorCreationModal').then((module) => module.TeacherMonitorCreationModal),
  { ssr: false, loading: () => null }
);
const UploadConfirmationModal = dynamic(
  () => import('@/modules/teacher/components/monitor/UploadConfirmationModal').then((module) => module.UploadConfirmationModal),
  { ssr: false, loading: () => null }
);

type WorkspaceView = 'knowledge' | 'questions' | 'flashcards';
type UploadStatus = 'staged' | 'uploading' | 'uploaded' | 'failed';
type QueuedUpload = {
  id: string;
  file: File;
  subjectId: string;
  subjectName: string;
  topicId?: string;
  status: UploadStatus;
  error?: string;
};

type ReviewStatus = 'pending_review' | 'approved' | 'reported' | 'rejected';

type QuestionItem = {
  id: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  topicName: string;
  sourceDocName: string;
  originType: 'source_doc' | 'ai_generated';
  prompt: string;
  options: { letter: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  status: ReviewStatus;
};

type FlashcardItem = {
  id: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  topicName: string;
  sourceDocName: string;
  originType: 'source_doc' | 'ai_generated';
  front: string;
  back: string;
  difficulty: 'Fácil' | 'Médio' | 'Difícil';
  status: ReviewStatus;
};

type DocumentItem = {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  status: TeacherDocumentStatus;
  createdAt: string;
  subjectId?: string;
  subjectName?: string;
  topicId?: string;
  topicName?: string;
};

function mapDocumentItem(d: any): DocumentItem {
  return {
    id: d.id,
    originalName: d.originalName,
    mimeType: d.mimeType,
    fileSize: d.sizeBytes ?? d.fileSize ?? 0,
    status: d.status,
    createdAt: d.createdAt,
    subjectId: d.subjectId || d.subject?.id,
    subjectName: d.subject?.name,
    topicId: d.topicId || d.topic?.id,
    topicName: d.topic?.name,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const workspaceViews: Array<{ id: WorkspaceView; label: string; icon: typeof FileText; key: 'knowledgeBaseCount' | 'questionsCount' | 'flashcardsCount' }> = [
  { id: 'knowledge', label: 'Base de Conhecimento', icon: FileText, key: 'knowledgeBaseCount' },
  { id: 'questions', label: 'Banco de Questões', icon: ListChecks, key: 'questionsCount' },
  { id: 'flashcards', label: 'Flashcards', icon: BrainCircuit, key: 'flashcardsCount' },
];

const INITIAL_QUESTIONS: QuestionItem[] = [];
const INITIAL_FLASHCARDS: FlashcardItem[] = [];


export default function TeacherMonitorPage() {
  const params = useParams<{ monitorId: string }>();
  const router = useRouter();
  const [monitor, setMonitor] = useState<TeacherMonitor | null>(null);
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>('knowledge');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const flashcardFileInputRef = useRef<HTMLInputElement>(null);
  const questionFileInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showAlert('Imagem muito grande', 'A imagem deve ter no máximo 5MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setEditInfoAvatarUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatarPhoto = () => {
    setEditInfoAvatarUrl('');
    if (avatarFileInputRef.current) avatarFileInputRef.current.value = '';
  };

  // Reusable Alert Modal State
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<'error' | 'success' | 'warning' | 'info'>('warning');

  const showAlert = (title: string, message: string, type: 'error' | 'success' | 'warning' | 'info' = 'warning') => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
    setAlertOpen(true);
  };
  
  const [uploadsByView, setUploadsByView] = useState<Record<WorkspaceView, QueuedUpload[]>>({
    knowledge: [],
    questions: [],
    flashcards: [],
  });
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isSubmittingUploads, setIsSubmittingUploads] = useState(false);
  const [isUploadConfirmModalOpen, setIsUploadConfirmModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [sidebarView, setSidebarView] = useState<'structure' | 'settings'>('structure');
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editInfoName, setEditInfoName] = useState('');
  const [editInfoDescription, setEditInfoDescription] = useState('');
  const [editInfoAvatarUrl, setEditInfoAvatarUrl] = useState('');
  const [editInfoDetailedDescription, setEditInfoDetailedDescription] = useState('');
  const [isSavingInfo, setIsSavingInfo] = useState(false);

  // esteira de revisão (questões e flashcards) e documentos da base de conhecimento
  const { questions, setQuestions } = useMonitorQuestions<QuestionItem>(INITIAL_QUESTIONS);
  const { flashcards, setFlashcards } = useMonitorFlashcards<FlashcardItem>(INITIAL_FLASHCARDS);
  const { setSettings: setMonitorSettings, save: saveMonitorSettings } =
    useMonitorSettings<TeacherMonitor | null>(null);
  const { upload: uploadDocument } = useQuestionUpload();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const refreshDocuments = useCallback(async () => {
    const rawDocs = await TeacherMonitorService.listDocuments(params.monitorId);
    setDocuments((rawDocs || []).map(mapDocumentItem));
  }, [params.monitorId]);
  // Garantir sempre 5 alternativas (A, B, C, D, E) por questão
  const ensureFiveOptions = (opts?: { letter: string; text: string }[]) => {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const existingMap = new Map((opts || []).map((opt) => [opt.letter.toUpperCase(), opt.text]));
    return letters.map((letter) => ({
      letter,
      text: existingMap.get(letter) || '',
    }));
  };

  // Funções auxiliares para identificar dados incompletos / campos nulos
  const isQuestionNoTopic = useCallback((q: QuestionItem) => (
    !q.topicId || !q.topicName || q.topicName.trim() === '' || q.topicName === 'Geral' || q.topicName === 'Sem tópico'
  ), []);

  const isQuestionNoOptions = useCallback((q: QuestionItem) => (
    !q.options || q.options.length === 0 || q.options.every((opt) => !opt.text || opt.text.trim() === '')
  ), []);

  const isQuestionNoAnswer = useCallback((q: QuestionItem) => (
    !q.correctAnswer || q.correctAnswer.trim() === ''
  ), []);

  const isQuestionNoExplanation = useCallback((q: QuestionItem) => (
    !q.explanation || q.explanation.trim() === ''
  ), []);

  const isQuestionIncomplete = useCallback((q: QuestionItem) => (
    isQuestionNoTopic(q) || isQuestionNoOptions(q) || isQuestionNoAnswer(q)
  ), [isQuestionNoOptions, isQuestionNoAnswer, isQuestionNoTopic]);

  const isFlashcardNoTopic = useCallback((fc: FlashcardItem) => (
    !fc.topicId || !fc.topicName || fc.topicName.trim() === '' || fc.topicName === 'Geral' || fc.topicName === 'Sem tópico'
  ), []);

  const isFlashcardIncomplete = useCallback((fc: FlashcardItem) => isFlashcardNoTopic(fc), [isFlashcardNoTopic]);

  const [reviewFilter, setReviewFilter] = useState<
    | 'all'
    | 'pending'
    | 'approved'
    | 'reported'
    | 'source_doc'
    | 'ai_generated'
    | 'incomplete'
    | 'no_topic'
    | 'no_options'
    | 'no_answer'
    | 'no_explanation'
  >('pending');

  // Estado para controlar a exibição dos headers de escopo e abas no scroll
  const [showWorkspaceHeaders, setShowWorkspaceHeaders] = useState(true);
  const lastScrollTopRef = useRef(0);

  const handleWorkspaceScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    const diff = currentScrollTop - lastScrollTopRef.current;

    if (currentScrollTop < 50) {
      setShowWorkspaceHeaders(true);
    } else if (diff > 8) {
      setShowWorkspaceHeaders(false);
    } else if (diff < -8) {
      setShowWorkspaceHeaders(true);
    }

    lastScrollTopRef.current = currentScrollTop;
  };

  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setError(null);

    Promise.all([
      TeacherMonitorService.getMine(params.monitorId),
      TeacherMonitorService.listQuestions(params.monitorId).catch(() => []),
      TeacherMonitorService.listFlashcards(params.monitorId).catch(() => []),
      TeacherMonitorService.listDocuments(params.monitorId).catch(() => []),
      TeacherProfileService.getMyProfile().catch(() => ({ hasProfile: false, teacher: null })),
    ])
      .then(([monitorResult, rawQuestions, rawFlashcards, rawDocs, profileResult]) => {
        if (!isCurrent) return;

        setMonitor(monitorResult);
        setMonitorSettings(monitorResult);
        setTeacher(profileResult.teacher || null);
        setEditInfoName(monitorResult.name);
        setEditInfoDescription(monitorResult.description || '');
        setEditInfoAvatarUrl(monitorResult.avatarUrl || '');
        setEditInfoDetailedDescription(monitorResult.detailedDescription || '');
        const firstSubject = monitorResult.subjects[0];
        setSelectedSubjectId(firstSubject?.id || null);
        setSelectedTopic(firstSubject?.topicRefs?.[0]?.name || firstSubject?.topics?.[0] || null);

        const isAiOrigin = (val: unknown): boolean => {
          if (!val) return false;
          const str = String(val).toUpperCase();
          return str.includes('AI') || str.includes('SYNTHETIC') || str.includes('GENERATED');
        };

        const mappedQuestions: QuestionItem[] = (rawQuestions || []).map((q: any) => {
          const docName = q.sources?.[0]?.document?.originalName;

          // Se gabarito, explicação, alternativas ou enunciado forem gerados por IA, requer Revisão de IA
          const hasAiPart =
            isAiOrigin(q.correctAnswerOrigin || q.correct_answer_origin) ||
            isAiOrigin(q.explanationOrigin || q.explanation_origin) ||
            isAiOrigin(q.alternativesOrigin || q.alternatives_origin) ||
            isAiOrigin(q.statementOrigin || q.statement_origin);

          const isAiGenerated = hasAiPart || !docName;
          const originType: 'source_doc' | 'ai_generated' = isAiGenerated ? 'ai_generated' : 'source_doc';

          return {
            id: q.id,
            subjectId: q.subjectId || q.subject?.id,
            subjectName: q.subject?.name,
            topicId: q.topicId || q.topic?.id,
            topicName: q.topic?.name || q.subject?.name || 'Geral',
            sourceDocName: docName || 'Gerada por IA',
            originType,
            prompt: q.text,
            options: ensureFiveOptions(
              (Array.isArray(q.alternatives) ? q.alternatives : []).map((alt: any) => ({
                letter: alt.label || alt.letter || 'A',
                text: alt.text || '',
              }))
            ),
            correctAnswer: q.correctAnswer || '',
            explanation: q.explanation || '',
            status: q.status === 'APPROVED' ? 'approved' : q.status === 'REPORTED' ? 'reported' : q.status === 'REJECTED' ? 'rejected' : 'pending_review',
          };
        });
        setQuestions(mappedQuestions);

        const mappedFlashcards: FlashcardItem[] = (rawFlashcards || []).map((fc: any) => {
          const docName = fc.sources?.[0]?.chunk?.document?.originalName;
          const hasAiPart = isAiOrigin(fc.generationOrigin || fc.generation_origin);
          const isAiGenerated = hasAiPart || !docName;
          const originType: 'source_doc' | 'ai_generated' = isAiGenerated ? 'ai_generated' : 'source_doc';

          return {
            id: fc.id,
            subjectId: fc.subjectId || fc.subject?.id,
            subjectName: fc.subject?.name,
            topicId: fc.topicId || fc.topic?.id,
            topicName: fc.topic?.name || fc.subject?.name || 'Geral',
            sourceDocName: docName || 'Gerado por IA',
            originType,
            front: fc.front,
            back: fc.back,
            difficulty: fc.difficulty === 'HARD' ? 'Difícil' : fc.difficulty === 'EASY' ? 'Fácil' : 'Médio',
            status: fc.status === 'APPROVED' ? 'approved' : fc.status === 'REPORTED' ? 'reported' : fc.status === 'REJECTED' ? 'rejected' : 'pending_review',
          };
        });
        setFlashcards(mappedFlashcards);

        const mappedDocs: DocumentItem[] = (rawDocs || []).map(mapDocumentItem);
        setDocuments(mappedDocs);
      })
      .catch((loadError) => {
        if (!isCurrent) return;
        if (loadError instanceof TeacherSessionError) {
          router.replace('/?login=true&perfil=professor&session=expired');
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o Monitor de IA.');
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [params.monitorId, setFlashcards, setMonitorSettings, setQuestions]);

  useEffect(() => {
    if (!documents.some((document) => isTeacherDocumentProcessing(document.status))) return;

    const intervalId = window.setInterval(() => {
      void refreshDocuments().catch((refreshError) => {
        console.error('Erro ao acompanhar processamento dos documentos:', refreshError);
      });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [documents, refreshDocuments]);


  // Estado para adicionar/remover Matérias e Tópicos na Sidebar
  const [isAddSubjectModalOpen, setIsAddSubjectModalOpen] = useState(false);

  const [activeTopicInputSubjectId, setActiveTopicInputSubjectId] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicDefinition, setNewTopicDefinition] = useState('');

  const openAddSubjectModal = () => {
    setIsAddSubjectModalOpen(true);
  };

  const closeAddSubjectModal = () => {
    setIsAddSubjectModalOpen(false);
  };

  const handleAddSubjectsFromDraft = async (draft: MonitorDraft) => {
    if (!params.monitorId) throw new Error('Monitor não encontrado.');
    try {
      const existingSubjectCount = monitor?.subjects.length ?? 0;
      const existingSubjectIds = new Set(monitor?.subjects.map((subject) => subject.id) ?? []);
      const updatedMonitor = await TeacherMonitorService.addSubjectsFromDraft(params.monitorId, draft);
      setMonitor(updatedMonitor);
      const selectedAfterEdit = updatedMonitor.subjects.find((subject) => !existingSubjectIds.has(subject.id))
        ?? updatedMonitor.subjects[Math.min(existingSubjectCount - 1, updatedMonitor.subjects.length - 1)];
      if (selectedAfterEdit) {
        setSelectedSubjectId(selectedAfterEdit.id);
        setSelectedTopic(selectedAfterEdit.topicRefs?.[0]?.name || selectedAfterEdit.topics?.[0] || null);
      }
    } catch (error) {
      if (error instanceof TeacherSessionError) {
        router.replace('/?login=true&perfil=professor&session=expired');
        return;
      }
      throw error;
    }
  };

  const handleDeleteSubject = async (subjectId: string) => {
    if (!params.monitorId) return;
    if ((monitor?.subjects.length ?? 0) <= 1) {
      showAlert('Matéria obrigatória', 'O monitor precisa ter pelo menos uma matéria. Adicione outra antes de remover esta.', 'warning');
      return;
    }
    if (!confirm('Deseja realmente remover esta matéria e seus tópicos?')) return;

    try {
      const updatedMonitor = await TeacherMonitorService.deleteSubject(params.monitorId, subjectId);
      setMonitor(updatedMonitor);
      if (selectedSubjectId === subjectId) {
        const nextSubject = updatedMonitor.subjects[0];
        setSelectedSubjectId(nextSubject?.id || null);
        setSelectedTopic(nextSubject?.topicRefs?.[0]?.name || nextSubject?.topics?.[0] || null);
      }
    } catch (err) {
      console.error('Erro ao remover matéria:', err);
    }
  };

  const handleSaveMonitorInfo = async () => {
    if (!monitor || !editInfoName.trim() || !params.monitorId) return;
    setIsSavingInfo(true);
    try {
      const updated = await saveMonitorSettings(params.monitorId, {
        name: editInfoName.trim(),
        description: editInfoDescription.trim() || null,
        avatarUrl: editInfoAvatarUrl.trim() || null,
        detailedDescription: editInfoDetailedDescription.trim() || null,
      });
      setMonitor(updated);
      setIsEditingInfo(false);
    } catch (err: any) {
      showAlert('Falha ao Atualizar', err.message || 'Erro ao atualizar as informações do monitor.', 'error');
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleAddTopic = async (subjectId: string, nameOverride?: string) => {
    const name = (nameOverride ?? newTopicName).trim();
    if (!name || !params.monitorId) return;
    const definition = newTopicDefinition.trim();
    setNewTopicName('');
    setNewTopicDefinition('');
    setActiveTopicInputSubjectId(null);

    try {
      const updatedMonitor = await TeacherMonitorService.addTopic(params.monitorId, subjectId, name, definition);
      setMonitor(updatedMonitor);
    } catch (err) {
      console.error('Erro ao adicionar tópico:', err);
    }
  };

  const handleDeleteTopic = async (subjectId: string, topicId?: string, topicName?: string) => {
    if (!params.monitorId) return;
    if (!confirm(`Deseja realmente remover o tópico "${topicName || 'selecionado'}"?`)) return;

    try {
      let nextTopic: string | null = null;
      if (topicId) {
        const updatedMonitor = await TeacherMonitorService.deleteTopic(params.monitorId, subjectId, topicId);
        setMonitor(updatedMonitor);
        const updatedSubject = updatedMonitor.subjects.find((subject) => subject.id === subjectId);
        nextTopic = updatedSubject?.topicRefs?.[0]?.name || updatedSubject?.topics?.[0] || null;
      } else {
        const currentSubject = monitor?.subjects.find((subject) => subject.id === subjectId);
        nextTopic = currentSubject?.topicRefs?.filter((topic) => topic.name !== topicName)?.[0]?.name || null;
        setMonitor((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            subjects: prev.subjects.map((s) => {
              if (s.id !== subjectId) return s;
              return {
                ...s,
                topics: s.topics.filter((t) => t !== topicName),
                topicRefs: s.topicRefs.filter((r) => r.name !== topicName),
              };
            }),
          };
        });
      }

      if (selectedTopic === topicName) {
        setSelectedTopic(nextTopic);
      }
    } catch (err) {
      console.error('Erro ao remover tópico:', err);
    }
  };

  // Estado para seleção e aprovação em lote de Questões
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState<boolean>(false);

  const toggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkApproveQuestions = async () => {
    if (selectedQuestionIds.length === 0 || !params.monitorId) return;
    setIsBulkProcessing(true);
    const targetIds = [...selectedQuestionIds];

    setQuestions((prev) =>
      prev.map((q) => (targetIds.includes(q.id) ? { ...q, status: 'approved' } : q))
    );
    setSelectedQuestionIds([]);

    try {
      await Promise.all(
        targetIds.map((id) => TeacherMonitorService.reviewQuestion(params.monitorId, id, { status: 'APPROVED' }))
      );
    } catch (err) {
      console.error('Erro ao aprovar questões em lote:', err);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkRejectQuestions = async () => {
    if (selectedQuestionIds.length === 0 || !params.monitorId) return;
    setIsBulkProcessing(true);
    const targetIds = [...selectedQuestionIds];

    setQuestions((prev) =>
      prev.map((q) => (targetIds.includes(q.id) ? { ...q, status: 'rejected' } : q))
    );
    setSelectedQuestionIds([]);

    try {
      await Promise.all(
        targetIds.map((id) => TeacherMonitorService.reviewQuestion(params.monitorId, id, { status: 'REJECTED' }))
      );
    } catch (err) {
      console.error('Erro ao descartar questões em lote:', err);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Estado para seleção e aprovação em lote de Flashcards
  const [selectedFlashcardIds, setSelectedFlashcardIds] = useState<string[]>([]);

  const toggleSelectFlashcard = (id: string) => {
    setSelectedFlashcardIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkApproveFlashcards = async () => {
    if (selectedFlashcardIds.length === 0 || !params.monitorId) return;
    setIsBulkProcessing(true);
    const targetIds = [...selectedFlashcardIds];

    setFlashcards((prev) =>
      prev.map((fc) => (targetIds.includes(fc.id) ? { ...fc, status: 'approved' } : fc))
    );
    setSelectedFlashcardIds([]);

    try {
      await Promise.all(
        targetIds.map((id) => TeacherMonitorService.reviewFlashcard(params.monitorId, id, { status: 'APPROVED' }))
      );
    } catch (err) {
      console.error('Erro ao aprovar flashcards em lote:', err);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkRejectFlashcards = async () => {
    if (selectedFlashcardIds.length === 0 || !params.monitorId) return;
    setIsBulkProcessing(true);
    const targetIds = [...selectedFlashcardIds];

    setFlashcards((prev) =>
      prev.map((fc) => (targetIds.includes(fc.id) ? { ...fc, status: 'rejected' } : fc))
    );
    setSelectedFlashcardIds([]);

    try {
      await Promise.all(
        targetIds.map((id) => TeacherMonitorService.reviewFlashcard(params.monitorId, id, { status: 'REJECTED' }))
      );
    } catch (err) {
      console.error('Erro ao descartar flashcards em lote:', err);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Estado para edição inline de Questão
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionDraft, setEditQuestionDraft] = useState<QuestionItem | null>(null);
  const [isSavingQuestion, setIsSavingQuestion] = useState<boolean>(false);

  // Estado para edição/criação com modal e live preview de Flashcard
  const [editingFlashcardId, setEditingFlashcardId] = useState<string | null>(null);
  const [editFlashcardDraft, setEditFlashcardDraft] = useState<FlashcardItem | null>(null);
  const [isSavingFlashcard, setIsSavingFlashcard] = useState<boolean>(false);
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState<boolean>(false);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');

  const handleStartEditQuestion = (q: QuestionItem) => {
    setEditingQuestionId(q.id);
    const draft: QuestionItem = JSON.parse(JSON.stringify(q));
    
    // Se a questão vier sem tópico ou categorização válida, forçamos o rascunho a ter topicId vazio
    if (isQuestionNoTopic(q)) {
      draft.topicId = '';
      draft.topicName = 'Sem Tópico';
    }

    if (!draft.subjectId && monitor?.subjects?.length) {
      const foundSub = monitor.subjects.find((s) => s.topicRefs?.some((t) => t.id === draft.topicId));
      if (foundSub) {
        draft.subjectId = foundSub.id;
        draft.subjectName = foundSub.name;
      } else {
        draft.subjectId = monitor.subjects[0].id;
        draft.subjectName = monitor.subjects[0].name;
      }
    }
    draft.options = ensureFiveOptions(draft.options);
    setEditQuestionDraft(draft);
  };

  const handleOpenCreateQuestion = () => {
    const currentSub = monitor?.subjects?.find((subject) => subject.id === (selectedSubjectId || monitor?.subjects?.[0]?.id));
    const currentTop = currentSub?.topicRefs?.find((topic) => topic.id === (selectedTopicId || currentSub?.topicRefs?.[0]?.id));
    const newQuestion: QuestionItem = {
      id: `q-${Date.now()}`,
      subjectId: currentSub?.id || '',
      subjectName: currentSub?.name || 'Matemática',
      topicId: currentTop?.id || '',
      topicName: currentTop?.name || 'Geral',
      sourceDocName: 'Criada manualmente pelo professor',
      originType: 'ai_generated',
      prompt: '',
      options: ensureFiveOptions(),
      correctAnswer: 'A',
      explanation: '',
      status: 'pending_review',
    };
    setEditingQuestionId(newQuestion.id);
    setEditQuestionDraft(newQuestion);
  };

  const handleCancelEditQuestion = () => {
    setEditingQuestionId(null);
    setEditQuestionDraft(null);
  };

  const handleSaveQuestionEdit = async () => {
    if (!editQuestionDraft || !params.monitorId) return;
    if (!editQuestionDraft.prompt.trim()) {
      showAlert('Enunciado obrigatório', 'Digite o enunciado antes de salvar a questão.', 'warning');
      return;
    }
    const correctOption = editQuestionDraft.options.find((option) => option.letter === editQuestionDraft.correctAnswer);
    if (!correctOption?.text.trim()) {
      showAlert('Gabarito obrigatório', 'Preencha o texto da alternativa marcada como correta antes de salvar.', 'warning');
      return;
    }
    setIsSavingQuestion(true);
    try {
      let finalQuestionId = editQuestionDraft.id;

      if (editQuestionDraft.id.startsWith('q-')) {
        // Questão manual nova -> Persistir no backend via POST
        const createdData = await TeacherMonitorService.createQuestion(params.monitorId, {
          status: 'APPROVED',
          subjectId: editQuestionDraft.subjectId,
          primaryTopicId: editQuestionDraft.topicId,
          text: editQuestionDraft.prompt,
          alternatives: editQuestionDraft.options.map((opt) => ({
            label: opt.letter,
            text: opt.text,
          })),
          correctAnswer: editQuestionDraft.correctAnswer,
          explanation: editQuestionDraft.explanation,
        });

        if (createdData?.id) {
          finalQuestionId = createdData.id;
        }
      } else {
        // Questão existente -> Atualizar revisão via PUT
        await TeacherMonitorService.reviewQuestion(params.monitorId, editQuestionDraft.id, {
          status: 'APPROVED',
          subjectId: editQuestionDraft.subjectId,
          primaryTopicId: editQuestionDraft.topicId,
          text: editQuestionDraft.prompt,
          alternatives: editQuestionDraft.options.map((opt) => ({
            label: opt.letter,
            text: opt.text,
          })),
          correctAnswer: editQuestionDraft.correctAnswer,
          explanation: editQuestionDraft.explanation,
        });
      }

      const updatedQuestion: QuestionItem = {
        ...editQuestionDraft,
        id: finalQuestionId,
        status: 'approved',
      };

      setQuestions((prev) => editQuestionDraft.id.startsWith('q-')
        ? [updatedQuestion, ...prev]
        : prev.map((q) => (q.id === editQuestionDraft.id ? updatedQuestion : q)));
      setEditingQuestionId(null);
      setEditQuestionDraft(null);
      showAlert('Questão Salva', 'A questão foi salva e aprovada com sucesso!', 'success');
    } catch (err: any) {
      console.error('[handleSaveQuestionEdit] Erro ao salvar questão:', err);
      showAlert('Erro ao Salvar', err?.message || 'Falha ao salvar a questão no servidor.', 'error');
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const _handleStartEditFlashcard = (fc: FlashcardItem) => {
    setEditingFlashcardId(fc.id);
    setEditFlashcardDraft(JSON.parse(JSON.stringify(fc)));
    setPreviewSide('front');
    setIsFlashcardModalOpen(true);
  };

  const handleOpenCreateFlashcardModal = () => {
    setEditingFlashcardId(null);
    setEditFlashcardDraft({
      id: `fc-new-${Date.now()}`,
      topicName: selectedTopic || selectedSubject?.name || 'Matemática',
      sourceDocName: 'Criado manualmente pelo professor',
      originType: 'source_doc',
      front: '',
      back: '',
      difficulty: 'Médio',
      status: 'approved',
    });
    setPreviewSide('front');
    setIsFlashcardModalOpen(true);
  };

  const handleCancelEditFlashcard = () => {
    setEditingFlashcardId(null);
    setEditFlashcardDraft(null);
    setIsFlashcardModalOpen(false);
  };

  const handleSaveFlashcardEdit = async () => {
    if (!editFlashcardDraft || !params.monitorId) return;
    if (!editFlashcardDraft.front?.trim() || !editFlashcardDraft.back?.trim()) {
      showAlert('Campos Obrigatórios', 'Por favor, preencha tanto a frente (pergunta) quanto o verso (resposta) do flashcard.', 'warning');
      return;
    }

    setIsSavingFlashcard(true);
    try {
      const updatedFlashcard: FlashcardItem = { ...editFlashcardDraft, status: 'approved' };

      if (editingFlashcardId) {
        await TeacherMonitorService.reviewFlashcard(params.monitorId, editFlashcardDraft.id, {
          status: 'APPROVED',
          front: editFlashcardDraft.front,
          back: editFlashcardDraft.back,
        });
        setFlashcards((prev) => prev.map((fc) => (fc.id === editFlashcardDraft.id ? updatedFlashcard : fc)));
      } else {
        const newFc: FlashcardItem = {
          ...updatedFlashcard,
          id: `fc-${Date.now()}`,
        };
        setFlashcards((prev) => [newFc, ...prev]);
      }

      setIsFlashcardModalOpen(false);
      setEditingFlashcardId(null);
      setEditFlashcardDraft(null);
    } catch (err: any) {
      showAlert('Erro ao Salvar Flashcard', err?.message || 'Erro ao salvar alterações do flashcard no banco de dados.', 'error');
    } finally {
      setIsSavingFlashcard(false);
    }
  };

  // handlers da esteira de questões conectadas ao banco de dados
  const handleQuestionAction = async (id: string, newStatus: ReviewStatus) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: newStatus } : q))
    );
    const statusApi = newStatus === 'approved' ? 'APPROVED' : newStatus === 'rejected' ? 'REJECTED' : 'PENDING_REVIEW';
    try {
      await TeacherMonitorService.reviewQuestion(params.monitorId, id, { status: statusApi });
    } catch (err) {
      console.error('Erro ao salvar revisão da questão no banco de dados:', err);
    }
  };

  // handlers da esteira de flashcards conectados ao banco de dados
  const _handleFlashcardAction = async (id: string, newStatus: ReviewStatus) => {
    setFlashcards((prev) =>
      prev.map((fc) => (fc.id === id ? { ...fc, status: newStatus } : fc))
    );
    const statusApi = newStatus === 'approved' ? 'APPROVED' : newStatus === 'rejected' ? 'REJECTED' : 'PENDING_REVIEW';
    try {
      await TeacherMonitorService.reviewFlashcard(params.monitorId, id, { status: statusApi });
    } catch (err) {
      console.error('Erro ao salvar revisão do flashcard no banco de dados:', err);
    }
  };

  const selectedSubject = useMemo(
    () => monitor?.subjects.find((subject) => subject.id === selectedSubjectId) || monitor?.subjects[0] || null,
    [monitor, selectedSubjectId]
  );

  const topicCount = monitor?.subjects.reduce((total, subject) => total + subject.topics.length, 0) || 0;
  const isSubjectScope = selectedTopic === null;
  const currentScope = selectedTopic || selectedSubject?.name || monitor?.name || '';
  // A árvore pode exibir um caminho completo ("Álgebra > Funções > ..."),
  // mas uploads e consultas continuam apontando para o tópico raiz existente.
  const selectedTopicId = selectedSubject?.topicRefs.find(
    (topic) => topic.name === selectedTopic || selectedTopic?.startsWith(`${topic.name} > `)
  )?.id;
  const queuedUploads = uploadsByView[activeView];
  const stagedCount = useMemo(
    () => queuedUploads.filter((upload) => upload.status === 'staged').length,
    [queuedUploads]
  );
  const _scopeDescription = isSubjectScope
    ? 'Organize materiais que abrangem toda a matéria ou escolha uma específica na estrutura ao lado.'
    : 'Organize os materiais e a experiência de estudo desta específica.';

  const selectSubject = (subjectId: string) => {
    const subject = monitor?.subjects.find((candidate) => candidate.id === subjectId);
    setSelectedSubjectId(subjectId);
    setSelectedTopic(subject?.topicRefs?.[0]?.name || subject?.topics?.[0] || null);
  };

  const queueFiles = (files: File[]) => {
    if (!selectedSubject) {
      showAlert('Selecione uma matéria', 'Escolha uma matéria antes de adicionar materiais.', 'warning');
      return;
    }
    if (activeView !== 'knowledge' && !selectedTopicId) {
      showAlert('Selecione um tópico', 'Escolha um tópico específico na estrutura do monitor antes de adicionar materiais.', 'warning');
      return;
    }
    const targetView = activeView;
    const candidateUploads = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      subjectId: selectedSubject.id,
      subjectName: selectedSubject.name,
      topicId: targetView === 'knowledge' ? undefined : selectedTopicId,
      status: 'staged' as const,
    }));
    const knownFiles = new Set(
      uploadsByView[targetView].map(({ file, subjectId }) => `${subjectId}-${file.name}-${file.size}-${file.lastModified}`)
    );
    const uniqueUploads: QueuedUpload[] = candidateUploads.filter(
      ({ file, subjectId }) => !knownFiles.has(`${subjectId}-${file.name}-${file.size}-${file.lastModified}`)
    );
    setUploadsByView((uploads) => ({
      ...uploads,
      [targetView]: [...uploads[targetView], ...uniqueUploads],
    }));
  };

  const handleSendQueuedFiles = async () => {
    const targetView = activeView;
    if (stagedCount === 0 || isSubmittingUploads) return;

    setIsSubmittingUploads(true);
    const stagedItems = uploadsByView[targetView].filter((item) => item.status === 'staged');

    try {
      for (const item of stagedItems) {
        setUploadsByView((uploads) => ({
          ...uploads,
          [targetView]: uploads[targetView].map((u) => (u.id === item.id ? { ...u, status: 'uploading' } : u)),
        }));

        try {
          await uploadDocument(params.monitorId, item.file, item.subjectId, item.topicId, targetView);

          setUploadsByView((uploads) => ({
            ...uploads,
            [targetView]: uploads[targetView].map((u) => (u.id === item.id ? { ...u, status: 'uploaded' } : u)),
          }));

          const keyMap: Record<WorkspaceView, 'knowledgeBaseCount' | 'questionsCount' | 'flashcardsCount'> = {
            knowledge: 'knowledgeBaseCount',
            questions: 'questionsCount',
            flashcards: 'flashcardsCount',
          };
          const key = keyMap[targetView];

          setMonitor((prev) => (prev ? { ...prev, [key]: (prev[key] ?? 0) + 1 } : prev));
        } catch (uploadError) {
          console.error('Erro no upload do arquivo:', item.file.name, uploadError);
          if (uploadError instanceof TeacherSessionError) {
            router.replace('/?login=true&perfil=professor&session=expired');
            return;
          }

          setUploadsByView((uploads) => ({
            ...uploads,
            [targetView]: uploads[targetView].map((u) =>
              u.id === item.id
                ? { ...u, status: 'failed', error: uploadError instanceof Error ? uploadError.message : 'Falha no envio.' }
                : u
            ),
          }));
        }
      }
      try {
        await refreshDocuments();
      } catch (err) {
        console.error('Erro ao atualizar lista de documentos:', err);
      }
    } finally {
      setIsSubmittingUploads(false);
    }
  };

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    queueFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const scopeDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (selectedSubject) {
        return (
          doc.subjectId === selectedSubject.id ||
          doc.subjectName === selectedSubject.name ||
          (doc.topicName && selectedSubject.topics.includes(doc.topicName))
        );
      }
      return true;
    });
  }, [documents, selectedSubject]);

  const scopeQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (selectedTopic) {
        return q.topicName === selectedTopic || (selectedTopicId && q.topicId === selectedTopicId);
      }
      if (selectedSubject) {
        return (
          q.subjectId === selectedSubject.id ||
          q.subjectName === selectedSubject.name ||
          (q.topicName && selectedSubject.topics.includes(q.topicName))
        );
      }
      return true;
    });
  }, [questions, selectedTopic, selectedTopicId, selectedSubject]);

  const scopeFlashcards = useMemo(() => {
    return flashcards.filter((fc) => {
      if (selectedTopic) {
        return fc.topicName === selectedTopic || (selectedTopicId && fc.topicId === selectedTopicId);
      }
      if (selectedSubject) {
        return (
          fc.subjectId === selectedSubject.id ||
          fc.subjectName === selectedSubject.name ||
          (fc.topicName && selectedSubject.topics.includes(fc.topicName))
        );
      }
      return true;
    });
  }, [flashcards, selectedTopic, selectedTopicId, selectedSubject]);

  const filteredDocuments = scopeDocuments;

  const filteredQuestions = useMemo(() => {
    return scopeQuestions.filter((q) => {
      if (reviewFilter === 'pending') return q.status === 'pending_review';
      if (reviewFilter === 'approved') return q.status === 'approved';
      if (reviewFilter === 'source_doc') return q.originType === 'source_doc' && q.status === 'pending_review';
      if (reviewFilter === 'ai_generated') return q.originType === 'ai_generated' && q.status === 'pending_review';
      if (reviewFilter === 'incomplete') return isQuestionIncomplete(q);
      if (reviewFilter === 'no_topic') return isQuestionNoTopic(q);
      if (reviewFilter === 'no_options') return isQuestionNoOptions(q);
      if (reviewFilter === 'no_answer') return isQuestionNoAnswer(q);
      if (reviewFilter === 'no_explanation') return isQuestionNoExplanation(q);
      return true;
    });
  }, [scopeQuestions, reviewFilter, isQuestionIncomplete, isQuestionNoTopic, isQuestionNoOptions, isQuestionNoAnswer, isQuestionNoExplanation]);

  const filteredFlashcards = useMemo(() => {
    return scopeFlashcards.filter((fc) => {
      if (reviewFilter === 'pending') return fc.status === 'pending_review';
      if (reviewFilter === 'approved') return fc.status === 'approved';
      if (reviewFilter === 'source_doc') return fc.originType === 'source_doc' && fc.status === 'pending_review';
      if (reviewFilter === 'ai_generated') return fc.originType === 'ai_generated' && fc.status === 'pending_review';
      if (reviewFilter === 'incomplete') return isFlashcardIncomplete(fc);
      if (reviewFilter === 'no_topic') return isFlashcardNoTopic(fc);
      return true;
    });
  }, [scopeFlashcards, reviewFilter, isFlashcardIncomplete, isFlashcardNoTopic]);

  const publishValidation = useMemo(() => {
    if (!monitor || !monitor.subjects || monitor.subjects.length === 0) {
      return {
        canPublish: false,
        totalTopics: 0,
        completedTopics: 0,
        incompleteTopics: [],
        reason: 'O monitor precisa de pelo menos 1 matéria com tópicos.',
      };
    }

    const allTopics: Array<{
      subjectName: string;
      topicName: string;
      topicId?: string;
      hasDocs: boolean;
      hasQuestions: boolean;
    }> = [];

    for (const subject of monitor.subjects) {
      for (let idx = 0; idx < subject.topics.length; idx++) {
        const topicName = subject.topics[idx];
        const topicRef = subject.topicRefs?.[idx];
        const topicId = topicRef?.id;

        const topicDocs = documents.filter(
          (d) => d.topicName === topicName || (topicId && d.topicId === topicId)
        );
        const topicQuestions = questions.filter(
          (q) => q.topicName === topicName || (topicId && q.topicId === topicId)
        );

        allTopics.push({
          subjectName: subject.name,
          topicName,
          topicId,
          hasDocs: topicDocs.some((document) => isTeacherDocumentValid(document.status)),
          hasQuestions: topicQuestions.length > 0,
        });
      }
    }

    if (allTopics.length === 0) {
      return {
        canPublish: false,
        totalTopics: 0,
        completedTopics: 0,
        incompleteTopics: [],
        reason: 'Adicione pelo menos 1 tópico a uma das matérias para publicar.',
      };
    }

    const incompleteTopics = allTopics.filter((t) => !t.hasDocs || !t.hasQuestions);
    const completedCount = allTopics.length - incompleteTopics.length;
    const canPublish = incompleteTopics.length === 0;

    let reason = '';
    if (!canPublish) {
      const missingDetails = incompleteTopics
        .slice(0, 3)
        .map((t) => {
          const missingArr = [];
          if (!t.hasDocs) missingArr.push('Base de Conhecimento');
          if (!t.hasQuestions) missingArr.push('Questões');
          return `"${t.topicName}" (Falta: ${missingArr.join(' e ')})`;
        })
        .join('; ');

      const extraCount = incompleteTopics.length - 3;
      reason = `Bloqueado para publicação (${completedCount}/${allTopics.length} tópicos completos): ${missingDetails}${
        extraCount > 0 ? ` e mais ${extraCount} tópico(s)` : ''
      }. Todos os tópicos precisam ter Base de Conhecimento e Questões.`;
    } else {
      reason = 'Todos os tópicos possuem Base de Conhecimento e Questões. Clique para publicar seu Agente!';
    }

    return {
      canPublish,
      totalTopics: allTopics.length,
      completedTopics: completedCount,
      incompleteTopics,
      reason,
    };
  }, [monitor, documents, questions]);

  const handlePublishMonitor = async () => {
    if (!monitor || !publishValidation.canPublish || isPublishing) return;
    setIsPublishing(true);
    try {
      const updated = await TeacherMonitorService.update(params.monitorId, { status: 'PUBLISHED' });
      setMonitor(updated);
      showAlert('Sucesso', 'Agente publicado com sucesso! Ele agora está disponível na sua vitrine pública.', 'success');
    } catch (err: any) {
      showAlert('Erro', err.message || 'Falha ao publicar o agente.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const pendingQuestionsCount = useMemo(
    () => scopeQuestions.filter((q) => q.status === 'pending_review').length,
    [scopeQuestions]
  );

  const approvedQuestionsCount = useMemo(
    () => scopeQuestions.filter((q) => q.status === 'approved').length,
    [scopeQuestions]
  );

  const reportedQuestionsCount = useMemo(
    () => scopeQuestions.filter((q) => q.status === 'reported').length,
    [scopeQuestions]
  );

  const _sourceDocQuestionsCount = useMemo(
    () => scopeQuestions.filter((q) => q.originType === 'source_doc' && q.status === 'pending_review').length,
    [scopeQuestions]
  );

  const _aiGeneratedQuestionsCount = useMemo(
    () => scopeQuestions.filter((q) => q.originType === 'ai_generated' && q.status === 'pending_review').length,
    [scopeQuestions]
  );

  const noTopicQuestionsCount = useMemo(
    () => scopeQuestions.filter(isQuestionNoTopic).length,
    [scopeQuestions, isQuestionNoTopic]
  );

  const noOptionsQuestionsCount = useMemo(
    () => scopeQuestions.filter(isQuestionNoOptions).length,
    [scopeQuestions, isQuestionNoOptions]
  );

  const noAnswerQuestionsCount = useMemo(
    () => scopeQuestions.filter(isQuestionNoAnswer).length,
    [scopeQuestions, isQuestionNoAnswer]
  );

  const noExplanationQuestionsCount = useMemo(
    () => scopeQuestions.filter(isQuestionNoExplanation).length,
    [scopeQuestions, isQuestionNoExplanation]
  );

  const incompleteQuestionsCount = useMemo(
    () => scopeQuestions.filter(isQuestionIncomplete).length,
    [scopeQuestions, isQuestionIncomplete]
  );

  const totalPendingQuestionsCount = useMemo(
    () => questions.filter((q) => q.status === 'pending_review').length,
    [questions]
  );

  const totalApprovedQuestionsCount = useMemo(
    () => questions.filter((q) => q.status === 'approved').length,
    [questions]
  );

  const totalReportedQuestionsCount = useMemo(
    () => questions.filter((q) => q.status === 'reported').length,
    [questions]
  );

  const totalPendingFlashcardsCount = useMemo(
    () => flashcards.filter((fc) => fc.status === 'pending_review').length,
    [flashcards]
  );

  const totalApprovedFlashcardsCount = useMemo(
    () => flashcards.filter((fc) => fc.status === 'approved').length,
    [flashcards]
  );

  const pendingFlashcardsCount = useMemo(
    () => scopeFlashcards.filter((fc) => fc.status === 'pending_review').length,
    [scopeFlashcards]
  );

  const approvedFlashcardsCount = useMemo(
    () => scopeFlashcards.filter((fc) => fc.status === 'approved').length,
    [scopeFlashcards]
  );

  const sourceDocFlashcardsCount = useMemo(
    () => scopeFlashcards.filter((fc) => fc.originType === 'source_doc' && fc.status === 'pending_review').length,
    [scopeFlashcards]
  );

  const aiGeneratedFlashcardsCount = useMemo(
    () => scopeFlashcards.filter((fc) => fc.originType === 'ai_generated' && fc.status === 'pending_review').length,
    [scopeFlashcards]
  );

  if (loading) {
    return (
      <main className="h-screen w-screen bg-[#F5F1E8] flex items-center justify-center text-[#132E20]">
        <div className="flex items-center gap-3 text-base font-semibold text-slate-700 bg-white px-6 py-4 rounded-xl shadow-sm border border-slate-200">
          <LoaderCircle className="h-6 w-6 animate-spin text-emerald-700" aria-hidden="true" />
          Carregando Monitor de IA...
        </div>
    </main>
    );
  }

  if (error || !monitor) {
    return (
      <main className="h-screen w-screen bg-[#F5F1E8] flex items-center justify-center text-[#132E20]">
        <div className="max-w-md border border-rose-200 bg-white p-6 rounded-xl shadow-sm">
          <p className="text-sm font-semibold text-rose-700">{error || 'Monitor de IA não encontrado.'}</p>
          <Link href="/professor" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-800 hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao painel
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full flex flex-col bg-[#F5F1E8] text-[#132E20] lg:h-screen lg:overflow-hidden">
      {/* HEADER DO AGENTE (Barra Superior Completa) */}
      <MonitorHeader
        monitor={monitor}
        sidebarView={sidebarView}
        showWorkspaceHeaders={showWorkspaceHeaders}
        topicCount={topicCount}
        documentsCount={documents.length}
        totalApprovedQuestionsCount={totalApprovedQuestionsCount}
        totalPendingQuestionsCount={totalPendingQuestionsCount}
        totalReportedQuestionsCount={totalReportedQuestionsCount}
        totalApprovedFlashcardsCount={totalApprovedFlashcardsCount}
        totalPendingFlashcardsCount={totalPendingFlashcardsCount}
        publishValidation={publishValidation}
        isPublishing={isPublishing}
        setSidebarView={setSidebarView}
        setIsEditingInfo={setIsEditingInfo}
        setEditInfoName={setEditInfoName}
        setEditInfoDescription={setEditInfoDescription}
        handlePublishMonitor={handlePublishMonitor}
      />

      {/* CONTAINER PRINCIPAL FULL-HEIGHT (Sidebar + Workspace com Amplo Espaço) */}
      <div className="flex-1 flex min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* SIDEBAR DA ESTRUTURA DO MONITOR (Navegação de Matérias) */}
        <MonitorStructureSidebar
          monitor={monitor}
          selectedSubject={selectedSubject}
          selectedSubjectId={selectedSubjectId}
          selectedTopic={selectedTopic}
          selectedTopicId={selectedTopicId}
          sidebarView={sidebarView}
          publishValidation={publishValidation}
          documents={documents}
          questions={questions}
          flashcards={flashcards}
          activeTopicInputSubjectId={activeTopicInputSubjectId}
          newTopicName={newTopicName}
          newTopicDefinition={newTopicDefinition}
          openAddSubjectModal={openAddSubjectModal}
          selectSubject={selectSubject}
          setActiveTopicInputSubjectId={setActiveTopicInputSubjectId}
          setNewTopicName={setNewTopicName}
          setNewTopicDefinition={setNewTopicDefinition}
          handleDeleteSubject={handleDeleteSubject}
          handleAddTopic={handleAddTopic}
          setSelectedSubjectId={setSelectedSubjectId}
          setSelectedTopic={setSelectedTopic}
          handleDeleteTopic={handleDeleteTopic}
        />

        {/* WORKSPACE PRINCIPAL (Com Espaço Amplo para Exercícios, Flashcards e Documentos) */}
        <section className={`flex min-h-[60vh] flex-1 flex-col min-w-0 overflow-hidden bg-slate-50/40 lg:h-full lg:min-h-0 ${sidebarView === 'settings' ? 'hidden' : ''}`}>
          {/* Sub-header de Escopo Ativo + Abas Principais (Ocultados no scroll para baixo) */}
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
              showWorkspaceHeaders ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
            }`}
          >
            {/* Sub-header de Escopo Ativo */}
            <div className="border-b border-slate-200 bg-white px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs sm:px-8">
              <div className="min-w-0 flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Escopo Ativo:</span>
                <div className="flex items-center gap-2 text-sm font-bold text-[#132E20]">
                  <span className="bg-emerald-50 text-emerald-900 px-3 py-1 rounded-lg border border-emerald-200">{selectedSubject?.name || 'Matéria'}</span>
                  <span className="text-slate-300">/</span>
                              <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-lg border border-slate-200">{selectedTopic || 'Selecione um tópico'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs bg-emerald-50 text-emerald-900 px-3.5 py-1.5 rounded-lg border border-emerald-200 font-semibold shadow-2xs">
                <Sparkles className="h-4 w-4 text-emerald-700 animate-pulse" aria-hidden="true" />
                <span>Esteira de Extração IA Ativa</span>
              </div>
            </div>

            {/* Abas Principais do Workspace */}
            <nav className="flex overflow-x-auto border-b border-slate-200 px-4 bg-white sm:px-8">
              {workspaceViews.map((view) => {
                const Icon = view.icon;
                const isActive = activeView === view.id;
                let badgeCount = monitor[view.key] ?? 0;
                let pendingBadge = 0;

                if (view.id === 'knowledge') {
                  badgeCount = scopeDocuments.length;
                } else if (view.id === 'questions') {
                  badgeCount = scopeQuestions.length;
                  pendingBadge = pendingQuestionsCount;
                } else if (view.id === 'flashcards') {
                  badgeCount = scopeFlashcards.length;
                  pendingBadge = pendingFlashcardsCount;
                }

                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveView(view.id)}
                    className={`flex shrink-0 items-center gap-2.5 border-b-2 px-6 py-4 text-sm font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'border-emerald-700 text-emerald-950 font-extrabold bg-emerald-50/40'
                        : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-700' : 'text-slate-400'}`} aria-hidden="true" />
                    <span>{view.label}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      isActive ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {badgeCount}
                    </span>
                    {pendingBadge > 0 && (
                      <span className="rounded-full bg-amber-500 text-white px-2 py-0.2 text-[10px] font-extrabold animate-pulse">
                        {pendingBadge} pendentes
                      </span>
                    )}
                    {view.id === 'questions' && reportedQuestionsCount > 0 && (
                      <span className="rounded-full bg-rose-600 text-white px-2 py-0.2 text-[10px] font-extrabold animate-pulse">
                        {reportedQuestionsCount} reportada{reportedQuestionsCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* CONTEÚDO EXPANDIDO DO WORKSPACE (Scrollable com Espaço Amplo) */}
          <div onScroll={handleWorkspaceScroll} className="flex-1 overflow-y-auto p-4 space-y-6 sm:p-6 lg:p-8">
            
            {/* VIEW 1: BASE DE CONHECIMENTO */}
            {activeView === 'knowledge' && (
              <MonitorKnowledgeTab
                filteredDocuments={filteredDocuments}
                queuedUploads={queuedUploads}
                currentScope={selectedSubject?.name ?? currentScope}
                selectedSubjectId={selectedSubject?.id ?? null}
                isSubmittingUploads={isSubmittingUploads}
                isDraggingFiles={isDraggingFiles}
                stagedCount={stagedCount}
                uploadInputRef={uploadInputRef}
                formatFileSize={formatFileSize}
                onFilesSelected={handleFilesSelected}
                onQueueFiles={queueFiles}
                onDraggingChange={setIsDraggingFiles}
                onClearQueue={() => setUploadsByView((u) => ({ ...u, knowledge: [] }))}
                onOpenUploadConfirmation={() => setIsUploadConfirmModalOpen(true)}
              />
            )}

            {activeView === 'questions' && <MonitorQuestionsReviewTab
              questionFileInputRef={questionFileInputRef}
              selectedTopicId={selectedTopicId ?? null}
              isSubmittingUploads={isSubmittingUploads}
              handleFilesSelected={handleFilesSelected}
              showAlert={showAlert}
              queuedUploads={queuedUploads}
              setUploadsByView={setUploadsByView}
              formatFileSize={formatFileSize}
              stagedCount={stagedCount}
              setIsUploadConfirmModalOpen={setIsUploadConfirmModalOpen}
              isDraggingFiles={isDraggingFiles}
              setIsDraggingFiles={setIsDraggingFiles}
              queueFiles={queueFiles}
              reviewFilter={reviewFilter}
              setReviewFilter={setReviewFilter}
              pendingQuestionsCount={pendingQuestionsCount}
              approvedQuestionsCount={approvedQuestionsCount}
              incompleteQuestionsCount={incompleteQuestionsCount}
              noTopicQuestionsCount={noTopicQuestionsCount}
              noOptionsQuestionsCount={noOptionsQuestionsCount}
              noAnswerQuestionsCount={noAnswerQuestionsCount}
              noExplanationQuestionsCount={noExplanationQuestionsCount}
              monitor={monitor}
              selectedSubjectId={selectedSubjectId}
              setQuestions={setQuestions}
              setEditingQuestionId={setEditingQuestionId}
              setEditQuestionDraft={setEditQuestionDraft}
              filteredQuestions={filteredQuestions}
              questions={questions}
              selectedQuestionIds={selectedQuestionIds}
              setSelectedQuestionIds={setSelectedQuestionIds}
              isBulkProcessing={isBulkProcessing}
              handleBulkApproveQuestions={handleBulkApproveQuestions}
              handleBulkRejectQuestions={handleBulkRejectQuestions}
              editingQuestionId={editingQuestionId}
              editQuestionDraft={editQuestionDraft}
              isQuestionIncomplete={isQuestionIncomplete}
              toggleSelectQuestion={toggleSelectQuestion}
              isQuestionNoTopic={isQuestionNoTopic}
              isQuestionNoOptions={isQuestionNoOptions}
              isQuestionNoAnswer={isQuestionNoAnswer}
              isQuestionNoExplanation={isQuestionNoExplanation}
              handleStartEditQuestion={handleStartEditQuestion}
              handleOpenCreateQuestion={handleOpenCreateQuestion}
              handleCancelEditQuestion={handleCancelEditQuestion}
              isSavingQuestion={isSavingQuestion}
              handleSaveQuestionEdit={handleSaveQuestionEdit}
              handleQuestionAction={handleQuestionAction}
            />}
            {activeView === 'flashcards' && (
              <>
                <MonitorFlashcardsReviewTab
                  flashcardFileInputRef={flashcardFileInputRef}
                  selectedTopicId={selectedTopicId}
                  isSubmittingUploads={isSubmittingUploads}
                  handleFilesSelected={handleFilesSelected}
                  showAlert={showAlert}
                  queuedUploads={queuedUploads}
                  setUploadsByView={setUploadsByView}
                  formatFileSize={formatFileSize}
                  stagedCount={stagedCount}
                  setIsUploadConfirmModalOpen={setIsUploadConfirmModalOpen}
                  isDraggingFiles={isDraggingFiles}
                  setIsDraggingFiles={setIsDraggingFiles}
                  queueFiles={queueFiles}
                  reviewFilter={reviewFilter}
                  setReviewFilter={setReviewFilter}
                  pendingFlashcardsCount={pendingFlashcardsCount}
                  approvedFlashcardsCount={approvedFlashcardsCount}
                  sourceDocFlashcardsCount={sourceDocFlashcardsCount}
                  aiGeneratedFlashcardsCount={aiGeneratedFlashcardsCount}
                  handleOpenCreateFlashcardModal={handleOpenCreateFlashcardModal}
                  filteredFlashcards={filteredFlashcards}
                  scopeFlashcards={scopeFlashcards}
                  selectedFlashcardIds={selectedFlashcardIds}
                  setSelectedFlashcardIds={setSelectedFlashcardIds}
                  isBulkProcessing={isBulkProcessing}
                  handleBulkApproveFlashcards={handleBulkApproveFlashcards}
                  handleBulkRejectFlashcards={handleBulkRejectFlashcards}
                  toggleSelectFlashcard={toggleSelectFlashcard}
                  isFlashcardNoTopic={isFlashcardNoTopic}
                />
                {isFlashcardModalOpen && editFlashcardDraft && (
                  <MonitorFlashcardEditorModal
                    editFlashcardDraft={editFlashcardDraft as any}
                    editingFlashcardId={editingFlashcardId}
                    isSavingFlashcard={isSavingFlashcard}
                    previewSide={previewSide}
                    setEditFlashcardDraft={(draft) => setEditFlashcardDraft(draft as FlashcardItem)}
                    setPreviewSide={setPreviewSide}
                    handleCancelEditFlashcard={handleCancelEditFlashcard}
                    handleSaveFlashcardEdit={handleSaveFlashcardEdit}
                    showAlert={showAlert}
                    teacherFullName={teacher?.fullName}
                  />
                )}
              </>
            )}

          </div>
        </section>

        {sidebarView === 'settings' && (
          <MonitorSettingsPanel
            monitor={monitor}
            teacher={teacher}
            isEditingInfo={isEditingInfo}
            setIsEditingInfo={setIsEditingInfo}
            editInfoName={editInfoName}
            setEditInfoName={setEditInfoName}
            editInfoDescription={editInfoDescription}
            setEditInfoDescription={setEditInfoDescription}
            editInfoAvatarUrl={editInfoAvatarUrl}
            setEditInfoAvatarUrl={setEditInfoAvatarUrl}
            editInfoDetailedDescription={editInfoDetailedDescription}
            setEditInfoDetailedDescription={setEditInfoDetailedDescription}
            isSavingInfo={isSavingInfo}
            handleAvatarImageUpload={handleAvatarImageUpload}
            handleRemoveAvatarPhoto={handleRemoveAvatarPhoto}
            handleSaveMonitorInfo={handleSaveMonitorInfo}
            avatarFileInputRef={avatarFileInputRef}
            scopeDocuments={scopeDocuments}
            scopeQuestions={scopeQuestions}
            scopeFlashcards={scopeFlashcards}
            totalApprovedQuestionsCount={totalApprovedQuestionsCount}
            totalApprovedFlashcardsCount={totalApprovedFlashcardsCount}
          />
        )}

      </div>

      {isAddSubjectModalOpen && (
        <TeacherMonitorStructureModal
          isOpen={isAddSubjectModalOpen}
          mode="edit-monitor"
          existingMonitor={monitor}
          onCreated={handleAddSubjectsFromDraft}
          onClose={closeAddSubjectModal}
        />
      )}

      {/* Modal de Confirmação de Envio para Processamento */}
      {isUploadConfirmModalOpen && (
        <UploadConfirmationModal
          requireScopeConfirmation={activeView === 'knowledge'}
          teacherName={teacher?.fullName ?? 'este professor'}
          onClose={() => setIsUploadConfirmModalOpen(false)}
          onConfirm={() => {
            setIsUploadConfirmModalOpen(false);
            handleSendQueuedFiles();
          }}
        />
      )}
      <AlertModal
        isOpen={alertOpen}
        onClose={() => setAlertOpen(false)}
        title={alertTitle}
        message={alertMessage}
        type={alertType}
      />
    </main>
  );
}

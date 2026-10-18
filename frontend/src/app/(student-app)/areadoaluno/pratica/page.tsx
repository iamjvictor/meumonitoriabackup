'use client';
import { AlertModal, OptimizedImage } from '@/shared';
/* eslint-disable react-hooks/set-state-in-effect -- Effects synchronize API data and filter selections. */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { Bot, Brain, ChevronRight, ChevronDown, Sparkles, ListFilter,
  Target, ArrowRight, CheckCircle2, Check, X, Layers, RotateCw, Loader2, AlertTriangle
} from 'lucide-react';
import { StudentHeader, StudentRightSidebar, StudentSidebar, TeacherAvatar, useStudent } from '@/modules/student';
import { PracticeQuestionHeading } from '@/modules/student/components/PracticeQuestionHeading';
import type { StudentMonitorRecord } from '@/modules/student/context/StudentContext';
import { ContentReportModal } from '../components/ContentReportModal';
import { AskAiContextButton } from '../components/AskAiContextButton';
import { PracticeWeeklySimulationsSection } from '../components/PracticeWeeklySimulationsSection';
import { WeeklySimulationModal } from '../components/WeeklySimulationModal';
import { WeeklySimulationStartModal } from '../components/WeeklySimulationStartModal';
import { useWeeklySimulations } from '../hooks/useWeeklySimulations';
import type { WeeklySimulationStatus } from '../models/weekly-simulation-ui';

interface SimuladoCard {
  id: string;
  title: string;
  scope: string;
  questionsCount: number;
  timeLimitMinutes: number;
  status: 'Disponível' | 'Em andamento' | 'Concluído';
  date: string;
  icon: typeof Target;
}

interface CourseCardData {
  id: string;
  subject: string;
  title: string;
  teacherName: string;
  teacherAvatarUrl?: string | null;
  teacherInitials: string;
  coverUrl?: string | null;
  coverGradient: string;
  totalQuestions: number;
  totalFlashcards: number;
  accuracy: number;
  icon: string;
  description: string;
}

const gradients = [
  'from-[#1B4332] via-[#2E5B37] to-[#40916C]',
  'from-[#0F2942] via-[#173C67] to-[#2563EB]',
  'from-[#78350F] via-[#92400E] to-[#D97706]',
  'from-[#4C1D95] via-[#6B21A8] to-[#9333EA]',
  'from-[#064E3B] via-[#059669] to-[#10B981]',
  'from-[#7F1D1D] via-[#991B1B] to-[#DC2626]',
];

const icons = ['∑', 'Φ', '△', '⚗', '🧬', '📜', '⚛', '⚡'];

function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'MA';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

const _simuladosList: SimuladoCard[] = [
  {
    id: 'sim-1',
    title: 'Treino Recomendado do Dia',
    scope: '10 questões selecionadas por IA',
    questionsCount: 10,
    timeLimitMinutes: 15,
    status: 'Disponível',
    date: 'Recomendação diária',
    icon: Sparkles,
  },
  {
    id: 'sim-2',
    title: 'Simulado Diagnóstico Semanal',
    scope: 'Matemática e Raciocínio Lógico',
    questionsCount: 20,
    timeLimitMinutes: 40,
    status: 'Disponível',
    date: 'Disponível até 05/Set',
    icon: Target,
  },
  {
    id: 'sim-3',
    title: 'Simulado Geral de Ciências da Natureza',
    scope: 'Física, Química e Biologia',
    questionsCount: 30,
    timeLimitMinutes: 60,
    status: 'Em andamento',
    date: '50% concluído',
    icon: Layers,
  },
];

// Sample 74 questions for solver list
const _questionsListSample = Array.from({ length: 74 }, (_, idx) => {
  const i = idx + 1;
  const templates = [
    {
      subject: 'Matemática',
      topic: 'Porcentagem e Razão',
      statement: 'Um produto que custava R$ 250,00 sofreu um aumento de 12% e, em seguida, teve um desconto promocional de 10% sobre o novo valor. Qual é o valor final do produto?',
      options: [
        { label: 'A', text: 'R$ 252,00' },
        { label: 'B', text: 'R$ 255,00' },
        { label: 'C', text: 'R$ 247,50' },
        { label: 'D', text: 'R$ 260,00' },
      ],
      correctAnswer: 'A',
      explanation: 'Valor após aumento: R$ 250 × 1,12 = R$ 280,00. Valor após desconto de 10%: R$ 280 × 0,90 = R$ 252,00.',
    },
    {
      subject: 'Matemática',
      topic: 'Equação do 2º Grau',
      statement: 'Quais são as raízes reais da equação quadrática x² - 7x + 12 = 0?',
      options: [
        { label: 'A', text: 'x = 2 e x = 5' },
        { label: 'B', text: 'x = 3 e x = 4' },
        { label: 'C', text: 'x = 1 e x = 12' },
        { label: 'D', text: 'x = -3 e x = -4' },
      ],
      correctAnswer: 'B',
      explanation: 'Pela fórmula de Soma e Produto: Soma = 7 e Produto = 12. As raízes são 3 e 4.',
    },
    {
      subject: 'Matemática',
      topic: 'Geometria Plana',
      statement: 'Um terreno retangular possui 15 metros de largura e 25 metros de comprimento. Qual é o perímetro total desse terreno?',
      options: [
        { label: 'A', text: '375 metros' },
        { label: 'B', text: '80 metros' },
        { label: 'C', text: '40 metros' },
        { label: 'D', text: '100 metros' },
      ],
      correctAnswer: 'B',
      explanation: 'Perímetro = 2 × (largura + comprimento) = 2 × (15 + 25) = 80 metros.',
    },
    {
      subject: 'Matemática',
      topic: 'Probabilidade',
      statement: 'Em uma urna com 5 bolas vermelhas, 3 bolas azuis e 2 bolas amarelas, qual é a probabilidade de se retirar aleatoriamente uma bola azul?',
      options: [
        { label: 'A', text: '30%' },
        { label: 'B', text: '50%' },
        { label: 'C', text: '20%' },
        { label: 'D', text: '15%' },
      ],
      correctAnswer: 'A',
      explanation: 'Total de bolas = 10. Azuis = 3. Probabilidade = 3/10 = 30%.',
    },
    {
      subject: 'Matemática',
      topic: 'Juros Simples',
      statement: 'Um empréstimo de R$ 2.000,00 foi concedido a uma taxa de juros simples de 3% ao mês durante 4 meses. Qual o montante total a ser pago ao final?',
      options: [
        { label: 'A', text: 'R$ 2.240,00' },
        { label: 'B', text: 'R$ 2.120,00' },
        { label: 'C', text: 'R$ 2.060,00' },
        { label: 'D', text: 'R$ 2.400,00' },
      ],
      correctAnswer: 'A',
      explanation: 'Juros J = 2000 × 0,03 × 4 = R$ 240,00. Montante M = 2000 + 240 = R$ 2.240,00.',
    },
  ];

  const template = templates[(i - 1) % templates.length];
  return {
    id: i,
    subject: template.subject,
    topic: template.topic,
    statement: `[Questão ${i}] ${template.statement}`,
    options: template.options,
    correctAnswer: template.correctAnswer,
    explanation: template.explanation,
  };
});

type PracticeQuestion = {
  id: string;
  subject: string;
  topic: string;
  statement: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  imageUrls: string[];
  provenance: {
    board: string | null;
    examName: string | null;
    examYear: number | null;
    sourceUrl: string | null;
  } | null;
  subjectId?: string;
  topicId?: string;
  monitorId?: string;
  subtopicId?: string;
  difficulty?: string | null;
  latestAttempt?: { id: string; selectedAnswer: string; isCorrect: boolean; answeredAt: string } | null;
};

type RevealedQuestionResult = {
  isCorrect: boolean;
  correctAnswer?: string;
  explanation?: string | null;
};

type QuestionAnswerFilter = 'ALL' | 'ANSWERED' | 'UNANSWERED' | 'CORRECT' | 'INCORRECT';

type RawPracticeAlternative = string | { label?: string; text?: string; value?: string };
type RawPracticeQuestion = {
  id: string;
  subject?: { name?: string };
  subjectId?: string;
  topic?: { name?: string };
  topicId?: string;
  subtopic?: { id?: string; name?: string } | null;
  subtopicId?: string;
  difficulty?: string | null;
  monitorId?: string;
  text: string;
  alternatives?: RawPracticeAlternative[] | Record<string, string>;
  explanation?: string;
  imageUrls?: unknown;
  questionBankItem?: { imageUrls?: unknown; difficulty?: string | null } | null;
  provenance?: {
    board?: unknown;
    examName?: unknown;
    examYear?: unknown;
    sourceUrl?: unknown;
  } | null;
  questionAttempts?: PracticeQuestion['latestAttempt'][];
};

type PracticeStats = {
  attemptsCount: number;
  correctCount: number;
  answeredQuestionsCount: number;
  accuracy: number;
};

function mapPracticeQuestion(question: RawPracticeQuestion): PracticeQuestion {
  const rawImageUrls = question.imageUrls ?? question.questionBankItem?.imageUrls;
  const imageUrls = Array.isArray(rawImageUrls)
    ? rawImageUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0).map((url) => url.trim())
    : [];
  const rawProvenance = question.provenance;
  const board = typeof rawProvenance?.board === 'string' && rawProvenance.board.trim()
    ? rawProvenance.board.trim()
    : null;
  const examName = typeof rawProvenance?.examName === 'string' && rawProvenance.examName.trim()
    ? rawProvenance.examName.trim()
    : null;
  const examYear = typeof rawProvenance?.examYear === 'number'
      && Number.isInteger(rawProvenance.examYear)
      && rawProvenance.examYear > 0
    ? rawProvenance.examYear
    : null;
  const sourceUrl = typeof rawProvenance?.sourceUrl === 'string' && rawProvenance.sourceUrl.trim()
    ? rawProvenance.sourceUrl.trim()
    : null;
  const provenance = board || examName || examYear !== null || sourceUrl
    ? { board, examName, examYear, sourceUrl }
    : null;
  const alternatives = Array.isArray(question.alternatives)
    ? question.alternatives
    : Object.entries(question.alternatives ?? {}).map(([label, text]) => ({ label, text }));
  return {
    id: String(question.id),
    subject: question.subject?.name || 'Matéria geral',
    subjectId: question.subjectId,
    topic: question.topic?.name || 'Sem tópico',
    topicId: question.topicId,
    subtopicId: question.subtopicId,
    difficulty: question.difficulty ?? null,
    monitorId: question.monitorId,
    statement: question.text,
    imageUrls,
    provenance,
    options: alternatives.map((option: RawPracticeAlternative, index: number) => {
      const normalized = typeof option === 'string' ? { text: option } : option;
      return {
      label: String(normalized.label ?? String.fromCharCode(65 + index)),
      text: String(normalized.text ?? normalized.value ?? ''),
      };
    }),
    correctAnswer: '',
    explanation: question.explanation || 'Não há uma resolução comentada cadastrada para esta questão.',
    latestAttempt: question.questionAttempts?.[0] ?? null,
  };
}

// Sample flashcard for demonstration
const _mockFlashcard = {
  front: 'O que é uma Razão Centesimal e qual a sua relação com a Porcentagem?',
  back: 'Razão centesimal é toda razão cujo consequente (denominador) é igual a 100. A porcentagem é a representação dessa razão. Exemplo: 25/100 = 25%.',
};

export default function PraticaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const shouldOpenFlashcards = requestedMode === 'flashcard';
  const { student, status, fetchMonitors, activeContext, setActiveContext, activeFlashcardContext, setActiveFlashcardContext } = useStudent();
  const [courses, setCourses] = useState<CourseCardData[]>([]);
  const [rawMonitorsList, setRawMonitorsList] = useState<StudentMonitorRecord[]>([]);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>('ALL');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('ALL');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('ALL');
  const [selectedSubtopicId, setSelectedSubtopicId] = useState<string>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('ALL');
  const [isQuestionFiltersExpanded, setIsQuestionFiltersExpanded] = useState<boolean>(true);
  const [isFlashcardFiltersExpanded, setIsFlashcardFiltersExpanded] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const [solvingTitle, setSolvingTitle] = useState<string | null>(() => shouldOpenFlashcards ? 'Flashcards - Todos os Monitores' : null);
  const [activeMode, setActiveMode] = useState<'question' | 'flashcard'>(() => shouldOpenFlashcards ? 'flashcard' : 'question');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [_showAiDoubt, setShowAiDoubt] = useState(false);
  const [aiQuestionInput, setAiQuestionInput] = useState('');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'QUESTION' | 'FLASHCARD', id: string } | null>(null);
  const [isWeeklySimulationStarted, setIsWeeklySimulationStarted] = useState(false);
  const [isWeeklySimulationStartOpen, setIsWeeklySimulationStartOpen] = useState(false);
  const weeklyMonitorIds = useMemo(() => rawMonitorsList.map((monitor) => monitor.id), [rawMonitorsList]);
  const weeklySimulation = useWeeklySimulations(status, weeklyMonitorIds);

  const isTeacher = ['teacher', 'professor', 'admin'].includes(student?.role?.toLowerCase() || '');

  useEffect(() => {
    async function loadCourses() {
      if (status === 'loading') return;
      setIsLoading(true);
      try {
        const rawMonitors = await fetchMonitors();
        setRawMonitorsList(rawMonitors || []);
        const mapped: CourseCardData[] = (rawMonitors || []).map((m: StudentMonitorRecord, index: number) => {
          const teacherName = m.teacher?.fullName || student?.fullName || 'Professor';
          const teacherInitials = getInitials(teacherName);
          const subjectName = m.subjects?.[0]?.name || m.teacher?.area || 'Geral';
          const teacherAvatarUrl = m.teacher?.avatarUrl || (isTeacher ? student?.avatarUrl : null);
          const coverUrl = m.avatarUrl || null;

          return {
            id: m.id,
            subject: subjectName,
            title: m.name,
            teacherName,
            teacherInitials,
            teacherAvatarUrl,
            coverUrl,
            coverGradient: gradients[index % gradients.length],
            totalQuestions: m._count?.questions ?? 0,
            totalFlashcards: m._count?.flashcards ?? 0,
            accuracy: 0,
            icon: icons[index % icons.length],
            description: m.description || m.detailedDescription || 'Agente de IA treinado com a metodologia do professor.',
          };
        });

        setCourses(mapped);
      } catch (err) {
        console.error('[PraticaPage] Erro ao carregar cursos:', err);
        setCourses([]);
        setRawMonitorsList([]);
      } finally {
        setIsLoading(false);
      }
    }

    void loadCourses();
  }, [status, fetchMonitors, isTeacher, student]);

  const monitorsOptions = useMemo(() => {
    return rawMonitorsList.map((m: StudentMonitorRecord) => {
      const subjects: { id: string; name: string; topics: { id: string; name: string; subtopics: { id: string; name: string }[] }[] }[] = [];
      const topics: { id: string; name: string; subjectName: string; subtopics: { id: string; name: string }[] }[] = [];
      if (Array.isArray(m.subjects)) {
        m.subjects.forEach((subj) => {
          const subjectTopics = Array.isArray(subj.topics)
            ? subj.topics.map((top) => ({ id: top.id || '', name: top.name || '', subtopics: top.subtopics ?? [] }))
            : [];
          subjects.push({ id: subj.id, name: subj.name, topics: subjectTopics });
          if (Array.isArray(subj.topics)) {
            subj.topics.forEach((top) => {
              topics.push({
                id: top.id,
                name: top.name,
                subjectName: subj.name,
                subtopics: top.subtopics ?? [],
              });
            });
          }
        });
      }
      return {
        id: m.id,
        name: m.name,
        totalQuestions: m._count?.questions ?? 0,
        subjects,
        topics,
      };
    });
  }, [rawMonitorsList]);

  const availableSubjects = useMemo(() => {
    if (selectedMonitorId === 'ALL') {
      return monitorsOptions.flatMap((monitor) => monitor.subjects.map((subject) => ({
        ...subject,
        monitorName: monitor.name,
      })));
    }
    return monitorsOptions.find((monitor) => monitor.id === selectedMonitorId)?.subjects ?? [];
  }, [selectedMonitorId, monitorsOptions]);

  const availableTopics = useMemo(() => {
    if (selectedMonitorId === 'ALL') {
      const allTopics: { id: string; name: string; subjectName: string; monitorName: string; subtopics: { id: string; name: string }[] }[] = [];
      monitorsOptions.forEach((m) => {
        m.topics.forEach((t) => {
          if (selectedSubjectId === 'ALL' || m.subjects.some((subject) => subject.id === selectedSubjectId && subject.topics.some((topic) => topic.id === t.id))) {
            allTopics.push({ ...t, monitorName: m.name });
          }
        });
      });
      return allTopics;
    }
    const selectedMon = monitorsOptions.find((m) => m.id === selectedMonitorId);
    if (!selectedMon) return [];
    if (selectedSubjectId === 'ALL') return selectedMon.topics;
    return selectedMon.topics.filter((topic) => selectedMon.subjects.some((subject) => subject.id === selectedSubjectId && subject.topics.some((subjectTopic) => subjectTopic.id === topic.id)));
  }, [selectedMonitorId, selectedSubjectId, monitorsOptions]);

  const availableSubtopics = useMemo(() => {
    const topic = availableTopics.find((item) => item.id === selectedTopicId);
    return topic?.subtopics ?? [];
  }, [availableTopics, selectedTopicId]);

  useEffect(() => {
    if (selectedSubjectId !== 'ALL' && !availableSubjects.some((subject) => subject.id === selectedSubjectId)) {
      setSelectedSubjectId('ALL');
      setSelectedTopicId('ALL');
      setSelectedSubtopicId('ALL');
    }
  }, [availableSubjects, selectedSubjectId]);

  useEffect(() => {
    if (selectedTopicId !== 'ALL' && !availableTopics.some((topic) => topic.id === selectedTopicId)) {
      setSelectedTopicId('ALL');
      setSelectedSubtopicId('ALL');
    }
  }, [availableTopics, selectedTopicId]);

  useEffect(() => {
    if (selectedSubtopicId !== 'ALL' && !availableSubtopics.some((subtopic) => subtopic.id === selectedSubtopicId)) {
      setSelectedSubtopicId('ALL');
    }
  }, [availableSubtopics, selectedSubtopicId]);

  const _totalQuestionsCount = useMemo(() => {
    if (selectedMonitorId === 'ALL') {
      return monitorsOptions.reduce((acc, m) => acc + (m.totalQuestions || 0), 0);
    }
    const selectedMon = monitorsOptions.find((m) => m.id === selectedMonitorId);
    return selectedMon ? selectedMon.totalQuestions || 0 : 0;
  }, [selectedMonitorId, monitorsOptions]);

  const filteredCourses = useMemo(() => {
    if (selectedMonitorId === 'ALL') return courses;
    return courses.filter((c) => c.id === selectedMonitorId);
  }, [courses, selectedMonitorId]);

  const currentSolverNomenclature = useMemo(() => {
    const selMon = monitorsOptions.find((m) => m.id === selectedMonitorId);
    const selSubject = availableSubjects.find((subject) => subject.id === selectedSubjectId);
    const selTop = availableTopics.find((t) => t.id === selectedTopicId);

    const prefix = activeMode === 'flashcard' ? 'Flashcards' : 'Banco de Questões';

    let monitorName = '';
    if (selectedMonitorId === 'ALL') {
      monitorName = 'Todos os Monitores';
    } else if (selMon) {
      monitorName = selMon.name;
    } else if (solvingTitle) {
      monitorName = solvingTitle.replace(/^Banco de Questões - /, '').replace(/^Flashcards - /, '');
    }

    let topicName = '';
    if (selectedTopicId === 'ALL') {
      topicName = 'Todos os Tópicos';
    } else if (selTop) {
      topicName = selTop.name;
    }

    const subjectName = selectedSubjectId === 'ALL' ? '' : selSubject?.name || '';
    if (monitorName && subjectName && topicName) {
      return `${prefix} - ${monitorName} – ${subjectName} – ${topicName}`;
    } else if (monitorName && subjectName) {
      return `${prefix} - ${monitorName} – ${subjectName}`;
    } else if (monitorName && topicName) {
      return `${prefix} - ${monitorName} – ${topicName}`;
    } else if (monitorName) {
      return `${prefix} - ${monitorName}`;
    } else if (topicName) {
      return `${prefix} – ${topicName}`;
    }

    return `${prefix} - Todos os Monitores – Todos os Tópicos`;
  }, [solvingTitle, selectedMonitorId, selectedSubjectId, selectedTopicId, monitorsOptions, availableSubjects, availableTopics, activeMode]);

  const [currentFlashcard, setCurrentFlashcard] = useState<{
    id: string;
    front: string;
    back: string;
    monitorId?: string;
    subjectId?: string;
    topicId?: string;
    subject?: string;
    topic?: string;
    monitorName?: string;
  } | null>(null);
  const [flashcardErrorMessage, setFlashcardErrorMessage] = useState<string | null>(null);
  const [isLoadingFlashcard, setIsLoadingFlashcard] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [hasReviewedCard, setHasReviewedCard] = useState(false);

  // Pagination & Multi-question selection state
  const [pageSize, setPageSize] = useState<number | 'ALL'>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [questionsList, setQuestionsList] = useState<PracticeQuestion[]>([]);
  const [totalQuestionsAvailable, setTotalQuestionsAvailable] = useState<number | null>(null);
  const [practiceStats, setPracticeStats] = useState<PracticeStats>({ attemptsCount: 0, correctCount: 0, answeredQuestionsCount: 0, accuracy: 0 });
  const [questionsReloadNonce, setQuestionsReloadNonce] = useState(0);
  const [isLoadingQuestionData, setIsLoadingQuestionData] = useState(false);
  const [questionLoadError, setQuestionLoadError] = useState<string | null>(null);
  const [isResettingQuestions, setIsResettingQuestions] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState<Record<string, boolean>>({});
  const [revealedQuestionResults, setRevealedQuestionResults] = useState<Record<string, RevealedQuestionResult>>({});
  const [questionAttemptErrors, setQuestionAttemptErrors] = useState<Record<string, boolean>>({});
  const [questionSelectionErrors, setQuestionSelectionErrors] = useState<Record<string, boolean>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [submittedQuestions, setSubmittedQuestions] = useState<Record<string, boolean>>({});
  const [questionAnswerFilter, setQuestionAnswerFilter] = useState<QuestionAnswerFilter>('UNANSWERED');
  const [activeAiDoubtQuestionId, setActiveAiDoubtQuestionId] = useState<string | null>(null);
  const [_flippedQuestions, setFlippedQuestions] = useState<Record<string, boolean>>({});

  const _toggleFlipQuestion = (questionId: string) => {
    setFlippedQuestions((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  const filteredQuestions = useMemo(() => questionsList.filter((question) => {
    if (selectedMonitorId !== 'ALL' && question.monitorId !== selectedMonitorId) return false;
    if (selectedSubjectId !== 'ALL' && question.subjectId !== selectedSubjectId) return false;
    if (selectedTopicId !== 'ALL' && question.topicId !== selectedTopicId) return false;
    if (selectedSubtopicId !== 'ALL' && question.subtopicId !== selectedSubtopicId) return false;
    if (selectedDifficulty !== 'ALL' && question.difficulty !== selectedDifficulty) return false;
    const isAnswered = Boolean(submittedQuestions[question.id] || question.latestAttempt);
    const isSubmitting = Boolean(isSubmittingQuestion[question.id]);
    const isCurrentlyRevealed = Boolean(revealedQuestionResults[question.id]);
    const isCorrect = revealedQuestionResults[question.id]?.isCorrect ?? question.latestAttempt?.isCorrect;
    if (questionAnswerFilter === 'ANSWERED') return isAnswered || isSubmitting;
    if (questionAnswerFilter === 'UNANSWERED') return !isAnswered || isSubmitting || isCurrentlyRevealed;
    if (questionAnswerFilter === 'CORRECT') return isAnswered && isCorrect === true;
    if (questionAnswerFilter === 'INCORRECT') return isAnswered && isCorrect === false;
    return true;
  }), [questionAnswerFilter, questionsList, selectedMonitorId, selectedSubjectId, selectedTopicId, selectedSubtopicId, selectedDifficulty, submittedQuestions, isSubmittingQuestion, revealedQuestionResults]);
  const effectivePageSize = pageSize === 'ALL' ? Math.max(filteredQuestions.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / effectivePageSize));
  const startIndex = (currentPage - 1) * effectivePageSize;
  const endIndex = startIndex + effectivePageSize;
  const displayedQuestions = filteredQuestions.slice(startIndex, endIndex);
  const answeredQuestionsCount = useMemo(
    () => questionsList.filter((question) => Boolean(submittedQuestions[question.id] || question.latestAttempt)).length,
    [questionsList, submittedQuestions],
  );
  const hasScopeFilters = selectedMonitorId !== 'ALL' || selectedSubjectId !== 'ALL' || selectedTopicId !== 'ALL' || selectedSubtopicId !== 'ALL' || selectedDifficulty !== 'ALL';
  const hasQuestionFilters = hasScopeFilters || questionAnswerFilter !== 'UNANSWERED';
  const clearQuestionFilters = () => {
    setSelectedMonitorId('ALL');
    setSelectedSubjectId('ALL');
    setSelectedTopicId('ALL');
    setSelectedSubtopicId('ALL');
    setSelectedDifficulty('ALL');
    setQuestionAnswerFilter('UNANSWERED');
    setCurrentPage(1);
  };

  const currentMonitorLabel = useMemo(() => {
    if (selectedMonitorId === 'ALL') return 'Todos os monitores';
    return monitorsOptions.find((m) => m.id === selectedMonitorId)?.name || 'Monitor';
  }, [selectedMonitorId, monitorsOptions]);

  const currentSubjectLabel = useMemo(() => {
    if (selectedSubjectId === 'ALL') return 'Todas as matérias';
    return availableSubjects.find((s) => s.id === selectedSubjectId)?.name || 'Matéria';
  }, [selectedSubjectId, availableSubjects]);

  const currentTopicLabel = useMemo(() => {
    if (selectedTopicId === 'ALL') return 'Todos os tópicos';
    return availableTopics.find((t) => t.id === selectedTopicId)?.name || 'Tópico';
  }, [selectedTopicId, availableTopics]);

  const currentStatusLabel = useMemo(() => {
    switch (questionAnswerFilter) {
      case 'ALL': return 'Todas';
      case 'UNANSWERED': return 'Não respondidas';
      case 'ANSWERED': return 'Respondidas';
      case 'CORRECT': return 'Acertadas';
      case 'INCORRECT': return 'Erradas';
      default: return 'Filtro';
    }
  }, [questionAnswerFilter]);

  const openResetQuestionConfirmation = () => {
    if (isResettingQuestions || status !== 'authenticated' || practiceStats.attemptsCount === 0) return;
    setIsResetConfirmOpen(true);
  };

  const resetQuestionProgress = async () => {
    if (isTeacher || isResettingQuestions || status !== 'authenticated') return;
    setIsResetConfirmOpen(false);

    setIsResettingQuestions(true);
    setResetMessage(null);
    setResetError(null);
    try {
      const response = await fetch(`${apiUrl}/api/v1/student/questions/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...(selectedMonitorId !== 'ALL' ? { monitorId: selectedMonitorId } : {}),
          ...(selectedSubjectId !== 'ALL' ? { subjectId: selectedSubjectId } : {}),
          ...(selectedTopicId !== 'ALL' ? { topicId: selectedTopicId } : {}),
          ...(selectedSubtopicId !== 'ALL' ? { subtopicId: selectedSubtopicId } : {}),
          ...(selectedDifficulty !== 'ALL' ? { difficulty: selectedDifficulty } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'RESET_QUESTIONS_FAILED');

      setQuestionAnswerFilter('UNANSWERED');
      setCurrentPage(1);
      setSelectedAnswers({});
      setSubmittedQuestions({});
      setRevealedQuestionResults({});
      setQuestionAttemptErrors({});
      setQuestionSelectionErrors({});
      setResetMessage(`${body.data?.archivedCount ?? 0} respostas foram arquivadas. Seu histórico foi preservado.`);
      setQuestionsReloadNonce((value) => value + 1);
    } catch (error) {
      console.error('[PraticaPage] Erro ao resetar questões:', error);
      setResetError(error instanceof Error ? error.message : 'Não foi possível resetar as questões.');
    } finally {
      setIsResettingQuestions(false);
    }
  };
  const loadedQuestionsMatchScope = questionsList.every((question) => (
    (selectedMonitorId === 'ALL' || question.monitorId === selectedMonitorId)
    && (selectedSubjectId === 'ALL' || question.subjectId === selectedSubjectId)
    && (selectedTopicId === 'ALL' || question.topicId === selectedTopicId)
    && (selectedSubtopicId === 'ALL' || question.subtopicId === selectedSubtopicId)
    && (selectedDifficulty === 'ALL' || question.difficulty === selectedDifficulty)
  ));
  const totalQuestionsInScope = totalQuestionsAvailable !== null && loadedQuestionsMatchScope
    ? totalQuestionsAvailable
    : questionsList.length;
  const pendingQuestionsCount = Math.max(totalQuestionsInScope - answeredQuestionsCount, 0);
  const correctQuestionsCount = questionsList.filter((question) => (
    (revealedQuestionResults[question.id]?.isCorrect ?? question.latestAttempt?.isCorrect) === true
  )).length;
  const incorrectQuestionsCount = questionsList.filter((question) => (
    (revealedQuestionResults[question.id]?.isCorrect ?? question.latestAttempt?.isCorrect) === false
  )).length;
  const totalQuestionsForDisplay = questionAnswerFilter === 'ALL'
    && totalQuestionsAvailable !== null
    && loadedQuestionsMatchScope
    ? totalQuestionsAvailable
    : filteredQuestions.length;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

  useEffect(() => {
    if (!solvingTitle || activeMode !== 'question' || status !== 'authenticated') return;
    setIsLoadingQuestionData(true);
    setQuestionLoadError(null);
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (selectedMonitorId !== 'ALL') params.set('monitorId', selectedMonitorId);
    if (selectedSubjectId !== 'ALL') params.set('subjectId', selectedSubjectId);
    if (selectedTopicId !== 'ALL') params.set('topicId', selectedTopicId);
    if (selectedSubtopicId !== 'ALL') params.set('subtopicId', selectedSubtopicId);
    if (selectedDifficulty !== 'ALL') params.set('difficulty', selectedDifficulty);
    let cancelled = false;
    const questionsEndpoint = isTeacher
      ? `${apiUrl}/api/v1/teacher/practice-preview/questions`
      : `${apiUrl}/api/v1/student/questions`;
    fetch(`${questionsEndpoint}?${params.toString()}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('QUESTIONS_LOAD_FAILED');
        const body = await response.json();
        if (!cancelled) {
          const mappedQuestions: PracticeQuestion[] = Array.isArray(body.data?.questions) ? body.data.questions.map(mapPracticeQuestion) : [];
          setQuestionsList(mappedQuestions);
          setTotalQuestionsAvailable(typeof body.data?.total === 'number' ? body.data.total : mappedQuestions.length);
          setPracticeStats(body.data?.stats || { attemptsCount: 0, correctCount: 0, answeredQuestionsCount: 0, accuracy: 0 });
          setSelectedAnswers((current) => {
            const restored = { ...current };
            mappedQuestions.forEach((question) => {
              if (question.latestAttempt?.selectedAnswer) restored[question.id] = question.latestAttempt.selectedAnswer;
            });
            return restored;
          });
          setSubmittedQuestions((current) => {
            const restored = { ...current };
            mappedQuestions.forEach((question) => {
              if (question.latestAttempt) restored[question.id] = true;
            });
            return restored;
          });
        }
      })
      .catch((error) => {
        console.error('[PraticaPage] Erro ao carregar questões reais:', error);
        if (!cancelled) {
          setQuestionsList([]);
          setPracticeStats({ attemptsCount: 0, correctCount: 0, answeredQuestionsCount: 0, accuracy: 0 });
          setQuestionLoadError('Não foi possível carregar as questões e o desempenho. Tente novamente.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingQuestionData(false);
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [activeMode, apiUrl, isTeacher, questionsReloadNonce, selectedMonitorId, selectedSubjectId, selectedTopicId, selectedSubtopicId, selectedDifficulty, solvingTitle, status]);

  const submitQuestionAnswer = async (question: PracticeQuestion) => {
    const selectedAnswer = selectedAnswers[question.id];
    if (isSubmittingQuestion[question.id]) return;
    if (!selectedAnswer) {
      setQuestionSelectionErrors((current) => ({ ...current, [question.id]: true }));
      return;
    }
    setSubmittedQuestions((current) => ({ ...current, [question.id]: true }));
    setQuestionAttemptErrors((current) => ({ ...current, [question.id]: false }));
    setQuestionSelectionErrors((current) => ({ ...current, [question.id]: false }));
    setIsSubmittingQuestion((current) => ({ ...current, [question.id]: true }));
    try {
      const attemptEndpoint = isTeacher
        ? `${apiUrl}/api/v1/teacher/practice-preview/attempts`
        : `${apiUrl}/api/v1/student/questions/attempts`;
      const response = await fetch(attemptEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          questionId: question.id,
          selectedAnswer,
          ...(isTeacher ? {} : { mode: 'PRACTICE', idempotencyKey: crypto.randomUUID() }),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.data?.isCorrect !== 'boolean' || typeof body.data?.correctAnswer !== 'string') throw new Error('QUESTION_ATTEMPT_FAILED');
      setRevealedQuestionResults((current) => ({
        ...current,
        [question.id]: {
          isCorrect: body.data.isCorrect,
          correctAnswer: body.data.correctAnswer,
          explanation: body.data.explanation,
        },
      }));
    } catch (error) {
      console.error('[PraticaPage] Erro ao registrar resposta:', error);
      setSubmittedQuestions((current) => ({ ...current, [question.id]: false }));
      setQuestionAttemptErrors((current) => ({ ...current, [question.id]: true }));
    } finally {
      setIsSubmittingQuestion((current) => ({ ...current, [question.id]: false }));
    }
  };

  const handleBulkSubmit = (questionIds: string[]) => {
    void Promise.all(questionIds.map((questionId) => {
      const question = questionsList.find((item) => item.id === questionId);
      return question ? submitQuestionAnswer(question) : Promise.resolve();
    }));
  };

  const fetchNextFlashcard = async (filters?: { monitorId?: string; subjectId?: string; topicId?: string }) => {
    if (status === 'unauthenticated') {
      router.push('/?login=true&perfil=aluno&session=expired');
      return;
    }
    setIsLoadingFlashcard(true);
    setFlashcardErrorMessage(null);
    setHasReviewedCard(false);
    try {
      const params = new URLSearchParams();
      const monitorId = filters?.monitorId ?? selectedMonitorId;
      const subjectId = filters?.subjectId ?? selectedSubjectId;
      const topicId = filters?.topicId ?? selectedTopicId;
      if (monitorId && monitorId !== 'ALL') params.set('monitorId', monitorId);
      if (subjectId && subjectId !== 'ALL') params.set('subjectId', subjectId);
      if (topicId && topicId !== 'ALL') params.set('topicId', topicId);
      const query = params.toString();
      const flashcardEndpoint = isTeacher
        ? `${apiUrl}/api/v1/teacher/practice-preview/flashcards/random`
        : `${apiUrl}/api/v1/student/flashcards/random`;
      const url = `${flashcardEndpoint}${query ? `?${query}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        router.push('/?login=true&perfil=aluno&session=expired');
        return;
      }
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setCurrentFlashcard({
            id: json.data.id,
            front: json.data.question,
            back: json.data.answer,
            monitorId: json.data.monitorId,
            subjectId: json.data.subjectId,
            topicId: json.data.topicId,
            subject: json.data.subject,
            topic: json.data.topic,
            monitorName: json.data.monitorName,
          });
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setCurrentFlashcard(null);
        setFlashcardErrorMessage(errJson.message || 'Você não possui acesso a este monitor ou não há flashcards.');
      }
    } catch (err) {
      console.error('[PraticaPage] Erro ao buscar flashcard:', err);
      setCurrentFlashcard(null);
      setFlashcardErrorMessage('Erro de conexão ao buscar flashcard.');
    } finally {
      setIsLoadingFlashcard(false);
    }
  };

  const handleReviewFlashcard = (rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY') => {
    if (status === 'unauthenticated') {
      router.push('/?login=true&perfil=aluno&session=expired');
      return;
    }
    if (!currentFlashcard || isSubmittingReview) return;
    
    setHasReviewedCard(true);
    setIsSubmittingReview(true);

    const reviewEndpoint = isTeacher
      ? `${apiUrl}/api/v1/teacher/practice-preview/flashcards/${currentFlashcard.id}/review`
      : `${apiUrl}/api/v1/student/flashcards/${currentFlashcard.id}/review`;
    fetch(reviewEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rating }),
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          router.push('/?login=true&perfil=aluno&session=expired');
          return;
        }
        if (res.ok) {
          console.log('[PraticaPage] Resposta do aluno salva em student_flashcard_progress');
        }
      })
      .catch((err) => {
        console.error('[PraticaPage] Erro ao enviar review do flashcard:', err);
      })
      .finally(() => {
        setIsSubmittingReview(false);
      });
  };

  const handleAttachFlashcardToAi = () => {
    if (!currentFlashcard?.id || !currentFlashcard.monitorId || !currentFlashcard.subjectId) return;
    if (activeFlashcardContext?.id === currentFlashcard.id) {
      setActiveFlashcardContext(null);
      return;
    }
    setActiveFlashcardContext({
      id: currentFlashcard.id,
      monitorId: currentFlashcard.monitorId,
      subjectId: currentFlashcard.subjectId,
      topicId: currentFlashcard.topicId,
      topic: currentFlashcard.topic,
      front: currentFlashcard.front,
      back: currentFlashcard.back,
    });

    // On desktop the chat sidebar is already beside the flashcard.
    // Keep this page in place; mobile still navigates to its full-screen chat.
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      router.push('/areadoaluno/chat');
    }
  };

  const handleStartQuestion = (title: string) => {
    setSolvingTitle(title);
    setActiveMode('question');
    setIsLoadingQuestionData(true);
    setQuestionLoadError(null);
    setSelectedOption(null);
    setHasSubmitted(false);
    setShowAiDoubt(false);
    setAiQuestionInput('');
  };

  const handleStartFlashcard = (title: string, monitorId?: string) => {
    const nextMonitorId = monitorId || 'ALL';
    setSelectedMonitorId(nextMonitorId);
    setSelectedSubjectId('ALL');
    setSelectedTopicId('ALL');
    setSolvingTitle(title);
    setActiveMode('flashcard');
    setIsFlipped(false);
    setShowAiDoubt(false);
    setAiQuestionInput('');
    void fetchNextFlashcard({ monitorId: nextMonitorId, subjectId: 'ALL', topicId: 'ALL' });
  };

  const handleFlashcardMonitorChange = (monitorId: string) => {
    setSelectedMonitorId(monitorId);
    setSelectedSubjectId('ALL');
    setSelectedTopicId('ALL');
    setCurrentFlashcard(null);
    setIsFlipped(false);
    setHasReviewedCard(false);
    void fetchNextFlashcard({ monitorId, subjectId: 'ALL', topicId: 'ALL' });
  };

  const handleFlashcardSubjectChange = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedTopicId('ALL');
    setCurrentFlashcard(null);
    setIsFlipped(false);
    setHasReviewedCard(false);
    void fetchNextFlashcard({ monitorId: selectedMonitorId, subjectId, topicId: 'ALL' });
  };

  const handleFlashcardTopicChange = (topicId: string) => {
    setSelectedTopicId(topicId);
    setCurrentFlashcard(null);
    setIsFlipped(false);
    setHasReviewedCard(false);
    void fetchNextFlashcard({ monitorId: selectedMonitorId, subjectId: selectedSubjectId, topicId });
  };

  const clearFlashcardFilters = () => {
    setSelectedMonitorId('ALL');
    setSelectedSubjectId('ALL');
    setSelectedTopicId('ALL');
    setCurrentFlashcard(null);
    setIsFlipped(false);
    setHasReviewedCard(false);
    void fetchNextFlashcard({ monitorId: 'ALL', subjectId: 'ALL', topicId: 'ALL' });
  };

  useEffect(() => {
    if (!shouldOpenFlashcards || status !== 'authenticated' || !solvingTitle || currentFlashcard || isLoadingFlashcard) return;
    void fetchNextFlashcard();
    // A função usa o estado atual do modo de entrada; o efeito só executa uma vez por navegação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, shouldOpenFlashcards, status, solvingTitle]);

  const _handleSelectOption = (label: string) => {
    if (hasSubmitted) return;
    setSelectedOption(label);
  };

  const _handleSubmitAnswer = () => {
    if (!selectedOption) return;
    setHasSubmitted(true);
  };

  const handleCloseSolver = () => {
    setSolvingTitle(null);
    setSelectedOption(null);
    setHasSubmitted(false);
    setIsFlipped(false);
    setCurrentFlashcard(null);
    setShowAiDoubt(false);
    setAiQuestionInput('');
    setCurrentPage(1);
    setSelectedAnswers({});
    setSubmittedQuestions({});
    setQuestionSelectionErrors({});
    setQuestionAnswerFilter('ALL');
    setActiveAiDoubtQuestionId(null);
    setFlippedQuestions({});
  };


  return (
    <main className={`min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] text-[#0F2942] lg:pb-0 ${solvingTitle ? 'bg-white' : 'bg-[#F5F1E8]'}`}>
      <div className="flex min-h-screen w-full">
        {/* Shared Sidebar with 'practice' active */}
        <StudentSidebar activeNav="practice" />

        <section className={`min-w-0 flex-1 py-4 sm:px-8 sm:py-5 lg:px-12 lg:py-8 ${solvingTitle ? 'px-1' : 'px-3'}`}>
          <StudentHeader
            title="Central de Práticas e Exercícios"
            breadcrumbs={[
              { label: 'Área do aluno', href: '/areadoaluno' },
              { label: 'Prática e Exercícios' },
            ]}
          />



          {solvingTitle ? (
            /* ========================================================= */
            /* VIEW 2: ACTIVE PRACTICE / FLASHCARD SOLVER VIEW (FULL PAGE) */
            /* ========================================================= */
            <div className="mt-6 animate-fade-in-up">
              {/* Interactive Solver / Flashcard Container */}
              <div className="rounded-xl border-0 bg-white p-1 shadow-none sm:rounded-[28px] sm:border sm:border-[#0F2942]/12 sm:p-8 sm:shadow-xl">
                {/* Header with Back Button, Nomenclature, and Page Size Selector */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#0F2942]/10 pb-4">
                  <button
                    onClick={handleCloseSolver}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#0F2942]/15 bg-[#F8F5EE] px-3.5 py-2 text-xs font-bold text-[#0F2942] transition hover:bg-white hover:border-[#0F2942]/30 cursor-pointer shadow-2xs"
                  >
                    <ArrowRight className="h-4 w-4 rotate-180 text-[#2E5B37]" />
                    <span>Voltar</span>
                  </button>

                  <div className="text-xs sm:text-sm font-bold text-[#0F2942]">
                    <span>{currentSolverNomenclature}</span>
                  </div>

                  {activeMode === 'question' && (
                    <div className="flex items-center gap-2 text-xs font-bold text-[#0F2942]">
                      <span className="hidden sm:inline">Exibir por página:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                          setPageSize(val);
                          setCurrentPage(1);
                        }}
                        className="rounded-xl border border-[#0F2942]/15 bg-[#F8F5EE] px-3 py-1.5 text-xs font-bold text-[#0F2942] focus:border-[#2E5B37] focus:outline-none cursor-pointer shadow-2xs"
                      >
                        <option value={5}>5 questões</option>
                        <option value={10}>10 questões</option>
                        <option value={20}>20 questões</option>
                        <option value={50}>50 questões</option>
                        <option value="ALL">Todas ({questionsList.length})</option>
                      </select>
                    </div>
                  )}
                </div>

              {activeMode === 'question' ? isLoadingQuestionData ? (
                <div className="mt-6 rounded-2xl border border-[#0F2942]/10 bg-[#F8F5EE] p-5" role="status" aria-live="polite">
                  <div className="flex items-center gap-3 text-sm font-bold text-[#0F2942]/70">
                    <Loader2 className="h-5 w-5 animate-spin text-[#2E5B37]" />
                    Carregando questões e desempenho...
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-[76px] animate-pulse rounded-2xl bg-white" />)}
                  </div>
                  <div className="mt-4 h-24 animate-pulse rounded-2xl bg-white" />
                </div>
              ) : questionLoadError ? (
                <div className="mt-6 flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center" role="alert">
                  <AlertTriangle className="h-8 w-8 text-rose-600" />
                  <p className="mt-3 text-sm font-bold text-rose-800">{questionLoadError}</p>
                  <button
                    type="button"
                    onClick={() => setQuestionsReloadNonce((value) => value + 1)}
                    className="mt-4 rounded-xl bg-[#2E5B37] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#1B4332]"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : (
                <>
                  {/* Question filters */}
                  <section
                    aria-label="Filtros do banco de questões"
                    className="mt-4 overflow-hidden rounded-2xl border border-[#0F2942]/10 bg-white shadow-sm transition-all sm:mt-6 sm:rounded-[24px] sm:bg-[#F8F5EE]"
                  >
                    {!isQuestionFiltersExpanded ? (
                      /* Card totalmente recolhido: apenas uma barra compacta e elegante */
                      <div
                        onClick={() => setIsQuestionFiltersExpanded(true)}
                        className="flex items-center justify-between gap-3 px-3.5 py-3 transition hover:bg-[#F8F5EE]/60 sm:px-5 sm:py-3.5 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E5B37]/10 text-[#2E5B37] shrink-0 sm:h-8 sm:w-8">
                            <ListFilter className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-black text-[#0F2942] sm:text-sm">Filtre sua prática</span>
                              {hasQuestionFilters && (
                                <span className="inline-flex items-center rounded-full bg-[#2E5B37]/10 px-2 py-0.5 text-[9px] font-bold text-[#2E5B37]">
                                  Filtros ativos
                                </span>
                              )}
                            </div>
                            <p className="truncate text-[10px] text-[#0F2942]/60 sm:text-xs">
                              {currentMonitorLabel} • {currentSubjectLabel} • {currentTopicLabel} • {currentStatusLabel}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsQuestionFiltersExpanded(true);
                          }}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#0F2942]/15 bg-white px-2.5 py-1.5 text-[10px] font-black text-[#0F2942] shadow-2xs transition hover:bg-[#E8F4E8] hover:border-[#2E5B37]/30 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs cursor-pointer"
                          aria-expanded={false}
                          title="Expandir filtros"
                        >
                          <ListFilter className="h-3.5 w-3.5 text-[#2E5B37]" />
                          <span>Expandir</span>
                          <ChevronDown className="h-3.5 w-3.5 text-[#0F2942]/60" />
                        </button>
                      </div>
                    ) : (
                      /* Card expandido: cabeçalho + KPIs + seletores */
                      <>
                        <div className="border-b border-[#0F2942]/8 px-3 py-3 sm:px-5 sm:py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                            <button
                              type="button"
                              onClick={() => setIsQuestionFiltersExpanded(false)}
                              className="group flex items-center gap-2 text-left cursor-pointer transition hover:opacity-85"
                              aria-expanded={true}
                              title="Recolher card de filtros"
                            >
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E5B37]/10 text-[#2E5B37] transition group-hover:bg-[#2E5B37]/20 sm:h-8 sm:w-8">
                                <ListFilter className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 text-[13px] font-black text-[#0F2942] sm:text-sm">
                                  <span>Filtre sua prática</span>
                                  <ChevronDown className="h-3.5 w-3.5 rotate-180 text-[#2E5B37] transition-transform duration-200" />
                                </div>
                                <p className="hidden text-[10px] leading-relaxed text-[#0F2942]/55 sm:block sm:text-xs">
                                  Escolha o conteúdo e acompanhe seu desempenho sem perder o histórico.
                                </p>
                              </div>
                            </button>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              {hasQuestionFilters && (
                                <button
                                  type="button"
                                  onClick={clearQuestionFilters}
                                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-black text-[#2E5B37] transition hover:bg-white sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs cursor-pointer"
                                >
                                  Limpar filtros
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={openResetQuestionConfirmation}
                                disabled={isResettingQuestions || answeredQuestionsCount === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2E5B37]/25 bg-white px-2.5 py-1.5 text-[10px] font-black text-[#2E5B37] shadow-2xs transition hover:bg-[#E8F4E8] disabled:cursor-not-allowed disabled:opacity-45 sm:gap-2 sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-xs"
                              >
                                <RotateCw className={`h-3.5 w-3.5 ${isResettingQuestions ? 'animate-spin' : ''}`} />
                                {isResettingQuestions ? 'Preparando...' : 'Refazer questões'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsQuestionFiltersExpanded(false)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F2942]/15 bg-white px-2.5 py-1.5 text-[10px] font-black text-[#0F2942] shadow-2xs transition hover:bg-[#E8F4E8] hover:border-[#2E5B37]/30 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs cursor-pointer"
                                aria-expanded={true}
                                title="Recolher card de filtros"
                              >
                                <ListFilter className="h-3.5 w-3.5 text-[#2E5B37]" />
                                <span>Recolher</span>
                                <ChevronDown className="h-3.5 w-3.5 rotate-180 text-[#0F2942]/60 transition-transform duration-200" />
                              </button>
                            </div>
                          </div>

                          {/* KPIs com títulos sempre visíveis */}
                          <div className="mt-3 grid w-full min-w-0 grid-cols-5 gap-1.5 sm:mt-4 sm:gap-2">
                            {[
                              { label: 'Total', fullLabel: 'Total de questões no escopo', value: totalQuestionsInScope, tone: 'text-[#0F2942]' },
                              { label: 'Respondidas', fullLabel: 'Questões respondidas', value: answeredQuestionsCount, tone: 'text-[#2E5B37]' },
                              { label: 'Pendentes', fullLabel: 'Questões pendentes', value: pendingQuestionsCount, tone: 'text-amber-700' },
                              { label: 'Acertos', fullLabel: 'Acertos históricos', value: practiceStats.correctCount, tone: 'text-[#2E5B37]' },
                              { label: 'Precisão', fullLabel: 'Precisão histórica', value: `${practiceStats.accuracy}%`, tone: 'text-[#0F2942]' },
                            ].map((metric) => (
                              <div
                                key={metric.label}
                                title={metric.fullLabel}
                                className="flex min-w-0 flex-col items-center justify-center rounded-xl border border-[#0F2942]/8 bg-white px-1 py-1.5 text-center shadow-2xs sm:rounded-2xl sm:px-3 sm:py-2.5 sm:items-start sm:text-left"
                              >
                                <p className="w-full truncate text-[8px] font-black uppercase leading-tight tracking-tight text-[#0F2942]/50 sm:text-[9px] sm:tracking-[0.1em]">
                                  {metric.label}
                                </p>
                                <p className={`w-full truncate font-heading text-[13px] font-black sm:mt-1 sm:text-xl ${metric.tone}`}>
                                  {metric.value}
                                </p>
                              </div>
                            ))}
                          </div>
                          {resetMessage && <p className="mt-3 text-xs font-bold text-[#2E5B37]" role="status">{resetMessage}</p>}
                          {resetError && <p className="mt-3 text-xs font-bold text-rose-700" role="alert">{resetError}</p>}
                        </div>

                        {/* Seletores em Grid */}
                        <div className="px-3 py-3 sm:px-5 sm:py-4">
                          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
                            <label className="space-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#0F2942]/55 sm:space-y-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                              Monitor
                              <select
                                aria-label="Filtrar questões por monitor"
                                value={selectedMonitorId}
                                onChange={(e) => {
                                  setIsLoadingQuestionData(true);
                                  setQuestionLoadError(null);
                                  setSelectedMonitorId(e.target.value);
                                  setSelectedSubjectId('ALL');
                                  setSelectedTopicId('ALL');
                                  setSelectedSubtopicId('ALL');
                                  setCurrentPage(1);
                                }}
                                className="w-full rounded-lg border border-[#0F2942]/12 bg-white px-2 py-1.5 text-[10px] font-bold normal-case tracking-normal text-[#0F2942] transition focus:border-[#2E5B37] focus:outline-none cursor-pointer sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                              >
                                <option value="ALL">Todos os monitores</option>
                                {monitorsOptions.map((monitor) => <option key={monitor.id} value={monitor.id}>{monitor.name}</option>)}
                              </select>
                            </label>
                            <label className="space-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#0F2942]/55 sm:space-y-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                              Matéria
                              <select
                                aria-label="Filtrar questões por matéria"
                                value={selectedSubjectId}
                                onChange={(e) => {
                                  setIsLoadingQuestionData(true);
                                  setQuestionLoadError(null);
                                  setSelectedSubjectId(e.target.value);
                                  setSelectedTopicId('ALL');
                                  setSelectedSubtopicId('ALL');
                                  setCurrentPage(1);
                                }}
                                className="w-full rounded-lg border border-[#0F2942]/12 bg-white px-2 py-1.5 text-[10px] font-bold normal-case tracking-normal text-[#0F2942] transition focus:border-[#2E5B37] focus:outline-none cursor-pointer sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                              >
                                <option value="ALL">Todas as matérias</option>
                                {availableSubjects.map((subject) => <option key={`${('monitorName' in subject ? subject.monitorName : 'all') || 'all'}-${subject.id}`} value={subject.id}>{subject.name}</option>)}
                              </select>
                            </label>
                            <label className="space-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#0F2942]/55 sm:space-y-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                              Tópico
                              <select
                                aria-label="Filtrar questões por tópico"
                                value={selectedTopicId}
                                onChange={(e) => {
                                  setIsLoadingQuestionData(true);
                                  setQuestionLoadError(null);
                                  setSelectedTopicId(e.target.value);
                                  setSelectedSubtopicId('ALL');
                                  setCurrentPage(1);
                                }}
                                className="w-full rounded-lg border border-[#0F2942]/12 bg-white px-2 py-1.5 text-[10px] font-bold normal-case tracking-normal text-[#0F2942] transition focus:border-[#2E5B37] focus:outline-none cursor-pointer sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                              >
                                <option value="ALL">Todos os tópicos</option>
                                {availableTopics.map((topic) => <option key={`${('monitorName' in topic ? topic.monitorName : 'all') || 'all'}-${topic.id}`} value={topic.id}>{topic.name}</option>)}
                              </select>
                            </label>
                            {selectedTopicId !== 'ALL' && availableSubtopics.length > 0 && (
                              <label className="space-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#0F2942]/55 sm:space-y-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                                Subtópico
                                <select
                                  aria-label="Filtrar questões por subtópico"
                                  value={selectedSubtopicId}
                                  onChange={(e) => {
                                    setIsLoadingQuestionData(true);
                                    setQuestionLoadError(null);
                                    setSelectedSubtopicId(e.target.value);
                                    setCurrentPage(1);
                                  }}
                                  className="w-full rounded-lg border border-[#0F2942]/12 bg-white px-2 py-1.5 text-[10px] font-bold normal-case tracking-normal text-[#0F2942] transition focus:border-[#2E5B37] focus:outline-none cursor-pointer sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                                >
                                  <option value="ALL">Todos os subtópicos</option>
                                  {availableSubtopics.map((subtopic) => <option key={subtopic.id} value={subtopic.id}>{subtopic.name}</option>)}
                                </select>
                              </label>
                            )}
                            <label className="space-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#0F2942]/55 sm:space-y-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                              Dificuldade
                              <select
                                aria-label="Filtrar questões por dificuldade"
                                value={selectedDifficulty}
                                onChange={(e) => {
                                  setIsLoadingQuestionData(true);
                                  setQuestionLoadError(null);
                                  setSelectedDifficulty(e.target.value);
                                  setCurrentPage(1);
                                }}
                                className="w-full rounded-lg border border-[#0F2942]/12 bg-white px-2 py-1.5 text-[10px] font-bold normal-case tracking-normal text-[#0F2942] transition focus:border-[#2E5B37] focus:outline-none cursor-pointer sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                              >
                                <option value="ALL">Todas as dificuldades</option>
                                <option value="EASY">Fácil</option>
                                <option value="MEDIUM">Média</option>
                                <option value="HARD">Difícil</option>
                              </select>
                            </label>
                            <label className="space-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#0F2942]/55 sm:space-y-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                              Status
                              <select
                                aria-label="Filtrar questões por resposta"
                                value={questionAnswerFilter}
                                onChange={(e) => {
                                  setQuestionAnswerFilter(e.target.value as QuestionAnswerFilter);
                                  setCurrentPage(1);
                                }}
                                className={`w-full rounded-lg border px-2 py-1.5 text-[10px] font-black normal-case tracking-normal transition focus:border-[#2E5B37] focus:outline-none cursor-pointer sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs ${questionAnswerFilter === 'UNANSWERED' ? 'border-[#2E5B37]/30 bg-[#E8F4E8] text-[#20512a]' : 'border-[#0F2942]/12 bg-white text-[#0F2942]'}`}
                              >
                                <option value="UNANSWERED">Não respondidas ({pendingQuestionsCount})</option>
                                <option value="ALL">Todas ({totalQuestionsInScope})</option>
                                <option value="ANSWERED">Respondidas ({answeredQuestionsCount})</option>
                                <option value="CORRECT">Acertadas ({correctQuestionsCount})</option>
                                <option value="INCORRECT">Erradas ({incorrectQuestionsCount})</option>
                              </select>
                            </label>
                          </div>
                        </div>
                      </>
                    )}
                  </section>

                  {/* Barra de controle da página e revelação de gabarito */}
                  <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-[#0F2942]/8 bg-white/70 p-3 sm:mt-4 sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:px-5 sm:py-3.5 shadow-2xs">
                    <p className="text-xs font-bold text-[#0F2942]/65">
                      Exibindo <span className="text-[#0F2942] font-black">{filteredQuestions.length === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, filteredQuestions.length)}</span> de <span className="text-[#0F2942] font-black">{totalQuestionsForDisplay}</span> questões
                    </p>
                    <button
                      type="button"
                      disabled={displayedQuestions.length === 0}
                      onClick={() => handleBulkSubmit(displayedQuestions.map((q) => q.id))}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2E5B37] px-4 py-2.5 text-xs font-black text-white transition hover:bg-[#22472a] disabled:cursor-not-allowed disabled:opacity-40 shadow-sm cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Revelar respostas da página</span>
                    </button>
                  </div>

                  {/* Questions List */}
                  <div className="mt-5 space-y-5 sm:mt-6 sm:space-y-8">
                    {displayedQuestions.map((q, _qIndex) => {
                      const globalNumber = questionsList.findIndex((question) => question.id === q.id) + 1;
                      const selectedOpt = selectedAnswers[q.id];
                      const isSubmitting = Boolean(isSubmittingQuestion[q.id]);
                      const hasSubmitted = Boolean(submittedQuestions[q.id] || q.latestAttempt);
                      const isSubmitted = hasSubmitted && !isSubmitting;
                      const revealedResult = revealedQuestionResults[q.id];
                      const isAiOpen = activeAiDoubtQuestionId === q.id;

                      const correctAnswerLabel = revealedResult?.correctAnswer || q.correctAnswer || (q.latestAttempt?.isCorrect ? q.latestAttempt.selectedAnswer : undefined);
                      const explanationContent = revealedResult?.explanation || (isSubmittingQuestion[q.id] ? 'Carregando gabarito e resolução comentada...' : q.explanation);

                      return (
                        <div key={q.id} className="space-y-3 rounded-2xl border border-[#0F2942]/12 bg-white p-3 shadow-sm sm:space-y-4 sm:p-6">
                          {/* Question Meta & Topic */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <PracticeQuestionHeading
                              questionNumber={globalNumber}
                              totalQuestions={questionsList.length}
                              topic={q.topic}
                              provenance={q.provenance}
                            />
                            {isSubmitted && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#E3F1E4] px-2.5 py-0.5 text-[10px] font-bold text-[#2E5B37]">
                                <Check className="h-3 w-3" /> Resposta Registrada
                              </span>
                            )}
                          </div>

                          {/* Imagens de contexto preservadas pela rastreabilidade do acervo */}
                          {q.imageUrls.length > 0 && (
                            <div className="space-y-3" aria-label="Imagens de contexto da questão">
                              {q.imageUrls.map((imageUrl, imageIndex) => (
                                <OptimizedImage
                                  key={`${q.id}-image-${imageIndex}`}
                                  src={imageUrl}
                                  alt={`Imagem de contexto da questão ${globalNumber}${q.imageUrls.length > 1 ? `, ${imageIndex + 1}` : ''}`}
                                  width={1200}
                                  height={675}
                                  className="mx-auto max-h-[28rem] w-full rounded-xl border border-[#0F2942]/10 bg-[#F8F5EE] object-contain"
                                />
                              ))}
                            </div>
                          )}

                          {/* Statement */}
                          <h3 className="text-base font-semibold leading-relaxed text-[#0F2942]">
                            {q.statement}
                          </h3>

                          {/* Options */}
                          <div className="space-y-2.5">
                            {q.options.map((opt) => {
                              const isSelected = selectedOpt === opt.label;
                              const isCorrect = Boolean(
                                (correctAnswerLabel && opt.label === correctAnswerLabel)
                                || (q.latestAttempt && !correctAnswerLabel && isSelected && q.latestAttempt.isCorrect),
                              );

                              let optionStyle = 'border-[#0F2942]/12 bg-[#F8F5EE] hover:border-[#2E5B37]/40 hover:bg-white';
                              if (isSelected && !isSubmitted) {
                                optionStyle = 'border-[#0F2942] bg-[#0F2942] text-white';
                              } else if (isSubmitted) {
                                if (isCorrect) {
                                  optionStyle = 'border-[#2E5B37] bg-[#E3F1E4] text-[#2E5B37] font-bold';
                                } else if (isSelected && !isCorrect) {
                                  optionStyle = 'border-rose-300 bg-rose-50 text-rose-700 font-semibold';
                                }
                              }

                              return (
                                <button
                                  key={opt.label}
                                  onClick={() => {
                                    if (hasSubmitted || isSubmitting) return;
                                    setSelectedAnswers((prev) => ({ ...prev, [q.id]: opt.label }));
                                    setQuestionSelectionErrors((current) => ({ ...current, [q.id]: false }));
                                  }}
                                  className={`flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left text-xs font-semibold transition duration-200 cursor-pointer ${optionStyle}`}
                                >
                                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-bold ${
                                    isSelected && !isSubmitted ? 'bg-white text-[#0F2942]' : 'bg-white/80 border border-[#0F2942]/15 text-[#0F2942]'
                                  }`}>
                                    {opt.label}
                                  </span>
                                  <span className="flex-1 text-sm">{opt.text}</span>
                                  {isSubmitted && isCorrect && <Check className="h-5 w-5 text-[#2E5B37]" />}
                                  {isSubmitted && isSelected && !isCorrect && <X className="h-5 w-5 text-rose-600" />}
                                </button>
                              );
                            })}
                          </div>

                          {/* Loading state during submission */}
                          {isSubmittingQuestion[q.id] && (
                            <div className="flex items-center gap-2 rounded-xl bg-[#E3F1E4] p-3 text-xs font-bold text-[#2E5B37] animate-pulse border border-[#2E5B37]/30">
                              <Loader2 className="h-4 w-4 animate-spin text-[#2E5B37]" />
                              <span>Registrando resposta e consultando gabarito...</span>
                            </div>
                          )}

                          {/* Explanation */}
                          {isSubmitted && !isSubmittingQuestion[q.id] && (
                            <div className="rounded-2xl bg-[#E3F1E4]/50 p-4 border border-[#2E5B37]/20 animate-fade-in space-y-1.5">
                              <div className="flex items-center gap-2 text-xs font-bold text-[#2E5B37]">
                                <Bot className="h-4 w-4" />
                                <span>Gabarito e Resolução Comentada pela IA</span>
                              </div>
                              <p className="text-xs sm:text-sm leading-relaxed text-[#0F2942]/90">
                                {explanationContent}
                              </p>
                            </div>
                          )}

                          {questionAttemptErrors[q.id] && (
                            <p className="text-xs font-semibold text-rose-700">Não foi possível salvar sua resposta no servidor. Tente novamente.</p>
                          )}
                          {questionSelectionErrors[q.id] && (
                            <p className="text-xs font-semibold text-amber-700">Selecione uma alternativa para ver a resposta e a explicação.</p>
                          )}

                          {/* Action Buttons per Question */}
                          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#0F2942]/10">
                            <button
                              onClick={() => {
                                const qId = String(q.id);
                                if (activeContext?.id !== qId) {
                                  setActiveContext({
                                    id: qId,
                                    monitorId: q.monitorId,
                                    subjectId: q.subjectId,
                                    topicId: q.topicId,
                                    questionAttemptId: q.latestAttempt?.id,
                                    number: globalNumber,
                                    topic: q.topic,
                                    statement: q.statement,
                                    selectedOption: selectedOpt || undefined,
                                    options: q.options,
                                    correctAnswer: isSubmitted ? correctAnswerLabel : undefined,
                                    explanation: isSubmitted ? explanationContent : undefined,
                                  });
                                }

                                // On desktop the chat sidebar is already beside the question.
                                // Keep this page in place; mobile still navigates to its full-screen chat.
                                if (!window.matchMedia('(min-width: 1024px)').matches) {
                                  router.push('/areadoaluno/chat');
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 justify-center rounded-xl px-4 py-2 text-xs font-bold text-white transition cursor-pointer shadow-sm ${
                                activeContext?.id === String(q.id)
                                  ? 'bg-[#2E5B37] ring-2 ring-[#76D69B]'
                                  : 'bg-[#0F2942] hover:bg-[#1C466D]'
                              }`}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              <span>
                                {activeContext?.id === String(q.id) ? 'Contexto Anexado ao Chat ✓' : 'Tirar dúvida com IA'}
                              </span>
                            </button>

                            <button
                              onClick={() => {
                                setReportTarget({ type: 'QUESTION', id: String(q.id) });
                                setReportModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 justify-center rounded-xl border border-red-200/50 bg-red-50/50 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 cursor-pointer shadow-sm"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Reportar erro</span>
                              <span className="sm:hidden">Reportar</span>
                            </button>

                            {!hasSubmitted ? (
                              <button
                                onClick={() => void submitQuestionAnswer(q)}
                                disabled={isSubmittingQuestion[q.id]}
                                className="inline-flex items-center gap-2 rounded-xl bg-[#2E5B37] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#22472a] disabled:opacity-75 cursor-pointer shadow-sm"
                              >
                                {isSubmittingQuestion[q.id] ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                                    <span>Verificando...</span>
                                  </>
                                ) : (
                                  <span>Ver resposta</span>
                                )}
                              </button>
                            ) : isSubmitting ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2E5B37]">
                                <Loader2 className="h-4 w-4 animate-spin" /> Verificando resposta...
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#2E5B37]">
                                <Check className="h-4 w-4" /> Resposta verificada
                              </span>
                            )}
                          </div>

                          {/* Inline AI Doubt Drawer for this specific Question */}
                          {isAiOpen && (
                            <div className="mt-3 rounded-2xl border border-[#2E5B37]/30 bg-[#0F2942] p-5 text-white shadow-xl animate-fade-in">
                              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                <div className="flex items-center gap-2 text-xs font-bold text-[#76D69B]">
                                  <Bot className="h-4 w-4" />
                                  <span>Monitor IA — Tira-Dúvidas da Questão {globalNumber}</span>
                                </div>
                                <button
                                  onClick={() => setActiveAiDoubtQuestionId(null)}
                                  className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white transition cursor-pointer"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              <p className="mt-3 text-xs leading-relaxed text-white/85">
                                Olá! Estou pronto para esclarecer suas dúvidas sobre a <strong className="text-white">Questão {globalNumber}</strong> ({q.topic}).
                              </p>
                              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                                <input
                                  type="text"
                                  value={aiQuestionInput}
                                  onChange={(e) => setAiQuestionInput(e.target.value)}
                                  placeholder="Ex: Por que a alternativa B está incorreta?"
                                  className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs text-white placeholder-white/40 focus:border-[#76D69B] focus:bg-white/15 focus:outline-none"
                                />
                                <button
                                  onClick={() => {
                                    if (!aiQuestionInput.trim()) return;
                                    alert(`Dúvida enviada ao Monitor IA para a Questão ${globalNumber}: "${aiQuestionInput}"`);
                                    setAiQuestionInput('');
                                  }}
                                  className="rounded-xl bg-[#76D69B] px-5 py-2 text-xs font-bold text-[#0F2942] hover:bg-[#60c487] transition cursor-pointer"
                                >
                                  Perguntar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination Bar */}
                  {totalPages > 1 && (
                    <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[#0F2942]/10 pt-5">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#0F2942]/15 bg-[#F8F5EE] px-4 py-2 text-xs font-bold text-[#0F2942] transition hover:bg-white disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="h-4 w-4 rotate-180 text-[#2E5B37]" />
                        <span>Anterior</span>
                      </button>

                      <div className="flex flex-wrap items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`h-8 w-8 rounded-lg text-xs font-bold transition cursor-pointer ${
                              currentPage === pageNum
                                ? 'bg-[#0F2942] text-white shadow-xs'
                                : 'bg-[#F8F5EE] text-[#0F2942] hover:bg-[#0F2942]/10'
                            }`}
                          >
                            {pageNum}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#0F2942]/15 bg-[#F8F5EE] px-4 py-2 text-xs font-bold text-[#0F2942] transition hover:bg-white disabled:opacity-40 cursor-pointer"
                      >
                        <span>Próxima</span>
                        <ChevronRight className="h-4 w-4 text-[#2E5B37]" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* Flashcard Viewer Mode */
                <div className="mt-6">
                  <section
                    aria-label="Filtros dos flashcards"
                    className="mb-6 overflow-hidden rounded-[22px] border border-[#0F2942]/10 bg-[#F8F5EE] shadow-sm transition-all"
                  >
                    {!isFlashcardFiltersExpanded ? (
                      /* Flashcards Card totalmente recolhido */
                      <div
                        onClick={() => setIsFlashcardFiltersExpanded(true)}
                        className="flex items-center justify-between gap-3 px-3.5 py-3 transition hover:bg-[#F8F5EE]/80 sm:px-5 sm:py-3.5 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E5B37]/10 text-[#2E5B37] shrink-0 sm:h-8 sm:w-8">
                            <ListFilter className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-black text-[#0F2942] sm:text-sm">Filtre seus flashcards</span>
                              {hasScopeFilters && (
                                <span className="inline-flex items-center rounded-full bg-[#2E5B37]/10 px-2 py-0.5 text-[9px] font-bold text-[#2E5B37]">
                                  Filtros ativos
                                </span>
                              )}
                            </div>
                            <p className="truncate text-[10px] text-[#0F2942]/60 sm:text-xs">
                              {currentMonitorLabel} • {currentSubjectLabel} • {currentTopicLabel}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsFlashcardFiltersExpanded(true);
                          }}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#0F2942]/15 bg-white px-2.5 py-1.5 text-[10px] font-black text-[#0F2942] shadow-2xs transition hover:bg-[#E8F4E8] hover:border-[#2E5B37]/30 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs cursor-pointer"
                          aria-expanded={false}
                          title="Expandir filtros"
                        >
                          <ListFilter className="h-3.5 w-3.5 text-[#2E5B37]" />
                          <span>Expandir</span>
                          <ChevronDown className="h-3.5 w-3.5 text-[#0F2942]/60" />
                        </button>
                      </div>
                    ) : (
                      /* Flashcards Card expandido */
                      <>
                        <div className="border-b border-[#0F2942]/8 px-3.5 py-3 sm:px-5 sm:py-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                            <button
                              type="button"
                              onClick={() => setIsFlashcardFiltersExpanded(false)}
                              className="group flex items-center gap-2 text-left cursor-pointer transition hover:opacity-85"
                              aria-expanded={true}
                              title="Recolher filtros"
                            >
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2E5B37]/10 text-[#2E5B37] transition group-hover:bg-[#2E5B37]/20 sm:h-8 sm:w-8">
                                <ListFilter className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5 text-[13px] font-black text-[#0F2942] sm:text-sm">
                                  <span>Filtre seus flashcards</span>
                                  <ChevronDown className="h-3.5 w-3.5 rotate-180 text-[#2E5B37] transition-transform duration-200" />
                                </div>
                                <p className="hidden text-[10px] leading-relaxed text-[#0F2942]/55 sm:block sm:text-xs">
                                  Escolha o monitor, a matéria e o tópico para praticar.
                                </p>
                              </div>
                            </button>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              {hasScopeFilters && (
                                <button
                                  type="button"
                                  onClick={clearFlashcardFilters}
                                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-black text-[#2E5B37] transition hover:bg-white sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs cursor-pointer"
                                >
                                  Limpar filtros
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setIsFlashcardFiltersExpanded(false)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F2942]/15 bg-white px-2.5 py-1.5 text-[10px] font-black text-[#0F2942] shadow-2xs transition hover:bg-[#E8F4E8] hover:border-[#2E5B37]/30 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs cursor-pointer"
                                aria-expanded={true}
                                title="Recolher filtros"
                              >
                                <ListFilter className="h-3.5 w-3.5 text-[#2E5B37]" />
                                <span>Recolher</span>
                                <ChevronDown className="h-3.5 w-3.5 rotate-180 text-[#0F2942]/60 transition-transform duration-200" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 px-3 py-3 sm:grid-cols-3 sm:gap-3 sm:px-5 sm:py-4">
                          <label className="space-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#0F2942]/55 sm:space-y-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                            Monitor
                            <select
                              aria-label="Filtrar flashcards por monitor"
                              value={selectedMonitorId}
                              onChange={(event) => handleFlashcardMonitorChange(event.target.value)}
                              className="w-full rounded-lg border border-[#0F2942]/12 bg-white px-2 py-1.5 text-[10px] font-bold normal-case tracking-normal text-[#0F2942] transition focus:border-[#2E5B37] focus:outline-none cursor-pointer sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                            >
                              <option value="ALL">Todos os monitores</option>
                              {monitorsOptions.map((monitor) => <option key={monitor.id} value={monitor.id}>{monitor.name}</option>)}
                            </select>
                          </label>
                          <label className="space-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#0F2942]/55 sm:space-y-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                            Matéria
                            <select
                              aria-label="Filtrar flashcards por matéria"
                              value={selectedSubjectId}
                              onChange={(event) => handleFlashcardSubjectChange(event.target.value)}
                              className="w-full rounded-lg border border-[#0F2942]/12 bg-white px-2 py-1.5 text-[10px] font-bold normal-case tracking-normal text-[#0F2942] transition focus:border-[#2E5B37] focus:outline-none cursor-pointer sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                            >
                              <option value="ALL">Todas as matérias</option>
                              {availableSubjects.map((subject) => <option key={`${('monitorName' in subject ? subject.monitorName : 'all') || 'all'}-${subject.id}`} value={subject.id}>{subject.name}</option>)}
                            </select>
                          </label>
                          <label className="space-y-1 text-[8px] font-black uppercase tracking-[0.1em] text-[#0F2942]/55 sm:space-y-1.5 sm:text-[10px] sm:tracking-[0.12em]">
                            Tópico
                            <select
                              aria-label="Filtrar flashcards por tópico"
                              value={selectedTopicId}
                              onChange={(event) => handleFlashcardTopicChange(event.target.value)}
                              className="w-full rounded-lg border border-[#0F2942]/12 bg-white px-2 py-1.5 text-[10px] font-bold normal-case tracking-normal text-[#0F2942] transition focus:border-[#2E5B37] focus:outline-none cursor-pointer sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-xs"
                            >
                              <option value="ALL">Todos os tópicos</option>
                              {availableTopics.map((topic) => <option key={`${('monitorName' in topic ? topic.monitorName : 'all') || 'all'}-${topic.id}`} value={topic.id}>{topic.name}</option>)}
                            </select>
                          </label>
                        </div>
                      </>
                    )}
                  </section>
                  {isLoadingFlashcard ? (
                    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#2E5B37]/30 bg-[#F8F5EE] p-8 text-center">
                      <Loader2 className="h-10 w-10 animate-spin text-[#2E5B37] mb-3" />
                      <p className="text-sm font-bold text-[#0F2942]/80">Carregando próximo cartão...</p>
                      <p className="text-xs text-[#0F2942]/50 mt-1">Buscando na fila de repetição espaçada</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex items-center justify-between border-y border-[#0F2942]/10 py-3 sm:mb-4 sm:border-t-0 sm:py-0">
                        <button
                          onClick={() => setIsFlipped(!isFlipped)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#0F2942]/15 bg-white px-3 py-2 text-[11px] font-bold text-[#0F2942] hover:bg-[#F8F5EE] cursor-pointer sm:px-4 sm:py-2.5 sm:text-xs"
                        >
                          <RotateCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> {isFlipped ? 'Ver Pergunta' : 'Virar Cartão'}
                        </button>

                        <button
                          onClick={() => {
                            if (currentFlashcard) {
                              setReportTarget({ type: 'FLASHCARD', id: String(currentFlashcard.id) });
                              setReportModalOpen(true);
                            }
                          }}
                          aria-label="Reportar erro do flashcard"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200/70 bg-red-50/50 text-red-600 hover:bg-red-50 cursor-pointer sm:h-10 sm:w-10"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span className="sr-only">Reportar erro</span>
                        </button>
                      </div>

                      <div className="w-full [perspective:1000px]">
                        {!currentFlashcard ? (
                          <div className="flex min-h-[260px] sm:min-h-[300px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#0F2942]/20 bg-[#F8F5EE] p-8 text-center">
                            <Layers className="mx-auto h-8 w-8 text-[#0F2942]/30 mb-3" />
                            <h4 className="font-heading text-base font-bold text-[#0F2942]">
                              Nenhum flashcard disponível
                            </h4>
                            <p className="mt-2 text-xs text-[#0F2942]/60 max-w-md mx-auto">
                              {flashcardErrorMessage || 'Você ainda não possui assinatura deste monitor ou não há flashcards cadastrados.'}
                            </p>
                          </div>
                        ) : (
                          <div
                            onClick={() => setIsFlipped(!isFlipped)}
                            className={`relative min-h-[260px] sm:min-h-[300px] md:min-h-[330px] w-full cursor-pointer transition-transform duration-700 [transform-style:preserve-3d] ${
                              isFlipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'
                            }`}
                          >
                            {/* Frente do Cartão (Pergunta - Azulado com letras brancas) */}
                            <div className="absolute inset-0 flex flex-col justify-between rounded-[22px] border border-[#1E3A8A]/30 bg-gradient-to-br from-[#0F2942] via-[#16385C] to-[#0F2942] p-6 sm:p-8 text-center text-white shadow-xl [backface-visibility:hidden]">
                              <div className="flex flex-col items-center gap-1.5">
                                {currentFlashcard.subject && (
                                  <span className="inline-block rounded-lg bg-white/15 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm shadow-inner">
                                    {currentFlashcard.subject}
                                  </span>
                                )}
                                {currentFlashcard.monitorName && (
                                  <span className="inline-block rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                                    {currentFlashcard.monitorName}
                                  </span>
                                )}
                              </div>

                              <div className="my-3 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-2 sm:my-4 sm:min-h-[120px]">
                                <p className="text-sm font-semibold leading-relaxed text-white sm:text-lg md:text-xl">
                                  {currentFlashcard.front}
                                </p>
                              </div>

                              <div className="text-xs sm:text-sm font-bold text-white/70 flex items-center justify-center gap-1.5">
                                <span>💡 Clique para revelar a resposta</span>
                              </div>
                            </div>

                            {/* Verso do Cartão (Resposta - Esverdeado com letras brancas) */}
                            <div className="absolute inset-0 flex flex-col justify-between rounded-[22px] border border-[#2E5B37]/40 bg-gradient-to-br from-[#1B4332] via-[#2E5B37] to-[#1B4332] p-6 sm:p-8 text-center text-white shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
                              <div className="flex flex-col items-center gap-1.5">
                                <span className="inline-block rounded-lg bg-white/20 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm shadow-inner">
                                  ✓ Resposta
                                </span>
                                {currentFlashcard.subject && (
                                  <span className="inline-block rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                                    {currentFlashcard.subject}
                                  </span>
                                )}
                              </div>

                              <div className="my-3 flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-2 sm:my-4 sm:min-h-[120px]">
                                <p className="text-sm font-semibold leading-relaxed text-white sm:text-lg md:text-xl">
                                  {currentFlashcard.back}
                                </p>
                              </div>

                              <div className="text-xs sm:text-sm font-bold text-white/80 flex items-center justify-center gap-1.5">
                                <span>✓ Pergunta original gravada</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Anki Spaced Repetition (SRS) Rating Buttons OR Next Flashcard Button */}
                      {isFlipped && (
                        <div className="mt-6 pt-4 border-t border-[#0F2942]/10 animate-fade-in">
                          {hasReviewedCard ? (
                            <div className="space-y-3">
                              {currentFlashcard?.monitorId && currentFlashcard?.subjectId && (
                                <AskAiContextButton
                                  onClick={handleAttachFlashcardToAi}
                                  isAttached={activeFlashcardContext?.id === currentFlashcard?.id}
                                />
                              )}
                              <button
                                onClick={() => {
                                setIsFlipped(false);
                                setHasReviewedCard(false);
                                void fetchNextFlashcard();
                                }}
                                className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#2E5B37] py-3.5 px-4 text-center text-xs sm:text-sm font-bold text-white shadow-md transition hover:bg-[#1B4332] hover:shadow-lg cursor-pointer"
                              >
                                <span>Gerar Próximo Flashcard</span>
                                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-center text-xs font-bold text-[#0F2942]/60 mb-3">
                                Como foi sua lembrança deste cartão? (Repetição Espaçada)
                              </p>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
                                <button
                                  onClick={() => handleReviewFlashcard('AGAIN')}
                                  className="flex min-h-10 flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/80 px-2 py-2.5 text-rose-700 transition hover:bg-rose-100 cursor-pointer sm:py-3.5 sm:px-3"
                                >
                                  <span className="text-[11px] font-bold sm:text-xs">Não lembrei</span>
                                </button>

                                <button
                                  onClick={() => handleReviewFlashcard('HARD')}
                                  className="flex min-h-10 flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/80 px-2 py-2.5 text-amber-700 transition hover:bg-amber-100 cursor-pointer sm:py-3.5 sm:px-3"
                                >
                                  <span className="text-[11px] font-bold sm:text-xs">Foi difícil</span>
                                </button>

                                <button
                                  onClick={() => handleReviewFlashcard('GOOD')}
                                  className="flex min-h-10 flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/80 px-2 py-2.5 text-emerald-800 transition hover:bg-emerald-100 cursor-pointer sm:py-3.5 sm:px-3"
                                >
                                  <span className="text-[11px] font-bold sm:text-xs">Lembrei</span>
                                </button>

                                <button
                                  onClick={() => handleReviewFlashcard('EASY')}
                                  className="flex min-h-10 flex-col items-center justify-center rounded-xl border border-sky-200 bg-sky-50/80 px-2 py-2.5 text-sky-800 transition hover:bg-sky-100 cursor-pointer sm:py-3.5 sm:px-3"
                                >
                                  <span className="text-[11px] font-bold sm:text-xs">Muito fácil</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* SUBSECTION 1: MEUS CURSOS (WITH COVER CAPA & COMPACT TEXT AREA) */}
            <section className="mt-6" aria-label="Meus Agentes">
              {/* Course Cards Grid with Cover Banner & Profile Avatar */}
              {isLoading ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-64 rounded-[24px] bg-[#E3F1E4]/30 animate-pulse border border-[#0F2942]/10" />
                  ))}
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#0F2942]/20 bg-white/50 p-8 text-center">
                  <Bot className="mx-auto h-10 w-10 text-[#0F2942]/30" />
                  <h3 className="mt-3 font-heading text-base font-bold text-[#0F2942]">
                    Nenhum agente encontrado
                  </h3>
                  <p className="mt-1 text-xs text-[#0F2942]/60">
                    {selectedMonitorId !== 'ALL'
                      ? 'Nenhum monitor corresponde ao filtro selecionado.'
                      : isTeacher
                      ? 'Você ainda não possui monitores cadastrados. Acesse o painel de professor para criar seu primeiro monitor.'
                      : 'Você ainda não assinou nenhum monitor de estudos.'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCourses.map((course) => {
                    return (
                      <div
                        key={course.id}
                        className="group relative flex flex-col justify-between overflow-hidden rounded-[24px] border border-[#0F2942]/10 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#2E5B37]/30 hover:shadow-lg"
                      >
                        {/* Top Cover Banner */}
                        <div className={`relative h-28 w-full ${course.coverUrl ? 'bg-slate-900' : `bg-gradient-to-r ${course.coverGradient}`} p-4 flex items-start justify-between overflow-hidden`}>
                          {course.coverUrl ? (
                            <>
                              <OptimizedImage
                                src={course.coverUrl}
                                alt={course.title}
                                className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/30" />
                            </>
                          ) : (
                            <span className="absolute -right-2 -bottom-3 text-7xl font-bold text-white/10 select-none font-heading">
                              {course.icon}
                            </span>
                          )}

                          {/* Subject Badge */}
                          <span className="relative z-10 rounded-md bg-white/20 backdrop-blur-md px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white border border-white/25 shadow-sm">
                            {course.subject}
                          </span>

                          <span className="relative z-10 inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-md px-2.5 py-0.5 text-[9px] font-bold text-white border border-white/25 shadow-sm">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#76D69B] animate-pulse" />
                            Ativo
                          </span>
                        </div>

                        {/* Teacher Profile Avatar overlapping banner */}
                        <div className="relative -mt-8 px-4 flex items-end justify-between z-10">
                          <TeacherAvatar
                            src={course.teacherAvatarUrl}
                            alt={course.teacherName}
                            initials={course.teacherInitials}
                            sizeClassName="h-16 w-16 text-sm"
                          />
                        </div>

                        {/* Compact Text Area */}
                        <div className="p-4 pt-2 flex flex-col justify-between flex-1">
                          <div>
                            <p className="text-[11px] font-bold text-[#0F2942]/50">
                              {course.teacherName}
                            </p>

                            <h3 className="mt-0.5 font-heading text-base font-bold leading-tight text-[#0F2942] group-hover:text-[#2E5B37] transition line-clamp-1">
                              {course.title}
                            </h3>

                            {/* Clean Stats Row */}
                            <div className="mt-3.5 flex items-center justify-between text-xs font-medium text-[#0F2942]">
                              <div className="flex items-center gap-1.5">
                                <Brain className="h-4 w-4 text-[#0F2942]/75" />
                                <span>{course.totalQuestions} questões</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Layers className="h-4 w-4 text-[#0F2942]/75" />
                                <span>{course.totalFlashcards} flashcards</span>
                              </div>
                            </div>
                          </div>

                          {/* Dual Action Buttons */}
                          <div className="mt-4 pt-3 border-t border-[#0F2942]/08 grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleStartQuestion(`Banco de Questões - ${course.title}`)}
                              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#2E5B37] px-2.5 py-2 text-xs font-bold text-white transition hover:bg-[#22472a] shadow-sm cursor-pointer"
                            >
                              <Brain className="h-3.5 w-3.5" />
                              <span>Praticar questões</span>
                            </button>

                            <button
                              onClick={() => handleStartFlashcard(`Flashcards - ${course.title}`, course.id)}
                              className="flex items-center justify-center gap-1.5 rounded-xl border border-[#0F2942]/15 bg-[#F8F5EE] px-2.5 py-2 text-xs font-bold text-[#0F2942] transition hover:bg-white hover:border-[#2E5B37]/30 hover:text-[#2E5B37] cursor-pointer"
                            >
                              <Layers className="h-3.5 w-3.5" />
                              <span>Flashcards</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* SUBSECTION 2: SIMULADOS */}
            <PracticeWeeklySimulationsSection
              monitors={rawMonitorsList}
              states={weeklySimulation.states}
              busyMonitorId={weeklySimulation.busyMonitorId}
              error={weeklySimulation.error}
              onLoadSimulation={weeklySimulation.openSimulationForMonitor}
              onAttachAiContext={(ctx) => {
                setActiveContext({
                  id: ctx.id,
                  monitorId: ctx.monitorId,
                  subjectId: ctx.subjectId,
                  topicId: ctx.topicId,
                  number: ctx.number,
                  topic: ctx.topic,
                  statement: ctx.statement,
                  selectedOption: ctx.selectedOption,
                  options: ctx.options,
                  correctAnswer: ctx.correctAnswer,
                  explanation: ctx.explanation,
                });
              }}
              onReportError={(qId) => {
                setReportTarget({ type: 'QUESTION', id: qId });
                setReportModalOpen(true);
              }}
              onAction={(monitorId, simulationStatus: WeeklySimulationStatus) => {
                if (simulationStatus === 'AVAILABLE_TO_GENERATE' || simulationStatus === 'FAILED') void weeklySimulation.generate(monitorId);
                else void weeklySimulation.openSimulationForMonitor(monitorId).then((simulation) => {
                  if (simulation) {
                    setIsWeeklySimulationStarted(false);
                    setIsWeeklySimulationStartOpen(true);
                  }
                });
              }}
            />
          </>
        )}
        </section>

        <StudentRightSidebar />
      </div>

      <ContentReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        targetType={reportTarget?.type || 'QUESTION'}
        questionId={reportTarget?.type === 'QUESTION' ? reportTarget.id : undefined}
        flashcardId={reportTarget?.type === 'FLASHCARD' ? reportTarget.id : undefined}
      />

      <WeeklySimulationStartModal simulation={isWeeklySimulationStartOpen ? weeklySimulation.activeSimulation : null} onClose={() => { setIsWeeklySimulationStartOpen(false); weeklySimulation.setActiveSimulation(null); }} onConfirm={() => { void weeklySimulation.startSimulation().then((started) => { if (started) { setIsWeeklySimulationStartOpen(false); setIsWeeklySimulationStarted(true); } }); }} />
      <WeeklySimulationModal
        simulation={isWeeklySimulationStarted ? weeklySimulation.activeSimulation : null}
        onSubmit={weeklySimulation.submitSimulation}
        onClose={() => {
          setIsWeeklySimulationStarted(false);
          const finishedMonitorId = weeklySimulation.activeSimulation?.monitorId;
          weeklySimulation.setActiveSimulation(null);
          if (finishedMonitorId) {
            void weeklySimulation.readStatus(finishedMonitorId);
          }
          void weeklySimulation.reloadAll();
        }}
      />

      <AlertModal
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        title="Refazer questões?"
        type="warning"
        showSupport={false}
        confirmLabel="Refazer questões"
        cancelLabel="Cancelar"
        showCancel
        message={(
          <div className="space-y-4 text-left">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-[#2E5B37]/15 bg-[#E8F4E8] px-3 py-3 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#2E5B37]/70">Respondidas</p>
                <p className="mt-1 font-heading text-2xl font-black text-[#2E5B37]">{practiceStats.attemptsCount}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-700/70">Acertos</p>
                <p className="mt-1 font-heading text-2xl font-black text-amber-700">{practiceStats.correctCount}</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Ao refazer questões, elas voltarão para pendentes para você praticar novamente. O histórico de desempenho será preservado.
            </p>
          </div>
        )}
        onConfirm={() => void resetQuestionProgress()}
      />
    </main>
  );
}

import type { MonitorDraft } from '../components/TeacherMonitorCreationModal';
import type { ExamProfile, QuestionBankSubject } from '../components/question-bank-catalog';
import { TeacherSessionError } from './TeacherSessionError';

const getBackendUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8443';

type RawBankSelection = { examType: string; board: string | null; subtopic: string | null; subsubtopic: string | null; selectionKey: string };

export type QuestionBankMaterializationRun = {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'RETRYING' | 'COMPLETED' | 'COMPLETED_WITH_WARNINGS' | 'FAILED';
  totalSelected: number;
  totalEligible: number | null;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  attempts: number;
  errorMessage: string | null;
};

type RawMonitor = {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  detailedDescription: string | null;
  status: string;
  priceCents?: number;
  annualPriceCents?: number | null;
  createdAt: string;
  updatedAt: string;
  knowledgeBaseCount?: number;
  questionsCount?: number;
  flashcardsCount?: number;
  questions?: Array<{ id: string }>;
  hasReportedQuestions?: boolean;
  reportedQuestionIds?: string[];
  subjects: Array<{
    id: string;
    name: string;
    topics: Array<{
      id: string;
      name: string;
      definition: string | null;
      classificationGuidance: string | null;
      questionBankSelections?: RawBankSelection[];
      subtopics?: Array<{
        id: string;
        name: string;
        position?: number;
        questionBankSelections?: RawBankSelection[];
        subsubtopics?: Array<{
          id: string;
          name: string;
          position?: number;
          questionBankSelections?: RawBankSelection[];
        }>;
      }>;
    }>;
  }>;
};

export type TeacherMonitor = Omit<MonitorDraft, 'subjects'> & {
  id: string;
  status: string;
  priceCents?: number;
  annualPriceCents?: number | null;
  createdAt: string;
  updatedAt: string;
  avatarUrl?: string | null;
  detailedDescription?: string | null;
  knowledgeBaseCount?: number;
  questionsCount?: number;
  flashcardsCount?: number;
  hasReportedQuestions: boolean;
  reportedQuestionIds: string[];
  materialization?: QuestionBankMaterializationRun | null;
  subjects: Array<{
    id: string;
    name: string;
    topics: string[];
    topicRefs: Array<{
      id: string;
      name: string;
      definition: string | null;
      classificationGuidance: string | null;
      questionBankSelections: Array<{ examType: string; board: string | null; subtopic: string | null; subsubtopic: string | null; selectionKey: string }>;
      subtopics: Array<{
        id: string;
        name: string;
        position?: number;
        questionBankSelections: Array<{ examType: string; board: string | null; subtopic: string | null; subsubtopic: string | null; selectionKey: string }>;
        subsubtopics: Array<{
          id: string;
          name: string;
          position?: number;
          questionBankSelections: Array<{ examType: string; board: string | null; subtopic: string | null; subsubtopic: string | null; selectionKey: string }>;
        }>;
      }>;
    }>;
  }>;
};

const mapMonitor = (data: RawMonitor): TeacherMonitor => ({
  id: data.id,
  name: data.name,
  description: data.description || '',
  avatarUrl: data.avatarUrl || null,
  detailedDescription: data.detailedDescription || null,
  status: data.status,
  priceCents: data.priceCents ?? 0,
  annualPriceCents: data.annualPriceCents ?? null,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
  subjects: data.subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    topics: subject.topics.map((topic) => topic.name),
    topicRefs: subject.topics.map((topic) => ({
      ...topic,
      questionBankSelections: topic.questionBankSelections ?? [],
      subtopics: (topic.subtopics ?? []).map((subtopic) => ({
        ...subtopic,
        questionBankSelections: subtopic.questionBankSelections ?? [],
        subsubtopics: (subtopic.subsubtopics ?? []).map((subsubtopic) => ({
          ...subsubtopic,
          questionBankSelections: subsubtopic.questionBankSelections ?? [],
        })),
      })),
    })),
  })),
  knowledgeBaseCount: data.knowledgeBaseCount ?? 0,
  questionsCount: data.questionsCount ?? 0,
  flashcardsCount: data.flashcardsCount ?? 0,
  hasReportedQuestions: data.hasReportedQuestions ?? Boolean(data.questions?.length),
  reportedQuestionIds: data.reportedQuestionIds ?? data.questions?.map((question) => question.id) ?? [],
});

export const TeacherMonitorService = {
  async uploadDocument(input: {
    monitorId: string;
    subjectId: string;
    topicId?: string;
    tag: 'knowledge' | 'questions' | 'flashcards';
    file: File;
  }) {
    const formData = new FormData();
    formData.append('file', input.file);
    formData.append('subjectId', input.subjectId);
    formData.append('tag', input.tag);
    if (input.topicId) formData.append('topicId', input.topicId);

    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(input.monitorId)}/documents`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (response.status === 401) {
      throw new TeacherSessionError();
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Não foi possível enviar o documento.');
    }

    const { data } = await response.json();
    return data;
  },

  async createDraft(monitor: MonitorDraft): Promise<TeacherMonitor> {
    const payload = {
      name: monitor.name,
      description: monitor.description || undefined,
      subjects: monitor.subjects.map((subject) => ({
        name: subject.name,
        topics: subject.topics.map((topic) => ({
          name: topic.name,
          ...(topic.definition.trim() ? { definition: topic.definition.trim() } : {}),
        })),
      })),
      questionBankSelections: monitor.questionBankSelections ?? [],
      totalSelectedQuestions: monitor.totalSelectedQuestions ?? 0,
    };

    console.debug('[TeacherMonitorService] Enviando criação de monitor', {
      monitorName: payload.name,
      subjects: payload.subjects,
      questionBankSelections: payload.questionBankSelections,
    });

    const response = await fetch(`${getBackendUrl()}/api/v1/monitors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      throw new TeacherSessionError();
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Não foi possível salvar o Monitor de IA.');
    }

    const responseBody = await response.json();
    console.debug('[TeacherMonitorService] Criação de monitor concluída', {
      monitorId: responseBody.data?.id,
      status: responseBody.data?.status,
      materialization: responseBody.materialization ?? null,
    });
    const { data } = responseBody;
    return { ...mapMonitor(data), materialization: responseBody.materialization ?? null };
  },

  async getQuestionBankMaterialization(monitorId: string): Promise<QuestionBankMaterializationRun | null> {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/question-bank-materialization`, { credentials: 'include' });
    if (response.status === 401) throw new TeacherSessionError();
    if (response.status === 404) return null;
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Não foi possível consultar o progresso da importação.');
    }
    const { data } = await response.json();
    return data;
  },

  async retryQuestionBankMaterialization(monitorId: string): Promise<QuestionBankMaterializationRun> {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/question-bank-materialization/retry`, { method: 'POST', credentials: 'include' });
    if (response.status === 401) throw new TeacherSessionError();
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'Não foi possível repetir a importação.');
    return body.data;
  },

  async listMine(): Promise<TeacherMonitor[]> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(`${getBackendUrl()}/api/v1/monitors`, {
      credentials: 'include',
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error('A consulta dos Monitores de IA expirou.');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }

    if (response.status === 401) {
      throw new TeacherSessionError();
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Não foi possível carregar os Monitores de IA.');
    }

    const { data } = await response.json();
    return data.map(mapMonitor);
  },

  async getMine(monitorId: string): Promise<TeacherMonitor> {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}`, {
      credentials: 'include',
    });

    if (response.status === 401) {
      throw new TeacherSessionError();
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Não foi possível carregar o Monitor de IA.');
    }

    const { data } = await response.json();
    return mapMonitor(data);
  },

  async listQuestions(monitorId: string) {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/questions`, {
      credentials: 'include',
    });
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) throw new Error('Não foi possível buscar as questões.');
    const { data } = await response.json();
    return data;
  },

  async listFlashcards(monitorId: string) {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/flashcards`, {
      credentials: 'include',
    });
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) throw new Error('Não foi possível buscar os flashcards.');
    const { data } = await response.json();
    return data;
  },

  async listDocuments(monitorId: string) {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/documents`, {
      credentials: 'include',
    });
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) throw new Error('Não foi possível buscar os documentos.');
    const { data } = await response.json();
    return data;
  },

  async createQuestion(
    monitorId: string,
    payload: {
      status?: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW';
      subjectId?: string;
      primaryTopicId?: string;
      text: string;
      correctAnswer?: string;
      explanation?: string;
      alternatives?: Array<{ label: string; text: string }>;
    }
  ) {
    const response = await fetch(
      `${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/questions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      }
    );
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao criar a questão.');
    }
    const { data } = await response.json();
    return data;
  },

  async reviewQuestion(
    monitorId: string,
    questionId: string,
    payload: {
      status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW';
      subjectId?: string;
      primaryTopicId?: string;
      text?: string;
      correctAnswer?: string;
      explanation?: string;
      alternatives?: Array<{ label: string; text: string }>;
    }
  ) {
    const response = await fetch(
      `${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/questions/${encodeURIComponent(questionId)}/review`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      }
    );
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao atualizar a revisão da questão.');
    }
    const { data } = await response.json();
    return data;
  },

  async reviewFlashcard(
    monitorId: string,
    flashcardId: string,
    payload: { status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW'; front?: string; back?: string }
  ) {
    const response = await fetch(
      `${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/flashcards/${encodeURIComponent(flashcardId)}/review`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      }
    );
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao atualizar a revisão do flashcard.');
    }
    const { data } = await response.json();
    return data;
  },

  async addSubject(monitorId: string, name: string, topics: string[] = [], examProfiles: Array<{ subject: string; examType: string; board?: string | null }> = []): Promise<TeacherMonitor> {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, topics, examProfiles }),
    });
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao adicionar matéria.');
    }
    const { data } = await response.json();
    return mapMonitor(data);
  },

  async addSubjectsFromDraft(monitorId: string, draft: MonitorDraft): Promise<TeacherMonitor> {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/subjects/from-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: draft.name, description: draft.description, subjects: draft.subjects, questionBankSelections: draft.questionBankSelections ?? [] }),
    });
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao adicionar matérias ao monitor.');
    }
    const { data } = await response.json();
    return mapMonitor(data);
  },

  async deleteSubject(monitorId: string, subjectId: string): Promise<TeacherMonitor> {
    const response = await fetch(
      `${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/subjects/${encodeURIComponent(subjectId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao remover matéria.');
    }
    const { data } = await response.json();
    return mapMonitor(data);
  },

  async addTopic(monitorId: string, subjectId: string, name: string, definition?: string): Promise<TeacherMonitor> {
    const response = await fetch(
      `${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/subjects/${encodeURIComponent(subjectId)}/topics`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, ...(definition?.trim() ? { definition: definition.trim() } : {}) }),
      }
    );
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao adicionar tópico.');
    }
    const { data } = await response.json();
    return mapMonitor(data);
  },

  async deleteTopic(monitorId: string, subjectId: string, topicId: string): Promise<TeacherMonitor> {
    const response = await fetch(
      `${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}/subjects/${encodeURIComponent(subjectId)}/topics/${encodeURIComponent(topicId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao remover tópico.');
    }
    const { data } = await response.json();
    return mapMonitor(data);
  },

  async update(
    monitorId: string,
    payload: {
      name?: string;
      description?: string | null;
      avatarUrl?: string | null;
      detailedDescription?: string | null;
      status?: 'DRAFT' | 'READY_TO_PUBLISH' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED';
    }
  ): Promise<TeacherMonitor> {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/${encodeURIComponent(monitorId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao atualizar informações do monitor.');
    }
    const { data } = await response.json();
    return mapMonitor(data);
  },

  async getQuestionBankCatalog(): Promise<{
    totalQuestions: number;
    examProfiles: ExamProfile[];
    subjects: QuestionBankSubject[];
  }> {
    const response = await fetch(`${getBackendUrl()}/api/v1/monitors/question-bank-catalog`, {
      method: 'GET',
      credentials: 'include',
    });
    if (response.status === 401) throw new TeacherSessionError();
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Falha ao obter catálogo do banco de questões.');
    }
    const { data } = await response.json();
    return data;
  },
};

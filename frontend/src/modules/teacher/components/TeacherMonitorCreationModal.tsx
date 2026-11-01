'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileCheck2,
  Filter,
  FolderTree,
  GraduationCap,
  Layers3,
  Lightbulb,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { TeacherMonitorService, type TeacherMonitor } from '../services/TeacherMonitorService';
import { TeacherSessionError } from '../services/TeacherSessionError';
import {
  buildQuestionBankSelections,
  filterQuestionBankCatalogByProfiles,
  getQuestionCountForProfiles,
  type ExamProfile,
  type QuestionBankSelectionDraft,
  type QuestionBankSubject,
  type QuestionBankSubtopic,
  type QuestionBankTopic,
} from './question-bank-catalog';

type ContentSource = 'MANUAL' | 'QUESTION_BANK' | 'MIXED';

type TopicDraft = {
  name: string;
  definition: string;
  source?: Exclude<ContentSource, 'MIXED'>;
};

type SubjectDraft = {
  id: string;
  name: string;
  source?: ContentSource;
  topics: TopicDraft[];
};

export type MonitorDraft = {
  name: string;
  description: string;
  subjects: Array<{ id?: string; name: string; topics: TopicDraft[] }>;
  questionBankSelections?: QuestionBankSelectionDraft[];
  totalSelectedQuestions?: number;
};

interface TeacherMonitorCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (monitor: MonitorDraft) => Promise<void>;
  mode?: 'create' | 'edit-monitor';
  existingMonitor?: TeacherMonitor;
}

// 5 Etapas Oficiais por Fases
const steps = [
  'Monitor de IA',
  'Perfis & Bancas',
  'Banco de Questões',
  'Matérias & Tópicos',
  'Revisão Final',
];

// Banco de Questões Integrado: Matérias → Tópicos → Subtópicos → Subsubtópicos
const normalizeDraftName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

// Helpers para navegação na árvore de 4 níveis
export const getAllSubjectLeafIds = (subject: QuestionBankSubject): string[] => {
  const ids: string[] = [];
  if (!subject?.topics) return ids;
  for (const topic of subject.topics) {
    if (!topic.subtopics) continue;
    for (const subtopic of topic.subtopics) {
      if (subtopic.subsubtopics && subtopic.subsubtopics.length > 0) {
        for (const sst of subtopic.subsubtopics) {
          ids.push(sst.id);
        }
      } else {
        ids.push(subtopic.id);
      }
    }
  }
  return ids;
};

export const getAllTopicLeafIds = (topic: QuestionBankTopic): string[] => {
  const ids: string[] = [];
  if (!topic?.subtopics) return ids;
  for (const subtopic of topic.subtopics) {
    if (subtopic.subsubtopics && subtopic.subsubtopics.length > 0) {
      for (const sst of subtopic.subsubtopics) {
        ids.push(sst.id);
      }
    } else {
      ids.push(subtopic.id);
    }
  }
  return ids;
};

export const getAllSubtopicLeafIds = (subtopic: QuestionBankSubtopic): string[] => {
  if (subtopic?.subsubtopics && subtopic.subsubtopics.length > 0) {
    return subtopic.subsubtopics.map((sst) => sst.id);
  }
  return subtopic ? [subtopic.id] : [];
};

const INITIAL_QUESTION_BANK_CATALOG: QuestionBankSubject[] = [];

export const TeacherMonitorCreationModal: React.FC<TeacherMonitorCreationModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  mode = 'create',
  existingMonitor,
}) => {
  const router = useRouter();
  const isEditMonitorMode = mode === 'edit-monitor';
  const [step, setStep] = useState(isEditMonitorMode ? 2 : 1);
  const [name, setName] = useState(existingMonitor?.name ?? '');
  const [description, setDescription] = useState(existingMonitor?.description ?? '');
  const [subjects, setSubjects] = useState<SubjectDraft[]>([]);
  const [subjectName, setSubjectName] = useState('');
  const [topicName, setTopicName] = useState('');
  const [topicDefinition, setTopicDefinition] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasReviewedRecommendations, setHasReviewedRecommendations] = useState(false);
  const [isCreationStarted, setIsCreationStarted] = useState(isEditMonitorMode);
  const [isSaving, setIsSaving] = useState(false);

  // Estados da Etapa 2: Perfis de Prova & Bancas
  const [selectedExamProfiles, setSelectedExamProfiles] = useState<string[]>([]);
  const [examCategoryFilter, setExamCategoryFilter] = useState<string>('Todas');
  const [examSearch, setExamSearch] = useState<string>('');

  // Estados da Etapa 3: Seleção do Banco de Questões (Master-Detail)
  const [activeCatalogSubjectId, setActiveCatalogSubjectId] = useState<string>('matematica');
  const [subjectCategoryFilter, setSubjectCategoryFilter] = useState<string>('Todas');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [selectedCatalogSubjects, setSelectedCatalogSubjects] = useState<string[]>([]);
  const [selectedCatalogSubtopics, setSelectedCatalogSubtopics] = useState<Record<string, string[]>>({});
  const [expandedCatalogTopics, setExpandedCatalogTopics] = useState<Record<string, boolean>>({});
  const [expandedCatalogSubtopics, setExpandedCatalogSubtopics] = useState<Record<string, boolean>>({});

  // Estados para botões expansíveis e adições na Fase 4 (Árvore interativa no corpo principal)
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [expandedSubtopics, setExpandedSubtopics] = useState<Record<string, boolean>>({});

  const [addingTopicSubjectId, setAddingTopicSubjectId] = useState<string | null>(null);
  const [newTopicInput, setNewTopicInput] = useState<string>('');

  const [addingSubtopicKey, setAddingSubtopicKey] = useState<string | null>(null); // `${subjectId}::${topicName}`
  const [newSubtopicInput, setNewSubtopicInput] = useState<string>('');

  const [addingSubsubtopicKey, setAddingSubsubtopicKey] = useState<string | null>(null); // `${subjectId}::${topicName}::${subtopicName}`
  const [newSubsubtopicInput, setNewSubsubtopicInput] = useState<string>('');

  // Catálogo Real vindo da tabela question_bank_items
  const [catalogSubjects, setCatalogSubjects] = useState<QuestionBankSubject[]>(INITIAL_QUESTION_BANK_CATALOG);
  const [examProfilesList, setExamProfilesList] = useState<ExamProfile[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(false);

  // Carrega os dados reais da tabela question_bank_items ao abrir o modal
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingCatalog(true);
    setCatalogLoadError(null);

    TeacherMonitorService.getQuestionBankCatalog()
      .then((data) => {
        if (!isMounted) return;
        const subjects = data?.subjects || [];
        const profiles = data?.examProfiles || [];
        setCatalogSubjects(subjects);
        setExamProfilesList(profiles);

        if (isEditMonitorMode && existingMonitor) {
          setName(existingMonitor.name);
          setDescription(existingMonitor.description);

          const selectedProfileIds = new Set<string>();
          const selectedLeaves: Record<string, string[]> = {};
          const hydratedSubjects = existingMonitor.subjects.map((monitorSubject) => {
            const topics: TopicDraft[] = [];
            const catalogSubject = subjects.find((candidate) => normalizeDraftName(candidate.name) === normalizeDraftName(monitorSubject.name));

            for (const topic of monitorSubject.topicRefs) {
              const selections = topic.questionBankSelections ?? [];
              for (const selection of selections) {
                const profile = profiles.find((candidate) =>
                  (candidate.examType || candidate.name).toUpperCase() === selection.examType.toUpperCase()
                  && (candidate.board ?? null) === (selection.board ?? null)
                );
                if (profile) selectedProfileIds.add(profile.id);

                const catalogTopic = catalogSubject?.topics.find((candidate) => normalizeDraftName(candidate.name) === normalizeDraftName(topic.name));
                if (!catalogSubject || !catalogTopic) continue;
                const current = new Set(selectedLeaves[catalogSubject.id] ?? []);
                if (!selection.subtopic) {
                  getAllTopicLeafIds(catalogTopic).forEach((id) => current.add(id));
                } else {
                  const catalogSubtopic = catalogTopic.subtopics.find((candidate) => normalizeDraftName(candidate.name) === normalizeDraftName(selection.subtopic || ''));
                  if (catalogSubtopic) {
                    const catalogLeaf = selection.subsubtopic
                      ? catalogSubtopic.subsubtopics.find((candidate) => normalizeDraftName(candidate.name) === normalizeDraftName(selection.subsubtopic || ''))
                      : null;
                    const leafId = catalogLeaf?.id ?? (!selection.subsubtopic ? catalogSubtopic.id : null);
                    if (leafId) current.add(leafId);
                  }
                }
                selectedLeaves[catalogSubject.id] = Array.from(current);
              }

              const hasSelection = (subtopic?: string | null, subsubtopic?: string | null) => selections.some((selection) =>
                normalizeDraftName(selection.subtopic ?? '') === normalizeDraftName(subtopic ?? '')
                && normalizeDraftName(selection.subsubtopic ?? '') === normalizeDraftName(subsubtopic ?? '')
              );
              topics.push({ name: topic.name, definition: topic.definition ?? '', source: hasSelection() ? 'QUESTION_BANK' : 'MANUAL' });
              for (const subtopic of topic.subtopics) {
                if (subtopic.subsubtopics.length === 0) {
                  topics.push({ name: `${topic.name} > ${subtopic.name}`, definition: '', source: hasSelection(subtopic.name) ? 'QUESTION_BANK' : 'MANUAL' });
                } else {
                  for (const subsubtopic of subtopic.subsubtopics) {
                    topics.push({ name: `${topic.name} > ${subtopic.name} > ${subsubtopic.name}`, definition: '', source: hasSelection(subtopic.name, subsubtopic.name) ? 'QUESTION_BANK' : 'MANUAL' });
                  }
                }
              }
            }

            return { id: monitorSubject.id, name: monitorSubject.name, source: 'MIXED' as const, topics };
          });

          setSubjects(hydratedSubjects);
          setSelectedExamProfiles(Array.from(selectedProfileIds));
          setSelectedCatalogSubtopics(selectedLeaves);
          setSelectedCatalogSubjects(Object.keys(selectedLeaves).filter((id) => selectedLeaves[id]?.length));
          const firstSelectedCatalogSubject = Object.keys(selectedLeaves).find((id) => selectedLeaves[id]?.length);
          setActiveCatalogSubjectId(firstSelectedCatalogSubject ?? subjects[0]?.id ?? 'matematica');
          setExpandedSubjects(Object.fromEntries(hydratedSubjects.map((subject) => [subject.id, true])));
        } else if (subjects[0]?.id) {
          setActiveCatalogSubjectId(subjects[0].id);
        }
      })
      .catch((err) => {
        if (err instanceof TeacherSessionError) {
          router.replace('/?login=true&perfil=professor&session=expired');
          return;
        }
        console.warn('Não foi possível carregar o catálogo do banco de questões:', err);
        setCatalogLoadError('Não foi possível carregar as bancas e matérias do banco. Tente novamente mais tarde.');
        setCatalogSubjects([]);
        setExamProfilesList([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingCatalog(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, router, isEditMonitorMode, existingMonitor]);

  useEffect(() => {
    if (subjectCategoryFilter !== 'Todas' && !selectedExamProfiles.includes(subjectCategoryFilter)) {
      setSubjectCategoryFilter('Todas');
    }
  }, [selectedExamProfiles, subjectCategoryFilter]);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === selectedSubjectId) ?? subjects[0] ?? null,
    [selectedSubjectId, subjects]
  );

  const totalTopics = useMemo(
    () => subjects.reduce((sum, subject) => sum + subject.topics.length, 0),
    [subjects]
  );

  // Categorias disponíveis calculadas dinamicamente a partir dos perfis e matérias reais
  const availableExamCategories = useMemo(() => {
    const cats = Array.from(new Set(examProfilesList.map((p) => p.category).filter(Boolean)));
    return cats.length > 1 ? ['Todas', ...cats] : [];
  }, [examProfilesList]);

  // Opções do filtro da Etapa 3 baseadas exclusivamente nos perfis selecionados na Etapa 2
  const availableProfileFilterOptions = useMemo(() => {
    const list = selectedExamProfiles.map((pId) => {
      const profile = examProfilesList.find((p) => p.id === pId);
      return {
        id: pId,
        label: profile?.name || pId.toUpperCase(),
      };
    });
    return [{ id: 'Todas', label: 'Todas' }, ...list];
  }, [selectedExamProfiles, examProfilesList]);

  const resetAndClose = () => {
    setStep(isEditMonitorMode ? 2 : 1);
    setName(isEditMonitorMode ? existingMonitor?.name ?? '' : '');
    setDescription(isEditMonitorMode ? existingMonitor?.description ?? '' : '');
    setSubjects([]);
    setSubjectName('');
    setTopicName('');
    setTopicDefinition('');
    setSelectedSubjectId(null);
    setSelectedExamProfiles([]);
    setExamCategoryFilter('Todas');
    setExamSearch('');
    setActiveCatalogSubjectId('matematica');
    setSubjectCategoryFilter('Todas');
    setSelectedCatalogSubjects([]);
    setSelectedCatalogSubtopics({});
    setExpandedCatalogTopics({});
    setExpandedCatalogSubtopics({});
    setCatalogSearch('');
    setExpandedSubjects({});
    setExpandedTopics({});
    setExpandedSubtopics({});
    setAddingTopicSubjectId(null);
    setNewTopicInput('');
    setAddingSubtopicKey(null);
    setNewSubtopicInput('');
    setAddingSubsubtopicKey(null);
    setNewSubsubtopicInput('');
    setError(null);
    setHasReviewedRecommendations(false);
    setIsCreationStarted(isEditMonitorMode);
    onClose();
  };

  // Toggle Perfil de Prova / Banca
  const toggleExamProfile = (profileId: string) => {
    setSelectedExamProfiles((prev) => {
      if (prev.includes(profileId)) {
        return prev.filter((id) => id !== profileId);
      }
      return [...prev, profileId];
    });
  };

  // Toggle de seleção de Matéria Inteira (e todos os seus nós folha)
  const toggleCatalogSubject = (subject: QuestionBankSubject) => {
    const allLeafIds = getAllSubjectLeafIds(subject);
    setSelectedCatalogSubtopics((prev) => {
      const currentList = prev[subject.id] || [];
      const allChecked = allLeafIds.length > 0 && allLeafIds.every((id) => currentList.includes(id));
      const copy = { ...prev };
      if (allChecked) {
        delete copy[subject.id];
        setSelectedCatalogSubjects((subjList) => subjList.filter((id) => id !== subject.id));
      } else {
        copy[subject.id] = allLeafIds;
        if (!selectedCatalogSubjects.includes(subject.id)) {
          setSelectedCatalogSubjects((subjList) => [...subjList, subject.id]);
        }
      }
      return copy;
    });
  };

  // Toggle de seleção de Tópico Inteiro
  const toggleCatalogTopic = (subjectId: string, topic: QuestionBankTopic) => {
    const leafIds = getAllTopicLeafIds(topic);
    setSelectedCatalogSubtopics((prev) => {
      const currentList = prev[subjectId] || [];
      const allChecked = leafIds.length > 0 && leafIds.every((id) => currentList.includes(id));
      let updatedList: string[];
      if (allChecked) {
        updatedList = currentList.filter((id) => !leafIds.includes(id));
      } else {
        const set = new Set([...currentList, ...leafIds]);
        updatedList = Array.from(set);
      }

      if (updatedList.length > 0 && !selectedCatalogSubjects.includes(subjectId)) {
        setSelectedCatalogSubjects((subjList) => [...subjList, subjectId]);
      } else if (updatedList.length === 0) {
        setSelectedCatalogSubjects((subjList) => subjList.filter((id) => id !== subjectId));
      }

      return {
        ...prev,
        [subjectId]: updatedList,
      };
    });
  };

  // Toggle de seleção de Subtópico (marca/desmarca seus subsubtópicos ou ele próprio)
  const toggleCatalogSubtopic = (subjectId: string, subtopic: QuestionBankSubtopic) => {
    const leafIds = getAllSubtopicLeafIds(subtopic);
    setSelectedCatalogSubtopics((prev) => {
      const currentList = prev[subjectId] || [];
      const allChecked = leafIds.length > 0 && leafIds.every((id) => currentList.includes(id));
      let updatedList: string[];
      if (allChecked) {
        updatedList = currentList.filter((id) => !leafIds.includes(id));
      } else {
        const set = new Set([...currentList, ...leafIds]);
        updatedList = Array.from(set);
      }

      if (updatedList.length > 0 && !selectedCatalogSubjects.includes(subjectId)) {
        setSelectedCatalogSubjects((subjList) => [...subjList, subjectId]);
      } else if (updatedList.length === 0) {
        setSelectedCatalogSubjects((subjList) => subjList.filter((id) => id !== subjectId));
      }

      return {
        ...prev,
        [subjectId]: updatedList,
      };
    });
  };

  // Toggle de nó folha específico (subsubtópico ou subtópico direto)
  const toggleCatalogLeaf = (subjectId: string, leafId: string) => {
    setSelectedCatalogSubtopics((prev) => {
      const currentList = prev[subjectId] || [];
      const updatedList = currentList.includes(leafId)
        ? currentList.filter((id) => id !== leafId)
        : [...currentList, leafId];

      if (updatedList.length > 0 && !selectedCatalogSubjects.includes(subjectId)) {
        setSelectedCatalogSubjects((subjList) => [...subjList, subjectId]);
      } else if (updatedList.length === 0) {
        setSelectedCatalogSubjects((subjList) => subjList.filter((id) => id !== subjectId));
      }

      return {
        ...prev,
        [subjectId]: updatedList,
      };
    });
  };

  // Sincroniza as seleções do Banco de Questões para o estado `subjects` do Monitor
  const syncCatalogToSubjects = () => {
    const newSubjects: SubjectDraft[] = [];

    const selectedProfileCatalog = filterQuestionBankCatalogByProfiles(catalogSubjects, selectedExamProfiles);
    for (const catalogSubject of selectedProfileCatalog) {
      const selectedIds = selectedCatalogSubtopics[catalogSubject.id] || [];
      if (selectedIds.length === 0 && !selectedCatalogSubjects.includes(catalogSubject.id)) {
        continue;
      }

      const topics: TopicDraft[] = [];

      if (catalogSubject.topics) {
        for (const topic of catalogSubject.topics) {
          if (!topic.subtopics) continue;
          for (const subtopic of topic.subtopics) {
            if (subtopic.subsubtopics && subtopic.subsubtopics.length > 0) {
              for (const sst of subtopic.subsubtopics) {
                if (selectedIds.includes(sst.id)) {
                  topics.push({
                    name: `${topic.name} > ${subtopic.name} > ${sst.name}`,
                    definition: `${catalogSubject.name} • ${topic.name} > ${subtopic.name} > ${sst.name} (${selectedExamProfiles.map((p) => p.toUpperCase()).join(', ') || 'Geral'})`,
                    source: 'QUESTION_BANK',
                  });
                }
              }
            } else {
              if (selectedIds.includes(subtopic.id)) {
                topics.push({
                  name: `${topic.name} > ${subtopic.name}`,
                  definition: `${catalogSubject.name} • ${topic.name} > ${subtopic.name} (${selectedExamProfiles.map((p) => p.toUpperCase()).join(', ') || 'Geral'})`,
                  source: 'QUESTION_BANK',
                });
              }
            }
          }
        }
      }

      if (topics.length > 0) {
        newSubjects.push({
          id: `catalog-subject-${catalogSubject.id}`,
          name: catalogSubject.name,
          source: 'QUESTION_BANK',
          topics,
        });
      }
    }

    // Em edição, mantém o ID de cada matéria existente e preserva os tópicos manuais.
    const previousSubjects = isEditMonitorMode ? subjects : subjects.filter((subject) => subject.source !== 'QUESTION_BANK');
    for (const existing of previousSubjects) {
      const matchingSubject = newSubjects.find(
        (subject) => normalizeDraftName(subject.name) === normalizeDraftName(existing.name),
      );

      if (!matchingSubject) {
        const manualTopics = existing.topics.filter((topic) => topic.source !== 'QUESTION_BANK');
        if (manualTopics.length > 0) newSubjects.push({ ...existing, topics: manualTopics });
        continue;
      }

      const bankTopicNames = new Set(matchingSubject.topics.map((topic) => normalizeDraftName(topic.name)));
      const manualTopics = existing.topics.filter((topic) => topic.source !== 'QUESTION_BANK' && !bankTopicNames.has(normalizeDraftName(topic.name)));
      if (isEditMonitorMode) matchingSubject.id = existing.id;
      matchingSubject.topics = [...matchingSubject.topics, ...manualTopics];
      matchingSubject.source = manualTopics.length > 0 ? 'MIXED' : 'QUESTION_BANK';
    }

    setSubjects(newSubjects);
    if (newSubjects.length > 0) {
      setSelectedSubjectId(newSubjects[0].id);
    }
  };

  const addSubject = () => {
    const normalizedName = subjectName.trim();
    if (!normalizedName) return;
    if (subjects.some((subject) => subject.name.toLowerCase() === normalizedName.toLowerCase())) {
      setError('Essa matéria já foi adicionada.');
      return;
    }

    const subject: SubjectDraft = { id: `subject-${Date.now()}`, name: normalizedName, source: 'MANUAL', topics: [] };
    setSubjects((current) => [...current, subject]);
    setSelectedSubjectId(subject.id);
    setSubjectName('');
    setError(null);
  };

  const removeSubject = (subjectId: string) => {
    if (subjects.length <= 1) {
      setError('O monitor precisa manter pelo menos uma matéria.');
      return;
    }
    setSubjects((current) => current.filter((subject) => subject.id !== subjectId));
    if (selectedSubjectId === subjectId) setSelectedSubjectId(null);
  };

  const addTopic = () => {
    const normalizedName = topicName.trim();
    if (!selectedSubject || !normalizedName) return;
    if (selectedSubject.topics.some((topic) => topic.name.toLowerCase() === normalizedName.toLowerCase())) {
      setError('Esse detalhamento já foi adicionado a esta matéria.');
      return;
    }

    setSubjects((current) =>
      current.map((subject) =>
        subject.id === selectedSubject.id
          ? {
              ...subject,
              source: subject.source === 'QUESTION_BANK' ? 'MIXED' : subject.source,
              topics: [...subject.topics, { name: normalizedName, definition: topicDefinition.trim(), source: 'MANUAL' }],
            }
          : subject
      )
    );
    setTopicName('');
    setTopicDefinition('');
    setError(null);
  };

  const removeTopic = (subjectId: string, topicNameToRemove: string) => {
    setSubjects((current) =>
      current.map((subject) =>
        subject.id === subjectId
          ? { ...subject, topics: subject.topics.filter((topic) => topic.name !== topicNameToRemove) }
          : subject
      )
    );
  };

  // Parser que organiza subject.topics na hierarquia completa de 4 níveis (Tópico -> Subtópico -> Subsubtópico)
  const parseSubjectHierarchy = (subject: SubjectDraft) => {
    type ParsedSubsubtopic = { id: string; name: string; rawName: string };
    type ParsedSubtopic = { id: string; name: string; rawName: string; subsubtopics: ParsedSubsubtopic[] };
    type ParsedTopic = { id: string; name: string; rawName: string; subtopics: ParsedSubtopic[] };

    const topicMap = new Map<string, {
      id: string;
      name: string;
      subtopicMap: Map<string, {
        id: string;
        name: string;
        subsubtopics: ParsedSubsubtopic[];
      }>;
    }>();

    for (const topicItem of subject.topics) {
      const rawName = topicItem.name.trim();
      const separator = rawName.includes(' > ') ? ' > ' : rawName.includes(': ') ? ': ' : null;

      if (separator) {
        const parts = rawName.split(separator).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 3) {
          const [tName, stName, ...rest] = parts;
          const sstName = rest.join(' - ');

          if (!topicMap.has(tName)) {
            topicMap.set(tName, { id: `${subject.id}-${tName}`, name: tName, subtopicMap: new Map() });
          }
          const tObj = topicMap.get(tName)!;

          if (!tObj.subtopicMap.has(stName)) {
            tObj.subtopicMap.set(stName, { id: `${tObj.id}-${stName}`, name: stName, subsubtopics: [] });
          }
          const stObj = tObj.subtopicMap.get(stName)!;

          if (!stObj.subsubtopics.some((s) => s.name === sstName)) {
            stObj.subsubtopics.push({ id: `${stObj.id}-${sstName}`, name: sstName, rawName });
          }
        } else if (parts.length === 2) {
          const [tName, stName] = parts;

          if (!topicMap.has(tName)) {
            topicMap.set(tName, { id: `${subject.id}-${tName}`, name: tName, subtopicMap: new Map() });
          }
          const tObj = topicMap.get(tName)!;

          if (!tObj.subtopicMap.has(stName)) {
            tObj.subtopicMap.set(stName, { id: `${tObj.id}-${stName}`, name: stName, subsubtopics: [] });
          }
        } else {
          const tName = parts[0] || rawName;
          if (!topicMap.has(tName)) {
            topicMap.set(tName, { id: `${subject.id}-${tName}`, name: tName, subtopicMap: new Map() });
          }
        }
      } else {
        if (!topicMap.has(rawName)) {
          topicMap.set(rawName, { id: `${subject.id}-${rawName}`, name: rawName, subtopicMap: new Map() });
        }
      }
    }

    return Array.from(topicMap.values()).map((t) => ({
      id: t.id,
      name: t.name,
      rawName: t.name,
      subtopics: Array.from(t.subtopicMap.values()).map((st) => ({
        id: st.id,
        name: st.name,
        rawName: st.name,
        subsubtopics: st.subsubtopics,
      })),
    }));
  };

  const toggleSubjectExpanded = (subjectId: string) => {
    setExpandedSubjects((prev) => ({
      ...prev,
      [subjectId]: !prev[subjectId],
    }));
  };

  const toggleTopicExpanded = (key: string) => {
    setExpandedTopics((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleSubtopicExpanded = (key: string) => {
    setExpandedSubtopics((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAllForSubject = (subject: SubjectDraft) => {
    setExpandedSubjects((prev) => ({ ...prev, [subject.id]: true }));
    const parsed = parseSubjectHierarchy(subject);
    const newTop = { ...expandedTopics };
    const newSub = { ...expandedSubtopics };
    for (const t of parsed) {
      newTop[`${subject.id}::${t.name}`] = true;
      for (const st of t.subtopics) {
        newSub[`${subject.id}::${t.name}::${st.name}`] = true;
      }
    }
    setExpandedTopics(newTop);
    setExpandedSubtopics(newSub);
  };

  const collapseAllForSubject = (subject: SubjectDraft) => {
    setExpandedSubjects((prev) => ({ ...prev, [subject.id]: false }));
    const parsed = parseSubjectHierarchy(subject);
    const newTop = { ...expandedTopics };
    const newSub = { ...expandedSubtopics };
    for (const t of parsed) {
      newTop[`${subject.id}::${t.name}`] = false;
      for (const st of t.subtopics) {
        newSub[`${subject.id}::${t.name}::${st.name}`] = false;
      }
    }
    setExpandedTopics(newTop);
    setExpandedSubtopics(newSub);
  };

  const toggleCatalogTopicExpanded = (key: string) => {
    setExpandedCatalogTopics((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleCatalogSubtopicExpanded = (key: string) => {
    setExpandedCatalogSubtopics((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAllCatalogForSubject = (subj: QuestionBankSubject) => {
    const newTop = { ...expandedCatalogTopics };
    const newSub = { ...expandedCatalogSubtopics };
    for (const t of subj.topics || []) {
      newTop[`${subj.id}::${t.id}`] = true;
      for (const st of t.subtopics || []) {
        if (st.subsubtopics && st.subsubtopics.length > 0) {
          newSub[`${subj.id}::${t.id}::${st.id}`] = true;
        }
      }
    }
    setExpandedCatalogTopics(newTop);
    setExpandedCatalogSubtopics(newSub);
  };

  const collapseAllCatalogForSubject = (subj: QuestionBankSubject) => {
    const newTop = { ...expandedCatalogTopics };
    const newSub = { ...expandedCatalogSubtopics };
    for (const t of subj.topics || []) {
      newTop[`${subj.id}::${t.id}`] = false;
      for (const st of t.subtopics || []) {
        if (st.subsubtopics && st.subsubtopics.length > 0) {
          newSub[`${subj.id}::${t.id}::${st.id}`] = false;
        }
      }
    }
    setExpandedCatalogTopics(newTop);
    setExpandedCatalogSubtopics(newSub);
  };

  const handleAddTopicInline = (subjectId: string) => {
    const trimmed = newTopicInput.trim();
    if (!trimmed) return;
    const targetSubject = subjects.find((s) => s.id === subjectId);
    if (!targetSubject) return;

    const exists = targetSubject.topics.some((t) => {
      const rootName = t.name.split(/ > |: /)[0]?.trim().toLowerCase();
      return rootName === trimmed.toLowerCase();
    });

    if (exists) {
      setError(`O tópico "${trimmed}" já existe nesta matéria.`);
      return;
    }

    setSubjects((current) =>
      current.map((s) =>
        s.id === subjectId
          ? {
              ...s,
              source: s.source === 'QUESTION_BANK' ? 'MIXED' : s.source,
              topics: [...s.topics, { name: trimmed, definition: `${s.name} • ${trimmed}`, source: 'MANUAL' }],
            }
          : s
      )
    );

    setNewTopicInput('');
    setAddingTopicSubjectId(null);
    setError(null);
    setExpandedSubjects((prev) => ({ ...prev, [subjectId]: true }));
    setExpandedTopics((prev) => ({ ...prev, [`${subjectId}::${trimmed}`]: true }));
  };

  const handleAddSubtopicInline = (subjectId: string, topicName: string) => {
    const trimmed = newSubtopicInput.trim();
    if (!trimmed) return;
    const targetSubject = subjects.find((s) => s.id === subjectId);
    if (!targetSubject) return;

    const newFullName = `${topicName} > ${trimmed}`;
    const exists = targetSubject.topics.some((t) => {
      const parts = t.name.split(/ > |: /).map((p) => p.trim());
      return parts[0]?.toLowerCase() === topicName.toLowerCase() && parts[1]?.toLowerCase() === trimmed.toLowerCase();
    });

    if (exists) {
      setError(`O subtópico "${trimmed}" já existe dentro de ${topicName}.`);
      return;
    }

    setSubjects((current) =>
      current.map((s) => {
        if (s.id !== subjectId) return s;
        const filtered = s.topics.filter((t) => t.name !== topicName);
        return {
          ...s,
          source: s.source === 'QUESTION_BANK' ? 'MIXED' : s.source,
          topics: [...filtered, { name: newFullName, definition: `${s.name} • ${newFullName}`, source: 'MANUAL' }],
        };
      })
    );

    setNewSubtopicInput('');
    setAddingSubtopicKey(null);
    setError(null);
    setExpandedTopics((prev) => ({ ...prev, [`${subjectId}::${topicName}`]: true }));
    setExpandedSubtopics((prev) => ({ ...prev, [`${subjectId}::${topicName}::${trimmed}`]: true }));
  };

  const handleAddSubsubtopicInline = (subjectId: string, topicName: string, subtopicName: string) => {
    const trimmed = newSubsubtopicInput.trim();
    if (!trimmed) return;
    const targetSubject = subjects.find((s) => s.id === subjectId);
    if (!targetSubject) return;

    const newFullName = `${topicName} > ${subtopicName} > ${trimmed}`;
    const exists = targetSubject.topics.some((t) => {
      const parts = t.name.split(/ > |: /).map((p) => p.trim());
      return (
        parts[0]?.toLowerCase() === topicName.toLowerCase() &&
        parts[1]?.toLowerCase() === subtopicName.toLowerCase() &&
        parts[2]?.toLowerCase() === trimmed.toLowerCase()
      );
    });

    if (exists) {
      setError(`O subsubtópico "${trimmed}" já existe dentro de ${subtopicName}.`);
      return;
    }

    setSubjects((current) =>
      current.map((s) => {
        if (s.id !== subjectId) return s;
        const parentName = `${topicName} > ${subtopicName}`;
        const filtered = s.topics.filter((t) => t.name !== parentName && t.name !== topicName);
        return {
          ...s,
          source: s.source === 'QUESTION_BANK' ? 'MIXED' : s.source,
          topics: [...filtered, { name: newFullName, definition: `${s.name} • ${newFullName}`, source: 'MANUAL' }],
        };
      })
    );

    setNewSubsubtopicInput('');
    setAddingSubsubtopicKey(null);
    setError(null);
    setExpandedSubtopics((prev) => ({ ...prev, [`${subjectId}::${topicName}::${subtopicName}`]: true }));
  };

  const handleRemoveNode = (
    subjectId: string,
    level: 'topic' | 'subtopic' | 'subsubtopic',
    path: { topicName: string; subtopicName?: string; subsubtopicName?: string }
  ) => {
    setSubjects((current) =>
      current.map((s) => {
        if (s.id !== subjectId) return s;

        let remaining = s.topics;
        if (level === 'subsubtopic' && path.subtopicName && path.subsubtopicName) {
          remaining = s.topics.filter((t) => {
            const parts = t.name.split(/ > |: /).map((p) => p.trim().toLowerCase());
            const match =
              parts[0] === path.topicName.toLowerCase() &&
              parts[1] === path.subtopicName!.toLowerCase() &&
              parts[2] === path.subsubtopicName!.toLowerCase();
            return !match;
          });
        } else if (level === 'subtopic' && path.subtopicName) {
          remaining = s.topics.filter((t) => {
            const parts = t.name.split(/ > |: /).map((p) => p.trim().toLowerCase());
            const match =
              parts[0] === path.topicName.toLowerCase() &&
              parts[1] === path.subtopicName!.toLowerCase();
            return !match;
          });
        } else if (level === 'topic') {
          remaining = s.topics.filter((t) => {
            const parts = t.name.split(/ > |: /).map((p) => p.trim().toLowerCase());
            const match = parts[0] === path.topicName.toLowerCase();
            return !match;
          });
        }

        return {
          ...s,
          topics: remaining,
        };
      })
    );
  };

  const continueStep = () => {
    setError(null);

    if (step === 1) {
      if (!name.trim()) {
        setError('Dê um nome para o seu Monitor de IA antes de continuar.');
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    if (step === 3) {
      if (selectedExamProfiles.length === 0 && (selectedCatalogSubjects.length > 0 || totalSelectedSubtopicsCount > 0)) {
        setError('Selecione pelo menos um perfil de prova ou banca para importar questões do acervo.');
        return;
      }
      // O acervo é opcional; quando usado, seus tópicos entram na árvore local.
      syncCatalogToSubjects();
      setStep(4);
      return;
    }

    if (step === 4) {
      if (subjects.length === 0) {
        setError('Adicione ou selecione pelo menos uma matéria para o monitor.');
        return;
      }
      setStep(5);
      return;
    }

    if (step === 5) {
      if (totalTopics === 0) {
        setError('Adicione pelo menos um detalhamento ou importe tópicos para o monitor.');
        return;
      }
      saveDraft();
    }
  };

  const saveDraft = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const questionBankSelections = buildQuestionBankSelections({
        catalogSubjects,
        selectedCatalogSubtopics,
        selectedExamProfiles,
        examProfilesList,
      });

      console.debug('[TeacherMonitorCreationModal] Rascunho pronto para envio', {
        name: name.trim(),
        subjectCount: subjects.length,
        topicCount: subjects.reduce((total, subject) => total + subject.topics.length, 0),
        subjects,
        questionBankSelections: questionBankSelections,
      });

      if (subjects.length === 0 || subjects.some((subject) => subject.topics.length === 0)) {
        setError('Adicione pelo menos um tópico em cada matéria antes de salvar o monitor.');
        return;
      }

      if (isEditMonitorMode && existingMonitor) {
        const remainingSubjectIds = new Set(subjects.map((subject) => subject.id));
        const removedSubject = existingMonitor.subjects.some((subject) => !remainingSubjectIds.has(subject.id));
        const remainingPaths = new Map(subjects.map((subject) => [subject.id, new Set(subject.topics.map((topic) => normalizeDraftName(topic.name)))]));
        const removedTopic = existingMonitor.subjects.some((subject) => subject.topicRefs.some((topic) => {
          const paths = remainingPaths.get(subject.id);
          const oldPaths = [topic.name, ...topic.subtopics.flatMap((subtopic) => subtopic.subsubtopics.length
            ? subtopic.subsubtopics.map((subsubtopic) => `${topic.name} > ${subtopic.name} > ${subsubtopic.name}`)
            : [`${topic.name} > ${subtopic.name}`])];
          return oldPaths.some((path) => paths && !paths.has(normalizeDraftName(path)));
        }));
        if ((removedSubject || removedTopic) && !window.confirm('Remover matérias ou tópicos também remove questões e flashcards associados. Deseja continuar?')) {
          setIsSaving(false);
          return;
        }
      }

      await onCreated({
        name: name.trim(),
        description: description.trim(),
        subjects: subjects.map((subject) => ({
          id: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subject.id) ? subject.id : undefined,
          name: subject.name,
          topics: subject.topics.map((topic) => ({
            name: topic.name,
            definition: topic.definition,
          })),
        })),
        questionBankSelections,
        totalSelectedQuestions: totalSelectedQuestionsCount,
      });
      resetAndClose();
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Não foi possível salvar o Monitor de IA.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeCatalogProfileIds = useMemo(
    () => subjectCategoryFilter === 'Todas' ? selectedExamProfiles : [subjectCategoryFilter],
    [selectedExamProfiles, subjectCategoryFilter]
  );
  const profileScopedCatalogSubjects = useMemo(
    () => filterQuestionBankCatalogByProfiles(catalogSubjects, activeCatalogProfileIds),
    [catalogSubjects, activeCatalogProfileIds]
  );

  // Contagem de nós folha selecionados que estão visíveis no filtro atual.
  const totalSelectedSubtopicsCount = useMemo(() => {
    const visibleLeafIds = new Set<string>();
    for (const subject of profileScopedCatalogSubjects) {
      for (const topic of subject.topics) {
        for (const subtopic of topic.subtopics) {
          const leaves = subtopic.subsubtopics?.length ? subtopic.subsubtopics : [subtopic];
          for (const leaf of leaves) visibleLeafIds.add(leaf.id);
        }
      }
    }
    return Object.values(selectedCatalogSubtopics).reduce(
      (count, ids) => count + ids.filter((id) => visibleLeafIds.has(id)).length,
      0
    );
  }, [profileScopedCatalogSubjects, selectedCatalogSubtopics]);

  // Calcula o número de questões selecionadas em uma matéria do catálogo de acordo com os nós marcados
  const getSubjectSelectedQuestionsCount = (catalogSubject: QuestionBankSubject) => {
    const selectedIds = selectedCatalogSubtopics[catalogSubject.id] || [];
    if (selectedIds.length === 0 || !catalogSubject.topics) return 0;
    let total = 0;
    for (const topic of catalogSubject.topics) {
      if (!topic.subtopics) continue;
      for (const subtopic of topic.subtopics) {
        if (subtopic.subsubtopics && subtopic.subsubtopics.length > 0) {
          for (const sst of subtopic.subsubtopics) {
            if (selectedIds.includes(sst.id)) {
              total += getQuestionCountForProfiles(sst, activeCatalogProfileIds);
            }
          }
        } else {
          if (selectedIds.includes(subtopic.id)) {
            total += getQuestionCountForProfiles(subtopic, activeCatalogProfileIds);
          }
        }
      }
    }
    return total;
  };

  const getTopicSelectedQuestionsCount = (subjectId: string, topic: QuestionBankTopic) => {
    const selectedIds = selectedCatalogSubtopics[subjectId] || [];
    if (selectedIds.length === 0 || !topic.subtopics) return 0;
    let total = 0;
    for (const subtopic of topic.subtopics) {
      if (subtopic.subsubtopics && subtopic.subsubtopics.length > 0) {
        for (const sst of subtopic.subsubtopics) {
          if (selectedIds.includes(sst.id)) {
            total += getQuestionCountForProfiles(sst, activeCatalogProfileIds);
          }
        }
      } else {
        if (selectedIds.includes(subtopic.id)) {
          total += getQuestionCountForProfiles(subtopic, activeCatalogProfileIds);
        }
      }
    }
    return total;
  };

  const getSubtopicSelectedQuestionsCount = (subjectId: string, subtopic: QuestionBankSubtopic) => {
    const selectedIds = selectedCatalogSubtopics[subjectId] || [];
    if (selectedIds.length === 0) return 0;
    if (subtopic.subsubtopics && subtopic.subsubtopics.length > 0) {
      return subtopic.subsubtopics
        .filter((sst) => selectedIds.includes(sst.id))
        .reduce((sum, sst) => sum + getQuestionCountForProfiles(sst, activeCatalogProfileIds), 0);
    }
    return selectedIds.includes(subtopic.id) ? getQuestionCountForProfiles(subtopic, activeCatalogProfileIds) : 0;
  };

  // Total de questões selecionadas em todo o catálogo
  const totalSelectedQuestionsCount = useMemo(() => {
    return catalogSubjects.reduce((total, subject) => {
      const selectedIds = new Set(selectedCatalogSubtopics[subject.id] || []);
      return total + subject.topics.reduce((topicTotal, topic) => topicTotal + topic.subtopics.reduce((subtopicTotal, subtopic) => {
        const leaves = subtopic.subsubtopics?.length ? subtopic.subsubtopics : [subtopic];
        return subtopicTotal + leaves.reduce((leafTotal, leaf) => (
          selectedIds.has(leaf.id) ? leafTotal + getQuestionCountForProfiles(leaf, selectedExamProfiles) : leafTotal
        ), 0);
      }, 0), 0);
    }, 0);
  }, [catalogSubjects, selectedCatalogSubtopics, selectedExamProfiles]);

  // Total de questões disponíveis em todo o catálogo real carregado
  const totalAvailableQuestionsCount = useMemo(() => {
    return catalogSubjects.reduce((acc, subject) => {
      return (
        acc +
        (subject.topics || []).reduce(
          (topAcc, topic) =>
            topAcc +
            (topic.subtopics || []).reduce(
              (subAcc, sub) =>
                subAcc +
                (sub.subsubtopics?.length
                  ? sub.subsubtopics.reduce((sstAcc, sst) => sstAcc + sst.questionCount, 0)
                  : sub.questionCount),
              0
            ),
          0
        )
      );
    }, 0);
  }, [catalogSubjects]);

  // Estrutura hierárquica completa em 4 níveis (Matéria -> Tópico -> Subtópico -> Subsubtópico quando houver)
  const monitorTreeStructure = useMemo(() => {
    type TreeSubsubtopic = { id: string; name: string };
    type TreeSubtopic = { id: string; name: string; subsubtopics: TreeSubsubtopic[] };
    type TreeTopic = { id: string; name: string; subtopics: TreeSubtopic[] };
    type TreeSubject = { id: string; name: string; topics: TreeTopic[] };

    const result: TreeSubject[] = [];

    // Matérias a considerar:
    // 1. Matérias do rascunho `subjects` se já preenchidas
    // 2. Ou seleção em tempo real no banco de questões (etapa <= 3)
    const activeSubjectsList = subjects.length > 0
      ? subjects
      : catalogSubjects
          .filter((catSubj) => {
            const selectedIds = selectedCatalogSubtopics[catSubj.id] || [];
            return selectedIds.length > 0 || selectedCatalogSubjects.includes(catSubj.id);
          })
          .map((catSubj) => ({
            id: `catalog-subject-${catSubj.id}`,
            name: catSubj.name,
            topics: [] as Array<{ name: string; definition: string }>,
          }));

    for (const subj of activeSubjectsList) {
      const catSubj = catalogSubjects.find(
        (c) => c.name.trim().toLowerCase() === subj.name.trim().toLowerCase()
      );

      const topicMap = new Map<string, {
        id: string;
        name: string;
        subtopicMap: Map<string, {
          id: string;
          name: string;
          subsubtopics: TreeSubsubtopic[];
        }>;
      }>();

      // 1. Extração fiel da hierarquia a partir do catálogo oficial
      if (catSubj && catSubj.topics) {
        const selectedIds = selectedCatalogSubtopics[catSubj.id] || [];

        for (const t of catSubj.topics) {
          if (!t.subtopics) continue;

          for (const st of t.subtopics) {
            if (st.subsubtopics && st.subsubtopics.length > 0) {
              for (const sst of st.subsubtopics) {
                const isSelectedInCatalog = selectedIds.includes(sst.id);
                const isPresentInDraft = subj.topics.some(
                  (top) =>
                    top.name === `${t.name} > ${st.name} > ${sst.name}` ||
                    top.name.includes(sst.name) ||
                    top.definition?.includes(sst.name)
                );

                if (isSelectedInCatalog || isPresentInDraft) {
                  if (!topicMap.has(t.name)) {
                    topicMap.set(t.name, { id: t.id, name: t.name, subtopicMap: new Map() });
                  }
                  const topNode = topicMap.get(t.name)!;

                  if (!topNode.subtopicMap.has(st.name)) {
                    topNode.subtopicMap.set(st.name, { id: st.id, name: st.name, subsubtopics: [] });
                  }
                  const subNode = topNode.subtopicMap.get(st.name)!;
                  if (!subNode.subsubtopics.some((item) => item.name === sst.name)) {
                    subNode.subsubtopics.push({ id: sst.id, name: sst.name });
                  }
                }
              }
            } else {
              const isSelectedInCatalog = selectedIds.includes(st.id);
              const isPresentInDraft = subj.topics.some(
                (top) =>
                  top.name === `${t.name} > ${st.name}` ||
                  top.name.includes(st.name) ||
                  top.definition?.includes(st.name)
              );

              if (isSelectedInCatalog || isPresentInDraft) {
                if (!topicMap.has(t.name)) {
                  topicMap.set(t.name, { id: t.id, name: t.name, subtopicMap: new Map() });
                }
                const topNode = topicMap.get(t.name)!;

                if (!topNode.subtopicMap.has(st.name)) {
                  topNode.subtopicMap.set(st.name, { id: st.id, name: st.name, subsubtopics: [] });
                }
              }
            }
          }
        }
      }

      // 2. Processa tópicos manuais ou customizados que não vieram diretamente do catálogo
      for (const draftTopic of subj.topics) {
        let isAlreadyMapped = false;
        for (const tNode of topicMap.values()) {
          for (const stNode of tNode.subtopicMap.values()) {
            if (draftTopic.name.includes(stNode.name)) {
              isAlreadyMapped = true;
              break;
            }
            for (const sstNode of stNode.subsubtopics) {
              if (draftTopic.name.includes(sstNode.name)) {
                isAlreadyMapped = true;
                break;
              }
            }
          }
          if (isAlreadyMapped) break;
        }

        if (!isAlreadyMapped) {
          const separator = draftTopic.name.includes(' > ') ? ' > ' : draftTopic.name.includes(': ') ? ': ' : null;
          if (separator) {
            const parts = draftTopic.name.split(separator).map((p) => p.trim()).filter(Boolean);
            if (parts.length >= 3) {
              const [tName, stName, ...rest] = parts;
              const sstName = rest.join(' - ');
              if (!topicMap.has(tName)) topicMap.set(tName, { id: tName, name: tName, subtopicMap: new Map() });
              const topNode = topicMap.get(tName)!;
              if (!topNode.subtopicMap.has(stName)) topNode.subtopicMap.set(stName, { id: stName, name: stName, subsubtopics: [] });
              const subNode = topNode.subtopicMap.get(stName)!;
              if (!subNode.subsubtopics.some((item) => item.name === sstName)) {
                subNode.subsubtopics.push({ id: `${stName}-${sstName}`, name: sstName });
              }
            } else if (parts.length === 2) {
              const [tName, stName] = parts;
              if (!topicMap.has(tName)) topicMap.set(tName, { id: tName, name: tName, subtopicMap: new Map() });
              const topNode = topicMap.get(tName)!;
              if (!topNode.subtopicMap.has(stName)) topNode.subtopicMap.set(stName, { id: stName, name: stName, subsubtopics: [] });
            } else {
              const tName = parts[0] || draftTopic.name;
              if (!topicMap.has(tName)) topicMap.set(tName, { id: tName, name: tName, subtopicMap: new Map() });
            }
          } else {
            const tName = draftTopic.name.trim();
            if (!topicMap.has(tName)) topicMap.set(tName, { id: tName, name: tName, subtopicMap: new Map() });
          }
        }
      }

      const treeTopics: TreeTopic[] = Array.from(topicMap.values()).map((top) => ({
        id: top.id,
        name: top.name,
        subtopics: Array.from(top.subtopicMap.values()).map((sub) => ({
          id: sub.id,
          name: sub.name,
          subsubtopics: sub.subsubtopics,
        })),
      }));

      result.push({
        id: subj.id,
        name: subj.name,
        topics: treeTopics,
      });
    }

    return result;
  }, [subjects, catalogSubjects, selectedCatalogSubtopics, selectedCatalogSubjects]);

  // Filtro de Perfis de Prova por Categoria e Busca
  const filteredExamProfiles = useMemo(() => {
    return examProfilesList.filter((profile) => {
      const matchCategory =
        examCategoryFilter === 'Todas' || profile.category === examCategoryFilter;
      const query = examSearch.toLowerCase().trim();
      const matchQuery =
        !query ||
        profile.name.toLowerCase().includes(query) ||
        profile.description.toLowerCase().includes(query) ||
        profile.badge.toLowerCase().includes(query);
      return matchCategory && matchQuery;
    });
  }, [examProfilesList, examCategoryFilter, examSearch]);

  // Filtro de Matérias do Catálogo pelos Perfis Selecionados na Etapa Anterior e Busca
  const filteredCatalogSubjects = useMemo(() => {
    return profileScopedCatalogSubjects.filter((subject) => {
      const query = catalogSearch.toLowerCase().trim();
      const matchQuery =
        !query ||
        subject.name.toLowerCase().includes(query) ||
        (subject.topics || []).some(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            (t.subtopics || []).some(
              (st) =>
                st.name.toLowerCase().includes(query) ||
                (st.subsubtopics || []).some((sst) => sst.name.toLowerCase().includes(query))
            )
        );

      return matchQuery;
    });
  }, [profileScopedCatalogSubjects, catalogSearch]);

  // Matéria ativa no painel de detalhe do Banco de Questões
  const activeSubject = useMemo(() => {
    if (!filteredCatalogSubjects.length) return null;
    const found = filteredCatalogSubjects.find((s) => s.id === activeCatalogSubjectId);
    if (found) return found;
    return filteredCatalogSubjects[0] || null;
  }, [activeCatalogSubjectId, filteredCatalogSubjects]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-emerald-950 bg-gradient-to-r from-emerald-900 via-[#132E20] to-[#2E5B37] px-5 py-4 sm:px-7 text-white shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">Novo produto</p>
            <h2 className="mt-1 font-heading text-lg font-extrabold text-white uppercase tracking-wide">
              Estruture seu Monitor de IA
            </h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-emerald-200 hover:bg-emerald-800/50 hover:text-white transition-all cursor-pointer"
            title="Fechar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className={`grid min-h-0 flex-1 ${step >= 4 ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_340px]'}`}>
          <section className="min-h-0 overflow-y-auto px-5 py-6 sm:px-7">
            {!isCreationStarted ? (
              <div className="mx-auto max-w-2xl space-y-7 py-2">
                <div>
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 shadow-2xs">
                    <Lightbulb className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Antes de começar</p>
                  <h3 className="mt-2 font-heading text-3xl font-bold text-[#132E20]">Um monitor especialista gera um produto melhor.</h3>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                    Escolha um recorte claro para que o aluno saiba exatamente o que vai aprender e a IA responda com mais profundidade e alinhamento com provas reais.
                  </p>
                </div>

                <div className="border-y border-slate-200">
                  <div className="flex gap-4 py-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#132E20] text-xs font-bold text-white">01</span>
                    <div>
                      <h4 className="text-sm font-bold text-[#132E20]">Selecione os Perfis de Prova & Bancas</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">Escolha bancas e exames como ENEM, FGV, CEBRASPE, FUVEST, ITA, OAB ou ENARE.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 border-t border-slate-200 py-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#132E20] text-xs font-bold text-white">02</span>
                    <div>
                      <h4 className="text-sm font-bold text-[#132E20]">Selecione Matérias & Tópicos do Banco</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">Navegue de forma limpa pelas matérias e marque os tópicos e detalhamentos oficiais.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 border-t border-slate-200 py-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#132E20] text-xs font-bold text-white">03</span>
                    <div>
                      <h4 className="text-sm font-bold text-[#132E20]">Personalize e revise a árvore</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">Adicione conteúdos complementares e revise tudo antes de publicar.</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-3 text-sm text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasReviewedRecommendations}
                      onChange={(event) => setHasReviewedRecommendations(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-800 focus:ring-emerald-700"
                    />
                    <span>Entendi a importância de escolher um tema específico</span>
                  </label>
                  <button
                    type="button"
                    disabled={!hasReviewedRecommendations}
                    onClick={() => {
                      setIsCreationStarted(true);
                      setStep(1);
                    }}
                    className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition cursor-pointer ${
                      hasReviewedRecommendations
                        ? 'bg-[#132E20] text-white hover:bg-[#1E432D] shadow-xs'
                        : 'cursor-not-allowed bg-slate-100 text-slate-400'
                    }`}
                  >
                    Começar estruturação
                  </button>
                </div>
              </div>
            ) : null}

            {isCreationStarted ? (
              <>
                {/* Stepper Progress Bar (5 Passos por Fases) */}
                <div className="mb-6 flex items-center gap-1.5 overflow-x-auto pb-1">
                  {steps.map((label, index) => {
                    const position = index + 1;
                    const isCurrent = position === step;
                    const isComplete = position < step;
                    return (
                      <React.Fragment key={label}>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all ${
                              isCurrent || isComplete
                                ? 'bg-[#132E20] text-white shadow-xs'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {isComplete ? <Check className="h-3 w-3 stroke-[3px]" /> : position}
                          </span>
                          <span
                            className={`text-xs whitespace-nowrap ${
                              isCurrent ? 'text-[#132E20] font-bold' : 'text-slate-500 font-medium'
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                        {position < steps.length ? (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* FASE 1: ESCOPO GERAL */}
                {step === 1 ? (
                  <div className="max-w-xl space-y-6">
                    <div>
                      <h3 className="font-heading text-2xl font-bold text-[#132E20]">Qual é o escopo geral?</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Comece definindo o nome e a proposta do seu Monitor de IA. Nas próximas etapas você selecionará as bancas e as matérias do banco de questões.
                      </p>
                    </div>
                    <label className="block">
                      <span className="text-sm font-semibold text-[#132E20]">Nome do Monitor de IA</span>
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Ex.: Monitor de Física & Matemática — ENEM & Vestibulares"
                        className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3.5 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 shadow-2xs"
                        autoFocus
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-[#132E20]">
                        Descrição curta <span className="font-normal text-slate-400">(opcional)</span>
                      </span>
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Ex.: Preparação direcionada com teoria aplicada, resolução de questões oficiais e banco de desafios diários."
                        className="mt-2 min-h-28 w-full resize-y rounded-xl border border-slate-300 p-3.5 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 shadow-2xs"
                      />
                    </label>
                  </div>
                ) : null}

                {/* FASE 2: PERFIS DE PROVA & BANCAS (Fase Isolada com Filtros e Busca) */}
                {step === 2 ? (
                  <div className="space-y-5 max-w-3xl">
                    <div>
                      <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-2">
                        <Database className="w-3.5 h-3.5" />
                        <span>Fase 1 de Conteúdo • Perfis de Prova & Bancas</span>
                      </div>
                      <h3 className="font-heading text-2xl font-bold text-[#132E20]">
                        Selecione as Bancas e Perfis de Questões
                      </h3>
                      <p className="mt-1.5 text-sm leading-6 text-slate-600">
                        Escolha as bancas examinadoras e perfis de prova que alimentarão as questões do seu monitor. Você pode selecionar múltiplos perfis.
                      </p>
                    </div>

                    {/* Filtros de Categoria (se houver mais de uma) e Barra de Busca */}
                    {(availableExamCategories.length > 1 || examProfilesList.length > 2) && (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-y border-slate-200 py-3">
                        {/* Abas de Categorias */}
                        {availableExamCategories.length > 1 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {availableExamCategories.map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => setExamCategoryFilter(cat)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                                  examCategoryFilter === cat
                                    ? 'bg-[#132E20] text-white shadow-2xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Busca */}
                        {examProfilesList.length > 2 && (
                          <div className="relative min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Buscar banca ou perfil..."
                              value={examSearch}
                              onChange={(e) => setExamSearch(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-[#0F2942] placeholder:text-slate-400 focus:bg-white focus:border-[#2E5B37] focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Contador de Seleção */}
                    <div className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-slate-100 font-semibold text-slate-700">
                      <span>
                        {selectedExamProfiles.length} perfil de prova selecionado
                      </span>
                      {selectedExamProfiles.length > 0 && (
                        <span className="text-emerald-800 text-[11px] font-bold">
                          ✓ Integrado com o banco oficial
                        </span>
                      )}
                    </div>

                    {/* Grid de Cards de Bancas */}
                    {isLoadingCatalog ? (
                      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-700 mb-2" />
                        <p className="text-xs font-semibold">Carregando bancas e questões do banco oficial...</p>
                      </div>
                    ) : catalogLoadError ? (
                      <div role="alert" className="p-8 text-center text-amber-800 bg-amber-50 rounded-2xl border border-amber-200">
                        <p className="text-sm font-semibold">{catalogLoadError}</p>
                      </div>
                    ) : filteredExamProfiles.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
                        <p className="text-sm font-semibold">Nenhuma banca encontrada com os filtros selecionados.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
                        {filteredExamProfiles.map((profile) => {
                          const isSelected = selectedExamProfiles.includes(profile.id);
                          return (
                            <label
                              key={profile.id}
                              className={`flex items-start gap-3.5 p-4 rounded-2xl border cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-[#132E20]/05 border-[#132E20] ring-1 ring-[#132E20]/20 shadow-2xs'
                                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleExamProfile(profile.id)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-[#132E20] focus:ring-[#132E20] cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-sm text-[#0F2942]">{profile.name}</span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-900 uppercase">
                                    {profile.badge}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                                  {profile.description}
                                </p>
                                <div className="mt-3 flex items-center justify-between">
                                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60">
                                    {profile.questionCount.toLocaleString('pt-BR')} questões no banco
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    {profile.category}
                                  </span>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Aviso informativo */}
                    <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/60 rounded-xl text-xs text-emerald-950 flex items-start gap-2.5">
                      <Lightbulb className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      <p className="leading-5">
                        <span className="font-bold">Banco em tempo real:</span> As opções acima refletem diretamente as questões indexadas na plataforma. Conforme novas provas forem adicionadas ao sistema, elas ficarão disponíveis automaticamente nesta etapa.
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* FASE 3: BANCO DE QUESTÕES (Layout Master-Detail: Matéria Ativa à Esquerda, Tópicos à Direita) */}
                {step === 3 ? (
                  <div className="space-y-4 max-w-4xl">
                    <div>
                      <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Fase 3 • Acervo de Questões Pré-Salvas</span>
                      </div>
                      <h3 className="font-heading text-2xl font-bold text-[#132E20]">
                        Aproveite nosso Banco de Questões
                      </h3>
                      <p className="text-sm leading-6 text-slate-600">
                        Disponibilizamos uma ampla seleção de matérias e tópicos com questões oficiais já cadastradas para você aproveitar e agilizar o lançamento do seu monitor. Esta etapa serve para você explorar e selecionar os conteúdos pré-salvos — em breve, você também poderá personalizar totalmente e fazer upload dos seus próprios bancos de questões.
                      </p>
                    </div>

                    {/* Barra Superior: Filtro pelos Perfis Selecionados na Fase Anterior e Busca */}
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-y border-slate-200 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {availableProfileFilterOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSubjectCategoryFilter(opt.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                              subjectCategoryFilter === opt.id
                                ? 'bg-[#132E20] text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      <div className="relative min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar matéria ou tópico..."
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-[#0F2942] placeholder:text-slate-400 focus:bg-white focus:border-[#2E5B37] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Resumo consolidado de seleção */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-3.5 py-2 rounded-xl bg-slate-100 font-semibold text-slate-700">
                      <div className="flex items-center gap-2">
                        <span>
                          {selectedCatalogSubjects.length} matéria{selectedCatalogSubjects.length === 1 ? '' : 's'} • {totalSelectedSubtopicsCount} tópico{totalSelectedSubtopicsCount === 1 ? '' : 's'}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#132E20] text-white">
                          {totalSelectedQuestionsCount.toLocaleString('pt-BR')} questões selecionadas
                        </span>
                      </div>
                      {totalSelectedSubtopicsCount > 0 && (
                        <span className="text-emerald-800 text-[11px] font-bold">✓ Prontos para importar</span>
                      )}
                    </div>

                    {/* Master-Detail: Coluna de Matérias (Esquerda) + Coluna de Tópicos e Árvore da Matéria Ativa (Direita) */}
                    <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-3 border rounded-2xl border-slate-200 bg-white p-3 min-h-[380px]">
                      {/* Menu de Matérias (Master) */}
                      <div className="space-y-1.5 md:border-r md:border-slate-100 md:pr-3 max-h-[460px] overflow-y-auto">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block px-2 pb-1">
                          Matérias Disponíveis
                        </span>
                        {filteredCatalogSubjects.map((subject) => {
                          const isSelected = selectedCatalogSubjects.includes(subject.id);
                          const isActive = activeSubject?.id === subject.id;
                          const selectedQuestions = getSubjectSelectedQuestionsCount(subject);

                          return (
                            <div
                              key={subject.id}
                              onClick={() => setActiveCatalogSubjectId(subject.id)}
                              className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                                isActive
                                  ? 'bg-[#132E20]/08 border-[#132E20] shadow-2xs'
                                  : 'bg-white border-slate-200/80 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleCatalogSubject(subject);
                                  }}
                                  className="h-4 w-4 rounded border-slate-300 text-[#132E20] focus:ring-[#132E20] cursor-pointer"
                                />
                                <div className="min-w-0">
                                  <span className={`block text-xs font-bold truncate ${isActive ? 'text-[#132E20]' : 'text-slate-800'}`}>
                                    {subject.name}
                                  </span>
                                  <span className="block text-[10px] text-slate-400 truncate">
                                    {subject.category}
                                  </span>
                                </div>
                              </div>

                              {/* Badge de Questões da Matéria de acordo com nós selecionados */}
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ml-1.5 transition-all ${
                                  selectedQuestions > 0
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {selectedQuestions.toLocaleString('pt-BR')} q.
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Painel de Tópicos e Árvore da Matéria Ativa (Detail) */}
                      <div className="space-y-3.5 md:pl-2 max-h-[460px] overflow-y-auto pr-1">
                        {!activeSubject ? (
                          <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center p-6 text-slate-400">
                            <BookOpen className="h-8 w-8 text-slate-300 mb-2" />
                            {selectedExamProfiles.length === 0 ? (
                              <>
                                <p className="text-sm font-semibold text-slate-600">Selecione uma ou mais bancas para filtrar o acervo</p>
                                <p className="text-xs text-slate-400 mt-1">Volte à etapa anterior e escolha os perfis que deseja incluir.</p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-semibold text-slate-600">Nenhuma matéria selecionada</p>
                                <p className="text-xs text-slate-400 mt-1">Selecione uma matéria na lista ao lado para ver seus tópicos.</p>
                              </>
                            )}
                          </div>
                        ) : (
                          <>
                            {/* Header da Matéria Ativa */}
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                              <div className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-emerald-700" />
                                <h4 className="font-bold text-sm text-[#132E20]">{activeSubject.name}</h4>
                                <span className="text-[11px] text-slate-400 font-normal">
                                  ({activeSubject.category})
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                  <button
                                    type="button"
                                    onClick={() => expandAllCatalogForSubject(activeSubject)}
                                    className="font-semibold text-emerald-800 hover:underline cursor-pointer"
                                  >
                                    Expandir todos
                                  </button>
                                  <span>•</span>
                                  <button
                                    type="button"
                                    onClick={() => collapseAllCatalogForSubject(activeSubject)}
                                    className="font-semibold text-slate-500 hover:underline cursor-pointer"
                                  >
                                    Recolher todos
                                  </button>
                                </div>
                                <span className="text-slate-200">|</span>
                                <button
                                  type="button"
                                  onClick={() => toggleCatalogSubject(activeSubject)}
                                  className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                                >
                                  {(() => {
                                    const allLeafIds = getAllSubjectLeafIds(activeSubject);
                                    const selected = selectedCatalogSubtopics[activeSubject.id] || [];
                                    const allChecked = allLeafIds.length > 0 && allLeafIds.every((id) => selected.includes(id));
                                    return allChecked ? 'Desmarcar matéria' : 'Selecionar todos os tópicos';
                                  })()}
                                </button>
                              </div>
                            </div>

                            {/* Lista de Tópicos em Árvore (recolhidos por padrão) */}
                            <div className="space-y-3">
                              {(activeSubject.topics || []).map((topic) => {
                                const topicKey = `${activeSubject.id}::${topic.id}`;
                                const isCatalogTopicExpanded = !!expandedCatalogTopics[topicKey];
                                const topicLeafIds = getAllTopicLeafIds(topic);
                                const selectedInSubject = selectedCatalogSubtopics[activeSubject.id] || [];
                                const checkedTopicLeaves = topicLeafIds.filter((id) => selectedInSubject.includes(id));
                                const isTopicFullyChecked = topicLeafIds.length > 0 && checkedTopicLeaves.length === topicLeafIds.length;
                                const isTopicIndeterminate = checkedTopicLeaves.length > 0 && checkedTopicLeaves.length < topicLeafIds.length;
                                const topicSelectedQuestions = getTopicSelectedQuestionsCount(activeSubject.id, topic);

                                return (
                                  <div
                                    key={topic.id}
                                    className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden"
                                  >
                                    {/* Cabeçalho do Tópico Mestre com Botão Expansível */}
                                    <div className="flex items-center justify-between bg-slate-50/90 px-3.5 py-2 border-b border-slate-100 gap-2">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <input
                                          type="checkbox"
                                          checked={isTopicFullyChecked}
                                          ref={(el) => {
                                            if (el) el.indeterminate = isTopicIndeterminate;
                                          }}
                                          onChange={() => toggleCatalogTopic(activeSubject.id, topic)}
                                          className="h-4 w-4 rounded border-slate-300 text-[#132E20] focus:ring-[#132E20] cursor-pointer shrink-0"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => toggleCatalogTopicExpanded(topicKey)}
                                          className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer group py-0.5"
                                        >
                                          {isCatalogTopicExpanded ? (
                                            <ChevronDown className="h-4 w-4 text-emerald-800 shrink-0 transition-transform" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 group-hover:text-emerald-800 transition-transform" />
                                          )}
                                          <span className="text-xs font-bold uppercase tracking-wider text-[#132E20] truncate group-hover:text-emerald-900">
                                            {topic.name}
                                          </span>
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        <span
                                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-all ${
                                            topicSelectedQuestions > 0
                                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                              : 'bg-white text-slate-600 border-slate-200'
                                          }`}
                                        >
                                          {topicSelectedQuestions > 0
                                            ? `${topicSelectedQuestions.toLocaleString('pt-BR')} / ${topic.totalQuestions.toLocaleString('pt-BR')} q.`
                                            : `${topic.totalQuestions.toLocaleString('pt-BR')} questões`}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded-md border border-slate-200">
                                          {checkedTopicLeaves.length}/{topicLeafIds.length}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => toggleCatalogTopicExpanded(topicKey)}
                                          className="p-1 rounded text-slate-400 hover:text-emerald-800 hover:bg-slate-200/60 transition cursor-pointer"
                                          title={isCatalogTopicExpanded ? 'Recolher subtópicos' : 'Expandir subtópicos'}
                                        >
                                          {isCatalogTopicExpanded ? (
                                            <ChevronDown className="h-3.5 w-3.5" />
                                          ) : (
                                            <ChevronRight className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                      </div>
                                    </div>

                                    {/* Árvore de Subtópicos e Subsubtópicos (recolhida por padrão) */}
                                    {isCatalogTopicExpanded && (
                                      <div className="p-2.5 space-y-2.5 animate-in fade-in duration-150">
                                        {(topic.subtopics || []).map((subtopic) => {
                                          const hasSubsub = subtopic.subsubtopics && subtopic.subsubtopics.length > 0;
                                          const subtopicKey = `${activeSubject.id}::${topic.id}::${subtopic.id}`;
                                          const isCatalogSubExpanded = !!expandedCatalogSubtopics[subtopicKey];
                                          const subtopicLeafIds = getAllSubtopicLeafIds(subtopic);
                                          const checkedSubLeaves = subtopicLeafIds.filter((id) => selectedInSubject.includes(id));
                                          const isSubFullyChecked = subtopicLeafIds.length > 0 && checkedSubLeaves.length === subtopicLeafIds.length;
                                          const isSubIndeterminate = checkedSubLeaves.length > 0 && checkedSubLeaves.length < subtopicLeafIds.length;
                                          const subtopicTotalQuestions = subtopic.subsubtopics?.length
                                            ? subtopic.subsubtopics.reduce((acc, sst) => acc + sst.questionCount, 0)
                                            : subtopic.questionCount;
                                          const subtopicSelectedQuestions = getSubtopicSelectedQuestionsCount(activeSubject.id, subtopic);

                                          if (hasSubsub) {
                                            return (
                                              <div
                                                key={subtopic.id}
                                                className="rounded-lg border border-slate-200/80 bg-slate-50/40 p-2.5 space-y-2"
                                              >
                                                {/* Nó Pai: Subtópico com botão expansível */}
                                                <div className="flex items-center justify-between gap-2">
                                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    <input
                                                      type="checkbox"
                                                      checked={isSubFullyChecked}
                                                      ref={(el) => {
                                                        if (el) el.indeterminate = isSubIndeterminate;
                                                      }}
                                                      onChange={() => toggleCatalogSubtopic(activeSubject.id, subtopic)}
                                                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-700 cursor-pointer shrink-0"
                                                    />
                                                    <button
                                                      type="button"
                                                      onClick={() => toggleCatalogSubtopicExpanded(subtopicKey)}
                                                      className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer group py-0.5"
                                                    >
                                                      {isCatalogSubExpanded ? (
                                                        <ChevronDown className="h-3.5 w-3.5 text-emerald-800 shrink-0 transition-transform" />
                                                      ) : (
                                                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0 group-hover:text-emerald-800 transition-transform" />
                                                      )}
                                                      <FolderTree className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                                                      <span className="text-xs font-bold text-slate-800 truncate group-hover:text-emerald-900">
                                                        {subtopic.name}
                                                      </span>
                                                    </button>
                                                  </div>

                                                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                    <span
                                                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                                        subtopicSelectedQuestions > 0
                                                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                                          : 'bg-white text-slate-500 border border-slate-200'
                                                      }`}
                                                    >
                                                      {subtopicTotalQuestions.toLocaleString('pt-BR')} q.
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-semibold">
                                                      {checkedSubLeaves.length}/{subtopic.subsubtopics.length}
                                                    </span>
                                                    <button
                                                      type="button"
                                                      onClick={() => toggleCatalogSubtopicExpanded(subtopicKey)}
                                                      className="p-1 rounded text-slate-400 hover:text-emerald-800 hover:bg-slate-200/60 transition cursor-pointer"
                                                    >
                                                      {isCatalogSubExpanded ? (
                                                        <ChevronDown className="h-3 w-3" />
                                                      ) : (
                                                        <ChevronRight className="h-3 w-3" />
                                                      )}
                                                    </button>
                                                  </div>
                                                </div>

                                                {/* Galho da Árvore: Subsubtópicos identados (recolhidos por padrão) */}
                                                {isCatalogSubExpanded && (
                                                  <div className="ml-3 pl-3.5 border-l-2 border-emerald-200/80 pt-0.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 animate-in fade-in duration-150">
                                                    {subtopic.subsubtopics.map((sst) => {
                                                      const isSstChecked = selectedInSubject.includes(sst.id);
                                                      return (
                                                        <label
                                                          key={sst.id}
                                                          className={`flex items-center justify-between gap-2 p-2 rounded-lg text-xs border cursor-pointer transition ${
                                                            isSstChecked
                                                              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-semibold shadow-2xs'
                                                              : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                                                          }`}
                                                        >
                                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <input
                                                              type="checkbox"
                                                              checked={isSstChecked}
                                                              onChange={() => toggleCatalogLeaf(activeSubject.id, sst.id)}
                                                              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-700 cursor-pointer shrink-0"
                                                            />
                                                            <span className="truncate" title={sst.name}>{sst.name}</span>
                                                          </div>
                                                          <span
                                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                                              isSstChecked
                                                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                                                : 'bg-slate-100 text-slate-500'
                                                            }`}
                                                          >
                                                            {sst.questionCount} q.
                                                          </span>
                                                        </label>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }

                                          {/* Subtópico sem subsubtópicos: nó folha direto */}
                                          const isChecked = selectedInSubject.includes(subtopic.id);
                                          return (
                                            <label
                                              key={subtopic.id}
                                              className={`flex items-center justify-between gap-2 p-2.5 rounded-lg text-xs border cursor-pointer transition ${
                                                isChecked
                                                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-semibold shadow-2xs'
                                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                              }`}
                                            >
                                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <input
                                                  type="checkbox"
                                                checked={isChecked}
                                                onChange={() => toggleCatalogLeaf(activeSubject.id, subtopic.id)}
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-700 cursor-pointer shrink-0"
                                              />
                                              <span className="font-semibold text-slate-800 truncate" title={subtopic.name}>
                                                {subtopic.name}
                                              </span>
                                            </div>
                                            <span
                                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                                isChecked
                                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                                                  : 'bg-slate-100 text-slate-500'
                                              }`}
                                            >
                                              {subtopic.questionCount} q.
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* FASE 4: MATÉRIAS, TÓPICOS & SUBTÓPICOS HIERÁRQUICOS */}
                {step === 4 ? (
                  <div className="max-w-4xl space-y-6">
                    <div>
                      <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Fase 4 • Estrutura do Monitor em Botões Expansíveis</span>
                      </div>
                      <h3 className="font-heading text-2xl font-bold text-[#132E20]">
                        Estrutura de Matérias, Tópicos e Subtópicos
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Explore e personalize a árvore taxonômica usando os botões expansíveis. Você pode adicionar novas matérias, detalhar tópicos e subtópicos ou excluir itens diretamente abaixo.
                      </p>
                    </div>

                    {/* Barra de Adicionar Nova Matéria Manual */}
                    <div className="flex gap-2">
                      <input
                        value={subjectName}
                        onChange={(event) => setSubjectName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addSubject();
                          }
                        }}
                        placeholder="Adicionar outra matéria manual (Ex.: Revisão Final, Legislação, Redação)..."
                        className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100 shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={addSubject}
                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#132E20] px-4 text-sm font-semibold text-white hover:bg-[#1E432D] shadow-2xs cursor-pointer"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Adicionar Matéria
                      </button>
                    </div>

                    {/* Lista de Matérias com Botões Expansíveis e Gestão de Tópicos/Subtópicos */}
                    <div className="space-y-4">
                      {subjects.length === 0 ? (
                        <div className="p-8 rounded-2xl border border-dashed border-slate-300 text-center text-sm text-slate-500">
                          Nenhuma matéria adicionada ainda. Adicione uma matéria acima ou retorne ao banco de questões para importar.
                        </div>
                      ) : null}

                      {subjects.map((subject, index) => {
                        const isSubjExpanded = !!expandedSubjects[subject.id];
                        const parsedTopics = parseSubjectHierarchy(subject);
                        const totalTopics = parsedTopics.length;

                        return (
                          <div
                            key={subject.id}
                            className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden transition-all"
                          >
                            {/* Header da Matéria (Nível 1) */}
                            <div className="flex items-center justify-between p-3.5 sm:p-4 bg-slate-50/70 border-b border-slate-200/80 gap-3">
                              <button
                                type="button"
                                onClick={() => toggleSubjectExpanded(subject.id)}
                                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
                              >
                                {isSubjExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-emerald-800 shrink-0 transition-transform" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 group-hover:text-emerald-800 transition-transform" />
                                )}
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-900">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                                <BookOpen className="h-4 w-4 text-emerald-700 shrink-0" />
                                <span className="font-heading text-sm font-bold text-[#132E20] truncate">
                                  {subject.name}
                                </span>
                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 shrink-0">
                                  {totalTopics} {totalTopics === 1 ? 'tópico' : 'tópicos'}
                                </span>
                              </button>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingTopicSubjectId(addingTopicSubjectId === subject.id ? null : subject.id);
                                    setNewTopicInput('');
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 border border-emerald-200/80 transition cursor-pointer"
                                  title="Adicionar novo tópico nesta matéria"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Adicionar Tópico</span>
                                  <span className="sm:hidden">Tópico</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeSubject(subject.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                  title={`Remover matéria ${subject.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {/* Conteúdo Expansível da Matéria */}
                            {isSubjExpanded && (
                              <div className="p-4 space-y-3 bg-white animate-in fade-in duration-200">
                                {/* Botões auxiliares de expansão */}
                                {parsedTopics.length > 1 && (
                                  <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b border-slate-100">
                                    <span>Tópicos da matéria ({parsedTopics.length}):</span>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => expandAllForSubject(subject)}
                                        className="text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                                      >
                                        Expandir todos
                                      </button>
                                      <span>•</span>
                                      <button
                                        type="button"
                                        onClick={() => collapseAllForSubject(subject)}
                                        className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer"
                                      >
                                        Recolher todos
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Input inline para adicionar Tópico nesta Matéria */}
                                {addingTopicSubjectId === subject.id && (
                                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                                    <span className="text-xs font-bold text-emerald-900">Novo Tópico em {subject.name}:</span>
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        autoFocus
                                        value={newTopicInput}
                                        onChange={(e) => setNewTopicInput(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddTopicInline(subject.id);
                                          } else if (e.key === 'Escape') {
                                            setAddingTopicSubjectId(null);
                                            setNewTopicInput('');
                                          }
                                        }}
                                        placeholder="Ex: Álgebra, Geometria, Termodinâmica..."
                                        className="h-9 min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 text-xs text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleAddTopicInline(subject.id)}
                                        className="px-3 py-1 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition cursor-pointer"
                                      >
                                        Adicionar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAddingTopicSubjectId(null);
                                          setNewTopicInput('');
                                        }}
                                        className="px-3 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-300 transition cursor-pointer"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {parsedTopics.length === 0 ? (
                                  <p className="text-xs text-slate-400 py-2">
                                    Nenhum tópico adicionado nesta matéria ainda. Clique em &quot;+ Adicionar Tópico&quot; acima.
                                  </p>
                                ) : null}

                                {/* Lista de Tópicos em Botões Expansíveis */}
                                <div className="space-y-2.5">
                                  {parsedTopics.map((topic) => {
                                    const topicKey = `${subject.id}::${topic.name}`;
                                    const isTopExpanded = !!expandedTopics[topicKey];
                                    const totalSubtopics = topic.subtopics.length;

                                    return (
                                      <div
                                        key={topic.id}
                                        className="rounded-xl border border-slate-200/90 bg-slate-50/40 overflow-hidden"
                                      >
                                        {/* Header do Tópico (Nível 2) */}
                                        <div className="flex items-center justify-between p-2.5 sm:px-3 sm:py-2 bg-slate-100/70 border-b border-slate-200/70 gap-2">
                                          <button
                                            type="button"
                                            onClick={() => toggleTopicExpanded(topicKey)}
                                            className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group"
                                          >
                                            {isTopExpanded ? (
                                              <ChevronDown className="h-3.5 w-3.5 text-emerald-800 shrink-0" />
                                            ) : (
                                              <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0 group-hover:text-emerald-800" />
                                            )}
                                            <FolderTree className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                                            <span className="text-xs font-bold text-slate-900 truncate">
                                              {topic.name}
                                            </span>
                                            {totalSubtopics > 0 && (
                                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-white border border-slate-200 text-slate-600 shrink-0">
                                                {totalSubtopics} {totalSubtopics === 1 ? 'subtópico' : 'subtópicos'}
                                              </span>
                                            )}
                                          </button>

                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setAddingSubtopicKey(addingSubtopicKey === topicKey ? null : topicKey);
                                                setNewSubtopicInput('');
                                              }}
                                              className="px-2 py-0.5 rounded-md bg-white text-emerald-800 text-[11px] font-semibold border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition cursor-pointer"
                                              title={`Adicionar subtópico em ${topic.name}`}
                                            >
                                              + Subtópico
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveNode(subject.id, 'topic', { topicName: topic.name })}
                                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                              title={`Remover tópico ${topic.name}`}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        </div>

                                        {/* Conteúdo Expansível do Tópico */}
                                        {isTopExpanded && (
                                          <div className="p-2.5 sm:p-3 space-y-2 bg-white/70">
                                            {/* Input inline para adicionar Subtópico */}
                                            {addingSubtopicKey === topicKey && (
                                              <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-1.5">
                                                <span className="text-[11px] font-bold text-emerald-900">Novo Subtópico em {topic.name}:</span>
                                                <div className="flex gap-2">
                                                  <input
                                                    type="text"
                                                    autoFocus
                                                    value={newSubtopicInput}
                                                    onChange={(e) => setNewSubtopicInput(e.target.value)}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddSubtopicInline(subject.id, topic.name);
                                                      } else if (e.key === 'Escape') {
                                                        setAddingSubtopicKey(null);
                                                        setNewSubtopicInput('');
                                                      }
                                                    }}
                                                    placeholder="Ex: Funções, Logaritmo, Matrizes..."
                                                    className="h-8 min-w-0 flex-1 rounded border border-emerald-300 bg-white px-2.5 text-xs text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => handleAddSubtopicInline(subject.id, topic.name)}
                                                    className="px-2.5 py-1 rounded bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition cursor-pointer"
                                                  >
                                                    Adicionar
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setAddingSubtopicKey(null);
                                                      setNewSubtopicInput('');
                                                    }}
                                                    className="px-2.5 py-1 rounded bg-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-300 transition cursor-pointer"
                                                  >
                                                    Cancelar
                                                  </button>
                                                </div>
                                              </div>
                                            )}

                                            {topic.subtopics.length === 0 ? (
                                              <p className="text-[11px] text-slate-400 py-1 pl-1">
                                                Nenhum subtópico adicionado. Clique em &quot;+ Subtópico&quot; para detalhar este tópico.
                                              </p>
                                            ) : null}

                                            {/* Lista de Subtópicos */}
                                            <div className="space-y-1.5 pl-1 sm:pl-2">
                                              {topic.subtopics.map((subtopic) => {
                                                const subtopicKey = `${subject.id}::${topic.name}::${subtopic.name}`;
                                                const isSubExpanded = !!expandedSubtopics[subtopicKey];
                                                const hasSubsub = subtopic.subsubtopics && subtopic.subsubtopics.length > 0;

                                                if (hasSubsub) {
                                                  return (
                                                    <div
                                                      key={subtopic.id}
                                                      className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs"
                                                    >
                                                      {/* Header do Subtópico com Subsubtópicos (Nível 3) */}
                                                      <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-100 gap-2">
                                                        <button
                                                          type="button"
                                                          onClick={() => toggleSubtopicExpanded(subtopicKey)}
                                                          className="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer group"
                                                        >
                                                          {isSubExpanded ? (
                                                            <ChevronDown className="h-3 w-3 text-emerald-800 shrink-0" />
                                                          ) : (
                                                            <ChevronRight className="h-3 w-3 text-slate-400 shrink-0 group-hover:text-emerald-800" />
                                                          )}
                                                          <span className="text-xs font-semibold text-slate-800 truncate">
                                                            {subtopic.name}
                                                          </span>
                                                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                                            {subtopic.subsubtopics.length} itens
                                                          </span>
                                                        </button>

                                                        <div className="flex items-center gap-1 shrink-0">
                                                          <button
                                                            type="button"
                                                            onClick={() => {
                                                              setAddingSubsubtopicKey(addingSubsubtopicKey === subtopicKey ? null : subtopicKey);
                                                              setNewSubsubtopicInput('');
                                                            }}
                                                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition cursor-pointer"
                                                            title={`Adicionar subsubtópico em ${subtopic.name}`}
                                                          >
                                                            + Subsubtópico
                                                          </button>
                                                          <button
                                                            type="button"
                                                            onClick={() => handleRemoveNode(subject.id, 'subtopic', { topicName: topic.name, subtopicName: subtopic.name })}
                                                            className="p-1 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                                            title={`Remover subtópico ${subtopic.name}`}
                                                          >
                                                            <Trash2 className="h-3 w-3" />
                                                          </button>
                                                        </div>
                                                      </div>

                                                      {/* Conteúdo Expansível de Subsubtópicos (Nível 4) */}
                                                      {isSubExpanded && (
                                                        <div className="p-2 space-y-1 bg-slate-50/30">
                                                          {/* Input inline para adicionar subsubtópico */}
                                                          {addingSubsubtopicKey === subtopicKey && (
                                                            <div className="p-2 bg-emerald-50/70 border border-emerald-200 rounded-md space-y-1 mb-1.5">
                                                              <span className="text-[10px] font-bold text-emerald-900">Novo nó em {subtopic.name}:</span>
                                                              <div className="flex gap-1.5">
                                                                <input
                                                                  type="text"
                                                                  autoFocus
                                                                  value={newSubsubtopicInput}
                                                                  onChange={(e) => setNewSubsubtopicInput(e.target.value)}
                                                                  onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                      e.preventDefault();
                                                                      handleAddSubsubtopicInline(subject.id, topic.name, subtopic.name);
                                                                    } else if (e.key === 'Escape') {
                                                                      setAddingSubsubtopicKey(null);
                                                                      setNewSubsubtopicInput('');
                                                                    }
                                                                  }}
                                                                  placeholder="Ex: Função Afim (1º grau)..."
                                                                  className="h-7 min-w-0 flex-1 rounded border border-emerald-300 bg-white px-2 text-xs text-slate-800 focus:border-emerald-600 focus:outline-hidden"
                                                                />
                                                                <button
                                                                  type="button"
                                                                  onClick={() => handleAddSubsubtopicInline(subject.id, topic.name, subtopic.name)}
                                                                  className="px-2 py-0.5 rounded bg-emerald-700 text-white text-[11px] font-semibold hover:bg-emerald-800 transition cursor-pointer"
                                                                >
                                                                  Salvar
                                                                </button>
                                                                <button
                                                                  type="button"
                                                                  onClick={() => {
                                                                    setAddingSubsubtopicKey(null);
                                                                    setNewSubsubtopicInput('');
                                                                  }}
                                                                  className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-slate-300 transition cursor-pointer"
                                                                >
                                                                  Cancelar
                                                                </button>
                                                              </div>
                                                            </div>
                                                          )}

                                                          <div className="space-y-0.5 pl-2 border-l border-slate-200">
                                                            {subtopic.subsubtopics.map((sst) => (
                                                              <div
                                                                key={sst.id}
                                                                className="flex items-center justify-between py-1 px-2 rounded-md hover:bg-white text-xs text-slate-600 transition group/sst"
                                                              >
                                                                <span className="truncate flex-1 pr-2" title={sst.name}>
                                                                  {sst.name}
                                                                </span>
                                                                <button
                                                                  type="button"
                                                                  onClick={() => handleRemoveNode(subject.id, 'subsubtopic', { topicName: topic.name, subtopicName: subtopic.name, subsubtopicName: sst.name })}
                                                                  className="opacity-0 group-hover/sst:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 transition cursor-pointer"
                                                                  title={`Remover ${sst.name}`}
                                                                >
                                                                  <Trash2 className="h-3 w-3" />
                                                                </button>
                                                              </div>
                                                            ))}
                                                          </div>
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                }

                                                // Subtópico sem subsubtópicos (folha direta)
                                                return (
                                                  <div
                                                    key={subtopic.id}
                                                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/80 hover:border-slate-300 transition gap-2 group/st"
                                                  >
                                                    <span className="text-xs font-medium text-slate-800 truncate pl-1" title={subtopic.name}>
                                                      {subtopic.name}
                                                    </span>

                                                    <div className="flex items-center gap-1 shrink-0">
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          setAddingSubsubtopicKey(addingSubsubtopicKey === subtopicKey ? null : subtopicKey);
                                                          setNewSubsubtopicInput('');
                                                        }}
                                                        className="opacity-80 group-hover/st:opacity-100 px-1.5 py-0.5 rounded text-[10px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition cursor-pointer"
                                                        title={`Detalhar ${subtopic.name} em subsubtópicos`}
                                                      >
                                                        + Detalhar
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => handleRemoveNode(subject.id, 'subtopic', { topicName: topic.name, subtopicName: subtopic.name })}
                                                        className="opacity-60 group-hover/st:opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                                        title={`Remover subtópico ${subtopic.name}`}
                                                      >
                                                        <Trash2 className="h-3 w-3" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* FASE 5: REVISÃO FINAL & CRIAÇÃO */}
                {step === 5 ? (
                  <div className="max-w-3xl space-y-6">
                    <div>
                      <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Fase 5 • Revisão Final & Criação</span>
                      </div>
                      <h3 className="font-heading text-2xl font-bold text-[#132E20]">
                        Revise seu Monitor de IA antes de criar
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Confira os dados principais e a composição de matérias e tópicos configurados. Após criar o rascunho, você poderá publicar e gerenciar materiais.
                      </p>
                    </div>

                    {/* Resumo do Monitor */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-2xs">
                      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Nome do Monitor</p>
                          <h4 className="font-heading text-xl font-extrabold text-[#132E20] mt-0.5">
                            {name.trim() || 'Sem nome'}
                          </h4>
                          {description.trim() && (
                            <p className="text-xs text-slate-600 mt-1 max-w-xl">{description.trim()}</p>
                          )}
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold shrink-0">
                          Rascunho
                        </span>
                      </div>

                      {/* Perfis de Prova */}
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                          Perfis de Prova & Bancas Selecionados
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedExamProfiles.map((pId) => {
                            const prof = examProfilesList.find((p) => p.id === pId);
                            return (
                              <span
                                key={pId}
                                className="px-2.5 py-1 rounded-lg bg-[#132E20] text-white text-xs font-bold shadow-2xs"
                              >
                                {prof?.name || pId.toUpperCase()}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3">
                        <span className="text-xs font-bold text-emerald-950">Questões selecionadas no acervo</span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-emerald-900 ring-1 ring-emerald-200">
                          {totalSelectedQuestionsCount.toLocaleString('pt-BR')} questões
                        </span>
                      </div>

                      {/* Resumo Estrutural */}
                      <div className="pt-3 border-t border-slate-100">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                          Matérias e Detalhamentos ({subjects.length} matérias, {totalTopics} tópicos cadastrados)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {subjects.map((s, idx) => (
                            <div key={s.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-[#132E20]">
                                  {String(idx + 1).padStart(2, '0')}. {s.name}
                                </span>
                                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                                  {s.topics.length} itens
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Estrutura configurada e pronta para publicação.
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center gap-3 text-xs text-emerald-950 font-medium">
                      <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
                      <span>
                        Tudo pronto! Ao clicar em <strong>&quot;Criar Monitor de IA&quot;</strong> abaixo, seu monitor será salvo no painel do professor e você será direcionado para o workspace de gestão.
                      </span>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-5 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-rose-700 text-sm font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          {/* ASIDE: ESTRUTURA DO MONITOR EM ÁRVORE (Fases 1, 2 e 3) */}
          <aside className={`min-h-0 border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0 lg:overflow-y-auto ${step >= 4 ? 'hidden' : ''}`}>
            <div className="mb-5 flex items-center gap-2 text-[#132E20]">
              <FolderTree className="h-5 w-5 text-emerald-700" aria-hidden="true" />
              <h3 className="text-sm font-bold">Estrutura do monitor</h3>
            </div>
            {!isCreationStarted ? (
              <div className="space-y-5 text-sm text-slate-600">
                <div className="flex items-center gap-3 font-bold text-[#132E20]">
                  <Layers3 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                  <span>Criação guiada em 5 fases</span>
                </div>
                <div className="border-l border-slate-300 pl-4 text-xs leading-6">
                  <p className="font-semibold text-[#132E20]">1. Monitor de IA</p>
                  <div className="ml-1 border-l border-slate-200 pl-4">
                    <p className="text-emerald-800 font-semibold">2. Perfis & Bancas</p>
                    <div className="ml-1 border-l border-slate-200 pl-4">
                      <p className="text-emerald-800 font-semibold">3. Banco de Questões</p>
                      <div className="ml-1 border-l border-slate-200 pl-4">
                        <p>4. Matérias</p>
                        <div className="ml-1 border-l border-slate-200 pl-4">5. Detalhamentos</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 border-t border-slate-200 pt-4 text-xs leading-5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  <span>O rascunho só será salvo depois da sua revisão final.</span>
                </div>
              </div>
            ) : name.trim() ? (
              <div className="text-sm">
                <div className="flex items-center gap-2 font-bold text-[#132E20]">
                  <GraduationCap className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                  <span className="truncate">{name.trim()}</span>
                </div>
                {selectedExamProfiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedExamProfiles.map((p) => {
                      const profile = examProfilesList.find((ep) => ep.id === p);
                      return (
                        <span key={p} className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 uppercase">
                          {profile?.name || p}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="ml-2 mt-3.5 border-l border-slate-300 pl-3.5">
                  {monitorTreeStructure.length === 0 ? (
                    <p className="text-xs text-slate-500">As matérias selecionadas aparecerão aqui.</p>
                  ) : null}
                  <div className="space-y-3.5">
                    {monitorTreeStructure.map((subject) => (
                      <div key={subject.id} className="space-y-1.5">
                        {/* Nível 1: Matéria */}
                        <div className="relative flex items-center gap-2 font-bold text-slate-800">
                          <span className="absolute -left-3.5 top-1/2 h-px w-3 bg-slate-300" />
                          <BookOpen className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
                          <span className="truncate text-xs font-bold text-[#132E20]">{subject.name}</span>
                        </div>

                        {/* Nível 2: Tópicos */}
                        {subject.topics.length > 0 ? (
                          <div className="ml-2.5 space-y-2 border-l border-slate-200 pl-3">
                            {subject.topics.map((topic) => (
                              <div key={topic.id} className="space-y-1">
                                <div className="relative flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
                                  <span className="absolute -left-3 top-2 h-px w-2.5 bg-slate-300" />
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                                  <span className="truncate">{topic.name}</span>
                                </div>

                                {/* Nível 3: Subtópicos */}
                                {topic.subtopics.length > 0 ? (
                                  <div className="ml-2 space-y-1 border-l border-emerald-200/80 pl-2.5">
                                    {topic.subtopics.map((subtopic, subtopicIdx) => (
                                      <div key={`${subtopic.id}-${subtopicIdx}`} className="space-y-0.5">
                                        <div className="relative flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                                          <span className="absolute -left-2.5 top-2 h-px w-2 bg-emerald-200" />
                                          <span className="truncate">{subtopic.name}</span>
                                        </div>

                                        {/* Nível 4: Subsubtópicos (quando tiver!) */}
                                        {subtopic.subsubtopics && subtopic.subsubtopics.length > 0 ? (
                                          <div className="ml-2 space-y-0.5 border-l border-slate-200 pl-2">
                                            {subtopic.subsubtopics.map((sst) => (
                                              <div key={sst.id} className="relative text-[10px] text-slate-500 truncate flex items-center gap-1">
                                                <span className="absolute -left-2 top-2 h-px w-1.5 bg-slate-300" />
                                                <span className="truncate pl-0.5">{sst.name}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-500">Dê um nome ao monitor para visualizar a estrutura em árvore.</p>
            )}
          </aside>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={() => (!isCreationStarted || step === 1 ? resetAndClose() : setStep((current) => current - 1))}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          >
            {!isCreationStarted || step === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          {!isCreationStarted ? (
            <button
              type="button"
              disabled={!hasReviewedRecommendations}
              onClick={() => {
                setIsCreationStarted(true);
                setStep(1);
              }}
              className={`rounded-xl px-5 py-2 text-sm font-semibold transition cursor-pointer ${
                hasReviewedRecommendations
                  ? 'bg-[#132E20] text-white hover:bg-[#1E432D] shadow-xs'
                  : 'cursor-not-allowed bg-slate-100 text-slate-400'
              }`}
            >
              Começar estruturação
            </button>
          ) : (
            <button
              type="button"
              disabled={isSaving}
              onClick={continueStep}
              className="inline-flex items-center gap-2 rounded-xl bg-[#132E20] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1E432D] shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : step === 5 ? (
                <>
                  <FileCheck2 className="h-4 w-4" />
                  Criar Monitor de IA
                </>
              ) : (
                'Continuar'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

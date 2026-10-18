export interface QuestionBankSubsubtopic {
  id: string;
  name: string;
  questionCount: number;
  examProfileIds: string[];
  questionCountsByProfile: Record<string, number>;
}

export interface QuestionBankSubtopic {
  id: string;
  name: string;
  questionCount: number;
  examProfileIds: string[];
  questionCountsByProfile: Record<string, number>;
  subsubtopics: QuestionBankSubsubtopic[];
}

export interface QuestionBankTopic {
  id: string;
  name: string;
  totalQuestions: number;
  examProfileIds: string[];
  questionCountsByProfile: Record<string, number>;
  subtopics: QuestionBankSubtopic[];
}

export interface QuestionBankSubject {
  id: string;
  name: string;
  category: string;
  totalQuestions: number;
  examProfileIds: string[];
  questionCountsByProfile: Record<string, number>;
  topics: QuestionBankTopic[];
}

export interface ExamProfile {
  id: string;
  name: string;
  examType?: string;
  board?: string | null;
  category: string;
  description: string;
  badge: string;
  questionCount: number;
}

export interface QuestionBankSelectionDraft {
  subject: string;
  topic: string;
  examType: string;
  board: string | null;
  subtopic: string | null;
  subsubtopic: string | null;
}

type ProfileCountedNode = {
  examProfileIds: string[];
  questionCountsByProfile: Record<string, number>;
};

export function getQuestionCountForProfiles(node: ProfileCountedNode, selectedProfileIds: string[]): number {
  return selectedProfileIds.reduce((total, profileId) => {
    if (!node.examProfileIds.includes(profileId)) return total;
    const count = node.questionCountsByProfile[profileId] ?? 0;
    return total + (count > 0 ? count : 0);
  }, 0);
}

export function filterQuestionBankCatalogByProfiles(
  subjects: QuestionBankSubject[],
  selectedProfileIds: string[],
): QuestionBankSubject[] {
  if (selectedProfileIds.length === 0) return [];

  return subjects.flatMap((subject) => {
    const subjectCount = getQuestionCountForProfiles(subject, selectedProfileIds);
    if (subjectCount === 0) return [];

    const topics = subject.topics.flatMap((topic) => {
      const topicCount = getQuestionCountForProfiles(topic, selectedProfileIds);
      if (topicCount === 0) return [];

      const subtopics = topic.subtopics.flatMap((subtopic) => {
        const subtopicCount = getQuestionCountForProfiles(subtopic, selectedProfileIds);
        if (subtopicCount === 0) return [];

        if (subtopic.subsubtopics.length === 0) {
          return [{ ...subtopic, questionCount: subtopicCount }];
        }

        const subsubtopics = subtopic.subsubtopics.flatMap((subsubtopic) => {
          const count = getQuestionCountForProfiles(subsubtopic, selectedProfileIds);
          return count > 0 ? [{ ...subsubtopic, questionCount: count }] : [];
        });
        return subsubtopics.length > 0
          ? [{ ...subtopic, questionCount: subtopicCount, subsubtopics }]
          : [];
      });

      return subtopics.length > 0 ? [{ ...topic, totalQuestions: topicCount, subtopics }] : [];
    });

    return topics.length > 0 ? [{ ...subject, totalQuestions: subjectCount, topics }] : [];
  });
}

export function buildQuestionBankSelections(input: {
  catalogSubjects: QuestionBankSubject[];
  selectedCatalogSubtopics: Record<string, string[]>;
  selectedExamProfiles: string[];
  examProfilesList: ExamProfile[];
}): QuestionBankSelectionDraft[] {
  const profileById = new Map(input.examProfilesList.map((profile) => [profile.id, profile]));
  const selectedProfileIds = new Set(input.selectedExamProfiles);
  const selections: QuestionBankSelectionDraft[] = [];

  const appendSelections = (
    subject: QuestionBankSubject,
    topic: QuestionBankTopic,
    subtopic: QuestionBankSubtopic,
    leaf: ProfileCountedNode & { id: string; name: string },
    selectedLeafIds: Set<string>,
    subsubtopic: QuestionBankSubsubtopic | null,
  ) => {
    if (!selectedLeafIds.has(leaf.id)) return;

    for (const profileId of leaf.examProfileIds) {
      if (!selectedProfileIds.has(profileId)) continue;
      const profile = profileById.get(profileId);
      if (!profile || getQuestionCountForProfiles(leaf, [profileId]) === 0) continue;

      selections.push({
        subject: subject.name,
        topic: topic.name,
        examType: profile.examType || profile.name,
        board: profile.board || null,
        subtopic: subtopic.name,
        subsubtopic: subsubtopic?.name || null,
      });
    }
  };

  for (const subject of input.catalogSubjects) {
    const selectedLeafIds = new Set(input.selectedCatalogSubtopics[subject.id] || []);
    if (selectedLeafIds.size === 0) continue;

    for (const topic of subject.topics) {
      for (const subtopic of topic.subtopics) {
        if (subtopic.subsubtopics.length > 0) {
          for (const subsubtopic of subtopic.subsubtopics) {
            appendSelections(subject, topic, subtopic, subsubtopic, selectedLeafIds, subsubtopic);
          }
        } else {
          appendSelections(subject, topic, subtopic, subtopic, selectedLeafIds, null);
        }
      }
    }
  }

  return selections;
}

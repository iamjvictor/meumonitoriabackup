import { describe, expect, it } from 'vitest';
import {
  buildQuestionBankSelections,
  filterQuestionBankCatalogByProfiles,
  getQuestionCountForProfiles,
  type ExamProfile,
  type QuestionBankSubject,
} from '../../src/modules/teacher/components/question-bank-catalog';

const profiles: ExamProfile[] = [
  { id: 'enem', name: 'ENEM', examType: 'ENEM', board: null, category: 'Vestibulares & ENEM', description: 'ENEM', badge: 'OFICIAL', questionCount: 5 },
  { id: 'concurso-fgv', name: 'FGV', examType: 'CONCURSO', board: 'FGV', category: 'Concursos', description: 'FGV', badge: 'OFICIAL', questionCount: 12 },
];

const catalog: QuestionBankSubject[] = [{
  id: 'matematica',
  name: 'Matemática',
  category: 'Exatas',
  totalQuestions: 17,
  examProfileIds: ['enem', 'concurso-fgv'],
  questionCountsByProfile: { enem: 5, 'concurso-fgv': 12 },
  topics: [{
    id: 'algebra',
    name: 'Álgebra',
    totalQuestions: 17,
    examProfileIds: ['enem', 'concurso-fgv'],
    questionCountsByProfile: { enem: 5, 'concurso-fgv': 12 },
    subtopics: [
      {
        id: 'linear', name: 'Álgebra Linear', questionCount: 10,
        examProfileIds: ['enem', 'concurso-fgv'], questionCountsByProfile: { enem: 3, 'concurso-fgv': 7 },
        subsubtopics: [{
          id: 'matrizes', name: 'Matrizes', questionCount: 10,
          examProfileIds: ['enem', 'concurso-fgv'], questionCountsByProfile: { enem: 3, 'concurso-fgv': 7 },
        }],
      },
      {
        id: 'funcoes', name: 'Funções', questionCount: 2,
        examProfileIds: ['enem'], questionCountsByProfile: { enem: 2 }, subsubtopics: [],
      },
      {
        id: 'geometria', name: 'Geometria', questionCount: 5,
        examProfileIds: ['concurso-fgv'], questionCountsByProfile: { 'concurso-fgv': 5 }, subsubtopics: [],
      },
    ],
  }],
}];

describe('profile-aware question bank catalog', () => {
  it('filters subjects and taxonomy nodes to selected profiles', () => {
    const filtered = filterQuestionBankCatalogByProfiles(catalog, ['concurso-fgv']);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.totalQuestions).toBe(12);
    expect(filtered[0]?.topics[0]?.totalQuestions).toBe(12);
    expect(filtered[0]?.topics[0]?.subtopics.map(({ id }) => id)).toEqual(['linear', 'geometria']);
    expect(filtered[0]?.topics[0]?.subtopics[0]?.questionCount).toBe(7);
    expect(filtered[0]?.topics[0]?.subtopics[0]?.subsubtopics[0]?.questionCount).toBe(7);
  });

  it('sums only selected profile counts', () => {
    const subject = catalog[0]!;
    const matrices = subject.topics[0]!.subtopics[0]!.subsubtopics[0]!;

    expect(getQuestionCountForProfiles(matrices, ['concurso-fgv'])).toBe(7);
    expect(getQuestionCountForProfiles(matrices, ['enem', 'concurso-fgv'])).toBe(10);
    expect(getQuestionCountForProfiles(matrices, ['unknown'])).toBe(0);
  });

  it('builds selections only for profiles that contain a checked leaf', () => {
    const selections = buildQuestionBankSelections({
      catalogSubjects: catalog,
      selectedCatalogSubtopics: { matematica: ['matrizes', 'funcoes', 'geometria'] },
      selectedExamProfiles: ['enem', 'concurso-fgv'],
      examProfilesList: profiles,
    });

    expect(selections.map(({ subtopic, subsubtopic, examType, board }) => ({ subtopic, subsubtopic, examType, board }))).toEqual([
      { subtopic: 'Álgebra Linear', subsubtopic: 'Matrizes', examType: 'ENEM', board: null },
      { subtopic: 'Álgebra Linear', subsubtopic: 'Matrizes', examType: 'CONCURSO', board: 'FGV' },
      { subtopic: 'Funções', subsubtopic: null, examType: 'ENEM', board: null },
      { subtopic: 'Geometria', subsubtopic: null, examType: 'CONCURSO', board: 'FGV' },
    ]);
  });
});

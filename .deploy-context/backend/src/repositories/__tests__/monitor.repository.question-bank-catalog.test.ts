import assert from 'node:assert/strict';
import test from 'node:test';
import { MonitorRepository } from '../monitor.repository.js';

test('mantém examType e board separados no perfil do catálogo', () => {
  const repository = new MonitorRepository();
  const buildCatalog = (repository as unknown as {
    buildTaxonomyFromQuestionBank: (rows: unknown[]) => {
      examProfiles: Array<{ id: string; name: string; examType: string; board: string | null }>;
    };
  }).buildTaxonomyFromQuestionBank.bind(repository);

  const catalog = buildCatalog([
    { board: 'FGV', exam_type: 'CONCURSO', subject: 'Português', topic: 'Gramática', subtopic: null, subsubtopic: null, count: 3 },
    { board: null, exam_type: 'ENEM', subject: 'Português', topic: 'Gramática', subtopic: null, subsubtopic: null, count: 2 },
  ]);

  assert.deepEqual(catalog.examProfiles.map(({ name, examType, board }) => ({ name, examType, board })), [
    { name: 'FGV', examType: 'CONCURSO', board: 'FGV' },
    { name: 'ENEM', examType: 'ENEM', board: null },
  ]);
  assert.equal(catalog.examProfiles[0]?.id, 'concurso-fgv');
  assert.equal(catalog.examProfiles[1]?.id, 'enem');
});

test('returns per-profile counts at every taxonomy level when taxonomy is shared', () => {
  const repository = new MonitorRepository();
  const buildCatalog = (repository as unknown as {
    buildTaxonomyFromQuestionBank: (rows: unknown[]) => {
      subjects: Array<{
        totalQuestions: number;
        examProfileIds: string[];
        questionCountsByProfile: Record<string, number>;
        topics: Array<{
          totalQuestions: number;
          examProfileIds: string[];
          questionCountsByProfile: Record<string, number>;
          subtopics: Array<{
            name: string;
            questionCount: number;
            examProfileIds: string[];
            questionCountsByProfile: Record<string, number>;
            subsubtopics: Array<{
              name: string;
              questionCount: number;
              examProfileIds: string[];
              questionCountsByProfile: Record<string, number>;
            }>;
          }>;
        }>;
      }>;
    };
  }).buildTaxonomyFromQuestionBank.bind(repository);

  const catalog = buildCatalog([
    { board: null, exam_type: 'ENEM', subject: 'Matemática', topic: 'Álgebra', subtopic: 'Álgebra Linear', subsubtopic: 'Matrizes', count: 3 },
    { board: null, exam_type: 'ENEM', subject: 'Matemática', topic: 'Álgebra', subtopic: 'Funções', subsubtopic: null, count: 2 },
    { board: 'FGV', exam_type: 'CONCURSO', subject: 'Matemática', topic: 'Álgebra', subtopic: 'Álgebra Linear', subsubtopic: 'Matrizes', count: 7 },
    { board: 'FGV', exam_type: 'CONCURSO', subject: 'Matemática', topic: 'Álgebra', subtopic: 'Geometria', subsubtopic: null, count: 5 },
  ]);
  const subject = catalog.subjects[0]!;
  const topic = subject.topics[0]!;
  const linearAlgebra = topic.subtopics.find(({ name }) => name === 'Álgebra Linear')!;
  const matrices = linearAlgebra.subsubtopics[0]!;
  const functions = topic.subtopics.find(({ name }) => name === 'Funções')!;
  const geometry = topic.subtopics.find(({ name }) => name === 'Geometria')!;

  assert.equal(subject.totalQuestions, 17);
  assert.deepEqual(subject.examProfileIds, ['enem', 'concurso-fgv']);
  assert.deepEqual(subject.questionCountsByProfile, { enem: 5, 'concurso-fgv': 12 });
  assert.equal(topic.totalQuestions, 17);
  assert.deepEqual(topic.questionCountsByProfile, { enem: 5, 'concurso-fgv': 12 });
  assert.equal(linearAlgebra.questionCount, 10);
  assert.deepEqual(linearAlgebra.examProfileIds, ['enem', 'concurso-fgv']);
  assert.deepEqual(linearAlgebra.questionCountsByProfile, { enem: 3, 'concurso-fgv': 7 });
  assert.equal(matrices.questionCount, 10);
  assert.deepEqual(matrices.questionCountsByProfile, { enem: 3, 'concurso-fgv': 7 });
  assert.equal(functions.questionCount, 2);
  assert.deepEqual(functions.examProfileIds, ['enem']);
  assert.deepEqual(functions.questionCountsByProfile, { enem: 2 });
  assert.equal(geometry.questionCount, 5);
  assert.deepEqual(geometry.examProfileIds, ['concurso-fgv']);
  assert.deepEqual(geometry.questionCountsByProfile, { 'concurso-fgv': 5 });
});

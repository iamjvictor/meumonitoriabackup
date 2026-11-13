import type { IntelligenceMetrics, IntelligenceMonitorDetail, IntelligenceOverview, IntelligencePeriod, IntelligenceStudentDetail } from './TeacherIntelligenceService';

const names = ['Ana', 'Bruno', 'Camila', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Lucas', 'Mariana', 'Matheus', 'Natália', 'Pedro', 'Rafaela', 'Samuel', 'Sofia', 'Victor'];
const surnames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Costa'];
const students = Array.from({ length: 50 }, (_, index) => {
  const fullName = `${names[index % names.length]} ${surnames[Math.floor(index / names.length)]} ${String(index + 1).padStart(2, '0')}`;
  return { id: `demo-aluno-${index + 1}`, fullName, email: `aluno${index + 1}@exemplo.test`, attemptCount: 18 + index * 2, accuracy: 52 + index % 40, lastActivityAt: new Date(Date.now() - (index % 18) * 86400000).toISOString() };
});
const monitors = [
  { id: 'demo-monitor-1', name: 'Preparação para Concursos', range: [0, 25] },
  { id: 'demo-monitor-2', name: 'Revisão e Prática', range: [25, 50] },
];
const topics = [
  { name: 'Interpretação de texto', accuracy: 88, attempts: 126, studentCount: 24 },
  { name: 'Porcentagem', accuracy: 82, attempts: 102, studentCount: 21 },
  { name: 'Raciocínio lógico', accuracy: 77, attempts: 91, studentCount: 19 },
  { name: 'Equações', accuracy: 54, attempts: 83, studentCount: 18 },
  { name: 'Probabilidade', accuracy: 48, attempts: 76, studentCount: 16 },
  { name: 'Geometria', accuracy: 42, attempts: 69, studentCount: 15 },
];
function metrics(rows: typeof students): IntelligenceMetrics {
  return { studentCount: rows.length, activeStudentCount: rows.length, attemptCount: rows.reduce((sum, row) => sum + row.attemptCount, 0), accuracy: rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length, accuracyStudentCount: rows.length, averagePracticeDays: 11.4 };
}
function findMonitor(id: string) {
  const monitor = monitors.find((item) => item.id === id);
  if (!monitor) throw new Error('Monitor de demonstração não encontrado.');
  return monitor;
}
export const intelligenceDemo = {
  overview(period: IntelligencePeriod): IntelligenceOverview {
    return { period, generatedAt: new Date().toISOString(), metrics: metrics(students), monitors: monitors.map((monitor) => ({ id: monitor.id, name: monitor.name, metrics: metrics(students.slice(...monitor.range as [number, number])) })) };
  },
  monitor(id: string, options: { period: IntelligencePeriod; page: number; pageSize: number; search?: string }): IntelligenceMonitorDetail {
    const monitor = findMonitor(id);
    const rows = students.slice(...monitor.range as [number, number]);
    const matches = rows.filter((student) => student.fullName.toLocaleLowerCase('pt-BR').includes((options.search ?? '').toLocaleLowerCase('pt-BR')));
    return { period: options.period, monitor: { id, name: monitor.name }, metrics: metrics(rows), topics: { strongest: topics.slice(0, 3), needsAttention: topics.slice(3) }, students: matches.slice((options.page - 1) * options.pageSize, options.page * options.pageSize), pagination: { page: options.page, pageSize: options.pageSize, total: matches.length } };
  },
  student(monitorId: string, studentId: string, period: IntelligencePeriod): IntelligenceStudentDetail {
    const monitor = findMonitor(monitorId);
    const student = students.slice(...monitor.range as [number, number]).find((item) => item.id === studentId);
    if (!student) throw new Error('Aluno de demonstração não encontrado.');
    return { period, monitor: { id: monitor.id, name: monitor.name }, student: { id: student.id, fullName: student.fullName, email: student.email }, metrics: { attemptCount: student.attemptCount, correctCount: Math.round(student.attemptCount * student.accuracy / 100), accuracy: student.accuracy, practiceDays: 12, lastActivityAt: student.lastActivityAt, flashcardReviewCount: 37 }, topicPerformance: topics.map((topic, index) => ({ subject: index === 0 ? 'Português' : 'Matemática', topic: topic.name, attemptCount: 10 + index, accuracy: topic.accuracy })) };
  },
};

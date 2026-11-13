import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { localPracticeDay, splitTopicLeaders } from './teacher-intelligence.metrics.js';

type Period = '7d' | '30d' | '90d' | 'all';
const periodStart = (period: Period) => period === 'all' ? undefined : new Date(Date.now() - Number(period.slice(0, -1)) * 86_400_000);

function summarize(attempts: Array<{ studentId: string; isCorrect: boolean; answeredAt: Date }>, practiceDays: Map<string, Set<string>>, studentIds: string[]) {
  const perStudent = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    const row = perStudent.get(attempt.studentId) ?? { total: 0, correct: 0 };
    row.total += 1; row.correct += Number(attempt.isCorrect); perStudent.set(attempt.studentId, row);
  }
  const accuracies = [...perStudent.values()].map((row) => row.correct / row.total * 100);
  const activeIds = new Set([...practiceDays].filter(([, days]) => days.size > 0).map(([id]) => id));
  return {
    studentCount: studentIds.length,
    activeStudentCount: studentIds.filter((id) => activeIds.has(id)).length,
    attemptCount: attempts.length,
    accuracy: accuracies.length ? accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length : null,
    accuracyStudentCount: accuracies.length,
    averagePracticeDays: studentIds.length ? studentIds.reduce((sum, id) => sum + (practiceDays.get(id)?.size ?? 0), 0) / studentIds.length : 0,
  };
}

export async function teacherIntelligenceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.get('/overview', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    if (request.user.role !== 'teacher') return reply.code(403).send({ error: 'FORBIDDEN' });
    const query = request.query as { period?: Period };
    const period: Period = ['7d', '30d', '90d', 'all'].includes(query.period ?? '') ? query.period! : '30d';
    const start = periodStart(period);
    const teacher = await prisma.teacher.findUnique({ where: { userId: request.user.id }, select: { id: true } });
    if (!teacher) return reply.code(404).send({ error: 'TEACHER_NOT_FOUND' });
    const monitors = await prisma.monitor.findMany({ where: { teacherId: teacher.id }, select: { id: true, name: true, avatarUrl: true } });
    const monitorIds = monitors.map((monitor) => monitor.id);
    const enrollments = await prisma.studentEnrollment.findMany({ where: { monitorId: { in: monitorIds }, status: 'ACTIVE', ...(start ? { startsAt: { lte: new Date() } } : {}) }, select: { studentId: true, monitorId: true } });
    const attempts = await prisma.studentQuestionAttempt.findMany({ where: { monitorId: { in: monitorIds }, status: 'ACTIVE', ...(start ? { answeredAt: { gte: start } } : {}) }, select: { studentId: true, monitorId: true, isCorrect: true, answeredAt: true } });
    const reviews = await prisma.studentFlashcardReviewLog.findMany({ where: { flashcard: { monitorId: { in: monitorIds } }, ...(start ? { reviewedAt: { gte: start } } : {}) }, select: { studentId: true, flashcard: { select: { monitorId: true } }, reviewedAt: true } });
    const studentIds = [...new Set(enrollments.map((row) => row.studentId))];
    const days = new Map<string, Set<string>>();
    for (const attempt of attempts) { const set = days.get(attempt.studentId) ?? new Set<string>(); set.add(localPracticeDay(attempt.answeredAt)); days.set(attempt.studentId, set); }
    for (const review of reviews) { const set = days.get(review.studentId) ?? new Set<string>(); set.add(localPracticeDay(review.reviewedAt)); days.set(review.studentId, set); }
    const perMonitor = monitors.map((monitor) => {
      const ids = [...new Set(enrollments.filter((row) => row.monitorId === monitor.id).map((row) => row.studentId))];
      const monitorDays = new Map(ids.map((id) => [id, days.get(id) ?? new Set<string>()]));
      return { ...monitor, metrics: summarize(attempts.filter((row) => row.monitorId === monitor.id), monitorDays, ids) };
    });
    return reply.send({ data: { period, generatedAt: new Date().toISOString(), metrics: summarize(attempts, days, studentIds), monitors: perMonitor } });
  });

  app.get('/monitors/:monitorId', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    if (request.user.role !== 'teacher') return reply.code(403).send({ error: 'FORBIDDEN' });
    const { monitorId } = request.params as { monitorId: string };
    const query = request.query as { period?: Period; page?: string; pageSize?: string; search?: string; sort?: string };
    const period: Period = ['7d', '30d', '90d', 'all'].includes(query.period ?? '') ? query.period! : '30d';
    const teacher = await prisma.teacher.findUnique({ where: { userId: request.user.id }, select: { id: true } });
    const monitor = teacher && await prisma.monitor.findFirst({ where: { id: monitorId, teacherId: teacher.id }, select: { id: true, name: true } });
    if (!monitor) return reply.code(404).send({ error: 'MONITOR_NOT_FOUND' });
    const start = periodStart(period);
    const page = Math.max(1, Number(query.page) || 1); const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const enrollmentWhere = { monitorId, status: 'ACTIVE', student: query.search ? { fullName: { contains: query.search, mode: 'insensitive' as const } } : undefined };
    const [enrollments, count, attempts] = await Promise.all([
      prisma.studentEnrollment.findMany({ where: enrollmentWhere, include: { student: { select: { id: true, fullName: true, email: true, avatarUrl: true } } }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.studentEnrollment.count({ where: enrollmentWhere }),
      prisma.studentQuestionAttempt.findMany({ where: { monitorId, status: 'ACTIVE', ...(start ? { answeredAt: { gte: start } } : {}) }, select: { studentId: true, isCorrect: true, answeredAt: true, question: { select: { topicId: true, topic: { select: { name: true } } } } } }),
    ]);
    const ids = enrollments.map((row) => row.studentId);
    const filteredAttempts = attempts.filter((row) => ids.includes(row.studentId));
    const emptyDays = new Map(ids.map((id) => [id, new Set<string>()]));
    const grouped = new Map<string, { name: string; correct: number; total: number; students: Set<string> }>();
    for (const attempt of filteredAttempts) if (attempt.question.topicId) { const key = attempt.question.topicId; const row = grouped.get(key) ?? { name: attempt.question.topic?.name ?? 'Tópico', correct: 0, total: 0, students: new Set<string>() }; row.total++; row.correct += Number(attempt.isCorrect); row.students.add(attempt.studentId); grouped.set(key, row); }
    const topics = [...grouped.values()].filter((row) => row.total >= 5 && row.students.size >= 2).map((row) => ({ name: row.name, accuracy: row.correct / row.total * 100, attempts: row.total, studentCount: row.students.size }));
    const rankedTopics = splitTopicLeaders(topics);
    return reply.send({ data: { period, monitor, metrics: summarize(filteredAttempts, emptyDays, ids), topics: rankedTopics, students: enrollments.map((row) => { const own = filteredAttempts.filter((attempt) => attempt.studentId === row.studentId); const count = own.length; return { ...row.student, attemptCount: count, accuracy: count ? own.filter((item) => item.isCorrect).length / count * 100 : null, lastActivityAt: own.reduce<Date | null>((last, item) => !last || item.answeredAt > last ? item.answeredAt : last, null) }; }), pagination: { page, pageSize, total: count } } });
  });

  app.get('/monitors/:monitorId/students/:studentId', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    if (request.user.role !== 'teacher') return reply.code(403).send({ error: 'FORBIDDEN' });
    const { monitorId, studentId } = request.params as { monitorId: string; studentId: string };
    const teacher = await prisma.teacher.findUnique({ where: { userId: request.user.id }, select: { id: true } });
    const enrollment = teacher && await prisma.studentEnrollment.findFirst({ where: { studentId, monitorId, status: 'ACTIVE', monitor: { teacherId: teacher.id } }, include: { student: { select: { id: true, fullName: true, email: true } }, monitor: { select: { id: true, name: true } } } });
    if (!enrollment) return reply.code(404).send({ error: 'STUDENT_NOT_FOUND' });
    const query = request.query as { period?: Period }; const period: Period = ['7d', '30d', '90d', 'all'].includes(query.period ?? '') ? query.period! : '30d'; const start = periodStart(period);
    const attempts = await prisma.studentQuestionAttempt.findMany({ where: { studentId, monitorId, status: 'ACTIVE', ...(start ? { answeredAt: { gte: start } } : {}) }, select: { isCorrect: true, answeredAt: true, question: { select: { subject: { select: { name: true } }, topic: { select: { name: true } } } } }, orderBy: { answeredAt: 'asc' } });
    const accuracy = attempts.length ? attempts.filter((row) => row.isCorrect).length / attempts.length * 100 : null;
    const byTopic = new Map<string, { subject: string; total: number; correct: number }>();
    for (const row of attempts) { const name = row.question.topic?.name; if (!name) continue; const value = byTopic.get(name) ?? { subject: row.question.subject.name, total: 0, correct: 0 }; value.total++; value.correct += Number(row.isCorrect); byTopic.set(name, value); }
    const reviews = await prisma.studentFlashcardReviewLog.count({ where: { studentId, flashcard: { monitorId }, ...(start ? { reviewedAt: { gte: start } } : {}) } });
    return reply.send({ data: { period, student: enrollment.student, monitor: enrollment.monitor, metrics: { attemptCount: attempts.length, correctCount: attempts.filter((row) => row.isCorrect).length, accuracy, practiceDays: new Set(attempts.map((row) => row.answeredAt.toISOString().slice(0, 10))).size, lastActivityAt: attempts.at(-1)?.answeredAt ?? null, flashcardReviewCount: reviews }, topicPerformance: [...byTopic].map(([topic, value]) => ({ topic, subject: value.subject, attemptCount: value.total, accuracy: value.correct / value.total * 100 })) } });
  });
}

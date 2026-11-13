import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { env } from '../../../config/env.js';
import { legacyStudentEnrollmentEnvironmentFilter } from '../../access/infrastructure/legacy-access-environment.js';

export function buildActiveSponsoredSeatWhere(studentId: string, monitorId?: string, now = new Date(), environment = env.ASAAS_ENV.toUpperCase()) {
  return {
    studentId,
    status: 'ACTIVE',
    accessRevokedAt: null,
    batch: { environment, ...(monitorId ? { monitorId } : {}) },
    startsAt: { lte: now },
    endsAt: { gt: now },
  };
}

export class DailyChallengeRepository {
  findEligibleMonitors() {
    return prisma.monitor.findMany({ where: { status: 'PUBLISHED' }, select: { id: true } });
  }

  findApprovedUnusedQuestions(monitorId: string) {
    return prisma.question.findMany({
      where: {
        monitorId,
        status: 'APPROVED',
        dailyChallenges: { none: {} },
      },
      select: { id: true },
    });
  }

  findByMonitorAndDate(monitorId: string, challengeDate: string) {
    return prisma.dailyChallenge.findUnique({
      where: { monitorId_challengeDate: { monitorId, challengeDate: new Date(`${challengeDate}T00:00:00.000Z`) } },
      include: { question: { include: { subject: true, topic: true } } },
    });
  }

  findCurrentForStudent(monitorId: string, challengeDate: string, studentId: string) {
    return prisma.dailyChallenge.findFirst({
      where: {
        monitorId,
        challengeDate: new Date(`${challengeDate}T00:00:00.000Z`),
        question: { status: 'APPROVED' },
      },
      include: {
        question: { include: { subject: true, topic: true } },
        attempts: { where: { studentId }, select: { id: true, isCorrect: true, answeredAt: true } },
      },
    });
  }

  async isMonitorOwner(userId: string, monitorId: string): Promise<boolean> {
    const teacher = await prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) return false;
    const monitor = await prisma.monitor.findFirst({ where: { id: monitorId, teacherId: teacher.id }, select: { id: true } });
    return Boolean(monitor);
  }

  findStudentByUserId(userId: string) {
    return prisma.student.findUnique({ where: { userId }, select: { id: true, fullName: true, email: true } });
  }

  async findActiveEnrollment(studentId: string, monitorId: string) {
    const now = new Date();
    const enrollment = await prisma.studentEnrollment.findFirst({ where: { studentId, monitorId, status: 'ACTIVE', ...legacyStudentEnrollmentEnvironmentFilter(), startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { id: true } });
    if (enrollment) return enrollment;
    return prisma.sponsoredSeat.findFirst({ where: buildActiveSponsoredSeatWhere(studentId, monitorId), select: { id: true } });
  }

  async findActiveEnrollmentMonitorIds(studentId: string) {
    const [enrollments, seats] = await Promise.all([
      prisma.studentEnrollment.findMany({ where: { studentId, status: 'ACTIVE', ...legacyStudentEnrollmentEnvironmentFilter(), startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, select: { monitorId: true } }),
      prisma.sponsoredSeat.findMany({ where: buildActiveSponsoredSeatWhere(studentId), select: { batch: { select: { monitorId: true } } } }),
    ]);
    return [...new Set([...enrollments.map((enrollment) => enrollment.monitorId), ...seats.map((seat) => seat.batch.monitorId)])];
  }

  findCurrentForStudentMonitors(monitorIds: string[], challengeDate: string, studentId: string) {
    return prisma.dailyChallenge.findMany({
      where: { monitorId: { in: monitorIds }, challengeDate: new Date(`${challengeDate}T00:00:00.000Z`) },
      orderBy: { monitorId: 'asc' },
      include: {
        question: { include: { subject: true, topic: true } },
        attempts: { where: { studentId }, select: { id: true, isCorrect: true, answeredAt: true } },
      },
    });
  }

  getChallengeForAnswer(challengeId: string) {
    return prisma.dailyChallenge.findUnique({ where: { id: challengeId }, include: { question: true } });
  }

  createChallenge(data: Prisma.DailyChallengeCreateInput) {
    return prisma.dailyChallenge.create({ data });
  }

  async answerChallenge(data: {
    studentId: string;
    challengeId: string;
    selectedAnswer: string;
    responseTimeMs?: number;
    answeredAt: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      const challenge = await tx.dailyChallenge.findUniqueOrThrow({
        where: { id: data.challengeId },
        include: { question: true },
      });
      const existing = await tx.dailyChallengeAttempt.findUnique({
        where: { dailyChallengeId_studentId: { dailyChallengeId: data.challengeId, studentId: data.studentId } },
        include: { questionAttempt: true },
      });
      if (existing) return { alreadyAnswered: true as const, challenge, attempt: existing };

      const normalizedSelected = data.selectedAnswer.trim().toUpperCase();
      const normalizedCorrect = challenge.question.correctAnswer?.trim().toUpperCase();
      const isCorrect = Boolean(normalizedCorrect && normalizedSelected === normalizedCorrect);
      const questionAttempt = await tx.studentQuestionAttempt.create({
        data: {
          studentId: data.studentId,
          questionId: challenge.questionId,
          monitorId: challenge.monitorId,
          dailyChallengeId: challenge.id,
          mode: 'DAILY_CHALLENGE',
          selectedAnswer: data.selectedAnswer.trim(),
          isCorrect,
          responseTimeMs: data.responseTimeMs,
          answeredAt: data.answeredAt,
        },
      });
      const attempt = await tx.dailyChallengeAttempt.create({
        data: {
          dailyChallengeId: challenge.id,
          studentId: data.studentId,
          questionAttemptId: questionAttempt.id,
          isCorrect,
          answeredAt: data.answeredAt,
        },
        include: { questionAttempt: true },
      });
      return { alreadyAnswered: false as const, challenge, attempt };
    });
  }

}

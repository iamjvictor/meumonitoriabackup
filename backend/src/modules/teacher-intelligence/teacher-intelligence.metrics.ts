export type AttemptMetric = { studentId: string; isCorrect: boolean; answeredAt: Date };
export type ActivityMetric = { studentId: string; at: Date };

export function localPracticeDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function summarize(attempts: AttemptMetric[], activity: ActivityMetric[], studentIds: string[]) {
  const perStudent = new Map<string, { total: number; correct: number }>();
  for (const item of attempts) {
    const row = perStudent.get(item.studentId) ?? { total: 0, correct: 0 };
    row.total += 1;
    row.correct += Number(item.isCorrect);
    perStudent.set(item.studentId, row);
  }
  const accuracies = [...perStudent.values()].map((row) => row.correct / row.total * 100);
  const days = new Map<string, Set<string>>();
  for (const item of activity) {
    const set = days.get(item.studentId) ?? new Set<string>();
    set.add(localPracticeDay(item.at));
    days.set(item.studentId, set);
  }
  const activeStudentCount = studentIds.filter((id) => (days.get(id)?.size ?? 0) > 0).length;
  return {
    studentCount: studentIds.length,
    activeStudentCount,
    inactiveStudentCount: Math.max(0, studentIds.length - activeStudentCount),
    attemptCount: attempts.length,
    accuracy: accuracies.length ? accuracies.reduce((sum, item) => sum + item, 0) / accuracies.length : null,
    accuracyStudentCount: accuracies.length,
    averagePracticeDays: studentIds.length ? studentIds.reduce((sum, id) => sum + (days.get(id)?.size ?? 0), 0) / studentIds.length : 0,
    practiceDaysByStudent: Object.fromEntries(studentIds.map((id) => [id, days.get(id)?.size ?? 0])),
  };
}

export function splitTopicLeaders<T extends { accuracy: number; attempts: number; name: string }>(topics: T[]) {
  const eligible = [...topics].sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts || a.name.localeCompare(b.name, 'pt-BR'));
  const bottom = eligible.slice(0, 3);
  const remaining = eligible.slice(bottom.length);
  return { needsAttention: bottom, strongest: remaining.slice(-3).reverse() };
}

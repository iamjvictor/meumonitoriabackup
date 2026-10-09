export function getRemainingSimulationSeconds(deadlineAt: string, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - now) / 1000));
}

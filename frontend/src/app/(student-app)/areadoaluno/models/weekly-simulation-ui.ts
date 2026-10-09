export type WeeklySimulationStatus =
  | 'AVAILABLE_TO_GENERATE'
  | 'PENDING'
  | 'PROCESSING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED_BY_PREVIOUS'
  | 'FAILED';

export function isWeeklySimulationPolling(status: WeeklySimulationStatus) {
  return status === 'PENDING' || status === 'PROCESSING';
}

export function isWeeklySimulationActionable(status: WeeklySimulationStatus) {
  return !isWeeklySimulationPolling(status);
}

export function getWeeklySimulationActionLabel(status: WeeklySimulationStatus) {
  switch (status) {
    case 'AVAILABLE_TO_GENERATE': return 'Gerar simulado';
    case 'PENDING':
    case 'PROCESSING': return 'Preparando simulado…';
    case 'READY': return 'Começar simulado';
    case 'IN_PROGRESS': return 'Continuar simulado';
    case 'COMPLETED': return 'Ver revisão';
    case 'BLOCKED_BY_PREVIOUS': return 'Continuar anterior';
    case 'FAILED': return 'Tentar novamente';
  }
}

export function findNextUnansweredIndex<T extends { answered: boolean }>(items: T[], fromIndex = 0) {
  if (items.length === 0) return -1;
  for (let offset = 0; offset < items.length; offset += 1) {
    const index = (fromIndex + offset) % items.length;
    if (!items[index].answered) return index;
  }
  return -1;
}

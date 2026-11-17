export const kanbanColumns = [
  ['AWAITING_ACCEPTANCE', 'Aguardando aceite'],
  ['IN_PROGRESS', 'Em andamento'],
  ['COMPLETED', 'Finalizado'],
] as const;

export const operationalColumns = kanbanColumns;
export const personalColumns = kanbanColumns;

export const kanbanFilterKeys = ['search', 'teamId', 'responsibleId', 'priority', 'status', 'overdue', 'deadlineTo'];

export function taskQuery(endpoint: string, filters: Record<string, string>, page = 1) {
  const query = new URLSearchParams({ page: String(page), pageSize: '100' });
  for (const key of kanbanFilterKeys) if (filters[key]) {
    const date = key === 'deadlineTo' ? new Date(`${filters[key]}T23:59:59.999`) : null;
    query.set(key, date && !Number.isNaN(date.getTime()) ? date.toISOString() : filters[key]);
  }
  return `${endpoint}?${query}`;
}

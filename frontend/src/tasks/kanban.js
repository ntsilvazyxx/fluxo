export const operationalColumns = [['PENDING', 'Pendente'], ['AWAITING_ACCEPTANCE', 'Aguardando aceite'], ['IN_PROGRESS', 'Em andamento']];
export const personalColumns = [['AWAITING_ACCEPTANCE', 'Aguardando aceite'], ['IN_PROGRESS', 'Em andamento'], ['COMPLETED', 'Concluídas']];
export const kanbanFilterKeys = ['search', 'teamId', 'responsibleId', 'priority', 'status', 'overdue', 'deadlineTo'];
export function taskQuery(endpoint, filters, page = 1) {
  const query = new URLSearchParams({ page: String(page), pageSize: '100' });
  for (const key of kanbanFilterKeys) if (filters[key]) {
    const date = key === 'deadlineTo' ? new Date(`${filters[key]}T23:59:59.999`) : null;
    query.set(key, date && !Number.isNaN(date.getTime()) ? date.toISOString() : filters[key]);
  }
  return `${endpoint}?${query}`;
}

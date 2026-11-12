import { calculateAssignmentMetrics } from '../time-accounting/time-accounting.js';

const ACTIVE = ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'];
const TERMINAL = ['COMPLETED', 'CANCELLED'];
const HOUR = 60 * 60 * 1000;

const scopedTasks = (actor) => actor.roleCode === 'SECRETARY'
  ? {}
  : { team: { managers: { some: { userId: actor.userId, endedAt: null } } } };

const isoDay = (value) => new Date(value).toISOString().slice(0, 10);
const countBy = (items, getter) => Object.entries(items.reduce((result, item) => {
  const key = getter(item);
  result[key] = (result[key] ?? 0) + 1;
  return result;
}, {})).map(([key, value]) => ({ key, value }));
const average = (values) => values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : 0;

function currentCycleFilter(filters, now) {
  const currentCycle = {};
  if (filters.status) currentCycle.status = filters.status;
  if (filters.priority) currentCycle.priority = filters.priority;
  if (filters.responsibleId) currentCycle.assignments = { some: { userId: filters.responsibleId, endedAt: null } };
  if (filters.deadlineSituation === 'OVERDUE') Object.assign(currentCycle, { status: { in: ACTIVE }, deadlineAt: { lt: now } });
  if (filters.deadlineSituation === 'DUE_SOON') Object.assign(currentCycle, { status: { in: ACTIVE }, deadlineAt: { gte: now, lte: new Date(now.getTime() + 24 * HOUR) } });
  if (filters.deadlineSituation === 'ON_TIME') Object.assign(currentCycle, { status: { in: ACTIVE }, deadlineAt: { gt: new Date(now.getTime() + 24 * HOUR) } });
  if (filters.deadlineSituation === 'NO_DEADLINE') currentCycle.deadlineAt = null;
  return currentCycle;
}

function taskWhere(actor, filters, now, { search } = {}) {
  const where = { deletedAt: null, ...scopedTasks(actor) };
  if (filters.teamId) where.teamId = filters.teamId;
  const cycle = currentCycleFilter(filters, now);
  if (Object.keys(cycle).length) where.currentCycle = cycle;
  if (search) {
    const number = /^\d+$/.test(search) ? BigInt(search) : null;
    where.OR = [{ currentCycle: { title: { contains: search } } }, ...(number ? [{ publicNumber: number }] : [])];
  }
  return where;
}

const assignmentInclude = {
  pauseIntervals: true,
  calendarVersion: { include: { calendar: true, schedules: true, exceptions: true } },
};
const taskInclude = {
  team: { select: { id: true, name: true } },
  currentCycle: { include: { assignments: { where: { endedAt: null }, include: { user: { select: { id: true, name: true } }, ...assignmentInclude } } } },
};

export const createDashboardService = ({ prisma }) => ({
  async summary(actor, filters) {
    const now = new Date();
    // Dashboard cards represent principal task identities only. Subtasks remain
    // available in the detailed report and are never rolled into their parent.
    const where = { ...taskWhere(actor, filters, now), parentCycleId: null };
    const tasks = await prisma.task.findMany({ where, include: taskInclude });
    const current = tasks.map((task) => ({ task, cycle: task.currentCycle })).filter(({ cycle }) => cycle);
    const scopedCycleWhere = { task: { deletedAt: null, parentCycleId: null, ...scopedTasks(actor), ...(filters.teamId ? { teamId: filters.teamId } : {}) } };
    const historicCycles = await prisma.taskCycle.findMany({
      where: scopedCycleWhere,
      select: { id: true, taskId: true, status: true, deadlineAt: true, openedAt: true, closedAt: true },
    });
    const openedInPeriod = historicCycles.filter((cycle) => (!filters.periodStart || cycle.openedAt >= filters.periodStart) && (!filters.periodEnd || cycle.openedAt <= filters.periodEnd));
    const terminalInPeriod = historicCycles.filter((cycle) => TERMINAL.includes(cycle.status) && cycle.closedAt && (!filters.periodStart || cycle.closedAt >= filters.periodStart) && (!filters.periodEnd || cycle.closedAt <= filters.periodEnd));
    const active = current.filter(({ cycle }) => ACTIVE.includes(cycle.status));
    const overdue = active.filter(({ cycle }) => cycle.deadlineAt && cycle.deadlineAt < now);
    const dueSoon = active.filter(({ cycle }) => cycle.deadlineAt && cycle.deadlineAt >= now && cycle.deadlineAt <= new Date(now.getTime() + 24 * HOUR));
    const assignments = current.flatMap(({ cycle }) => cycle.assignments).filter((assignment) => assignment.calendarVersion);
    const metrics = assignments.map((assignment) => calculateAssignmentMetrics(assignment, now));
    const completed = terminalInPeriod.filter((cycle) => cycle.status === 'COMPLETED').length;
    const cancelled = terminalInPeriod.filter((cycle) => cycle.status === 'CANCELLED').length;
    const onTime = terminalInPeriod.filter((cycle) => cycle.status === 'COMPLETED' && (!cycle.deadlineAt || cycle.closedAt <= cycle.deadlineAt)).length;
    const late = terminalInPeriod.filter((cycle) => cycle.status === 'COMPLETED' && cycle.deadlineAt && cycle.closedAt > cycle.deadlineAt).length;

    return {
      generatedAt: now,
      interpretation: {
        current: 'Contagens de situa\u00e7\u00e3o atual usam uma identidade permanente de tarefa e seu ciclo atual; subtarefas s\u00e3o registros independentes.',
        historical: 'S\u00e9ries hist\u00f3ricas contam ciclos: cria\u00e7\u00f5es por openedAt e encerramentos por closedAt dentro do per\u00edodo.',
        period: 'O per\u00edodo se aplica somente aos indicadores hist\u00f3ricos. A situa\u00e7\u00e3o atual sempre reflete a consulta no instante da gera\u00e7\u00e3o.',
      },
      cards: {
        totalCurrentTasks: current.length,
        pending: current.filter(({ cycle }) => cycle.status === 'PENDING').length,
        awaitingAcceptance: current.filter(({ cycle }) => cycle.status === 'AWAITING_ACCEPTANCE').length,
        inProgress: current.filter(({ cycle }) => cycle.status === 'IN_PROGRESS').length,
        overdue: overdue.length,
        dueSoon: dueSoon.length,
        createdCycles: openedInPeriod.length,
        completedCycles: completed,
        cancelledCycles: cancelled,
        completionRate: completed + cancelled ? Number(((completed / (completed + cancelled)) * 100).toFixed(1)) : 0,
      },
      charts: {
        byStatus: countBy(current, ({ cycle }) => cycle.status),
        byPriority: countBy(current, ({ cycle }) => cycle.priority),
        byTeam: countBy(current, ({ task }) => task.team.name),
        createdEvolution: countBy(openedInPeriod, (cycle) => isoDay(cycle.openedAt)),
        closedEvolution: countBy(terminalInPeriod, (cycle) => isoDay(cycle.closedAt)),
        completedOnTime: { onTime, late },
      },
      time: {
        assignmentsMeasured: metrics.length,
        averageWaitingMilliseconds: average(metrics.map((metric) => metric.waitingMilliseconds)),
        averageResponsibilityMilliseconds: average(metrics.map((metric) => metric.responsibilityMilliseconds)),
        averagePausedMilliseconds: average(metrics.map((metric) => metric.pausedMilliseconds)),
        averageEffectiveWorkingMilliseconds: average(metrics.map((metric) => metric.effectiveWorkingMilliseconds)),
      },
    };
  },

  async report(actor, filters) {
    const now = new Date();
    const where = taskWhere(actor, filters, now, { search: filters.search });
    if (filters.periodStart || filters.periodEnd) {
      where.currentCycle = { ...(where.currentCycle ?? {}), OR: [
        { openedAt: { ...(filters.periodStart ? { gte: filters.periodStart } : {}), ...(filters.periodEnd ? { lte: filters.periodEnd } : {}) } },
        { closedAt: { ...(filters.periodStart ? { gte: filters.periodStart } : {}), ...(filters.periodEnd ? { lte: filters.periodEnd } : {}) } },
      ] };
    }
    const skip = (filters.page - 1) * filters.pageSize;
    const orderBy = filters.sortBy === 'publicNumber' ? { publicNumber: filters.sortDirection } : { currentCycle: { [filters.sortBy]: filters.sortDirection } };
    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({ where, include: taskInclude, orderBy, skip, take: filters.pageSize }),
    ]);
    return {
      rows: tasks.map((task) => {
        const cycle = task.currentCycle;
        const assignment = cycle.assignments[0] ?? null;
        return {
          id: task.id, publicNumber: String(task.publicNumber), isSubtask: Boolean(task.parentCycleId),
          team: task.team, title: cycle.title, status: cycle.status, priority: cycle.priority,
          openedAt: cycle.openedAt, closedAt: cycle.closedAt, deadlineAt: cycle.deadlineAt,
          responsible: assignment?.user ?? null,
          overdue: Boolean(cycle.deadlineAt && ACTIVE.includes(cycle.status) && cycle.deadlineAt < now),
        };
      }),
      meta: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) },
    };
  },
});

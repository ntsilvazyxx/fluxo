import { AppError } from '../../shared/errors/app-error.js';

export const ACTIVE_STATUSES = ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'];
export const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'];

export const transitionTo = (status, action) => {
  const transitions = {
    assign: { PENDING: 'AWAITING_ACCEPTANCE', AWAITING_ACCEPTANCE: 'AWAITING_ACCEPTANCE', IN_PROGRESS: 'AWAITING_ACCEPTANCE' },
    accept: { AWAITING_ACCEPTANCE: 'IN_PROGRESS' },
    reject: { AWAITING_ACCEPTANCE: 'PENDING' },
    complete: { IN_PROGRESS: 'COMPLETED' },
    cancel: { PENDING: 'CANCELLED', AWAITING_ACCEPTANCE: 'CANCELLED', IN_PROGRESS: 'CANCELLED' },
  };
  const next = transitions[action]?.[status];
  if (!next) throw new AppError(409, 'INVALID_TASK_TRANSITION', `A ação ${action} não é permitida no estado ${status}.`);
  return next;
};

export const isOverdue = (cycle, now = new Date()) => Boolean(cycle.deadlineAt && ACTIVE_STATUSES.includes(cycle.status) && new Date(cycle.deadlineAt) < now);

export const requireExpectedVersion = (cycle, expectedVersion) => {
  if (cycle.version !== expectedVersion) throw new AppError(409, 'TASK_VERSION_CONFLICT', 'A tarefa foi alterada por outra pessoa. Atualize os dados e tente novamente.', { currentVersion: cycle.version });
};

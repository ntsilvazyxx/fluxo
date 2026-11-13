import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';

const ACCEPTANCE_DURATIONS = new Set([60, 120, 240, 480, 720, 1440]);
const EXECUTION_DURATIONS = new Set([720, 1440, 2880, 4320, 7200]);

const minutesToMs = (minutes) => minutes * 60 * 1000;

export const isValidAcceptanceDuration = (minutes) => ACCEPTANCE_DURATIONS.has(minutes);
export const isValidExecutionDuration = (minutes) => EXECUTION_DURATIONS.has(minutes);

export const createDeadlineService = ({ prisma }) => ({

  calculateAcceptanceDeadline(assignedAt, acceptanceDurationMinutes) {
    if (!isValidAcceptanceDuration(acceptanceDurationMinutes)) {
      throw new AppError(422, 'INVALID_ACCEPTANCE_DURATION', 'Duração de aceite inválida. Valores permitidos: 60, 120, 240, 480, 720, 1440 minutos.');
    }
    return new Date(assignedAt.getTime() + minutesToMs(acceptanceDurationMinutes));
  },

  calculateExecutionDeadline(acceptedAt, executionDurationMinutes) {
    if (!isValidExecutionDuration(executionDurationMinutes)) {
      throw new AppError(422, 'INVALID_EXECUTION_DURATION', 'Duração de execução inválida. Valores permitidos: 720, 1440, 2880, 4320, 7200 minutos.');
    }
    return new Date(acceptedAt.getTime() + minutesToMs(executionDurationMinutes));
  },

  calculateAcceptanceMetrics(assignment, now = new Date()) {
    const assignedAt = assignment.assignedAt;
    const acceptedAt = assignment.acceptedAt;
    const acceptanceDeadlineAt = assignment.acceptanceDeadlineAt;
    const acceptanceDurationMinutes = assignment.acceptanceDurationMinutes;

    const waitingMilliseconds = acceptedAt
      ? Math.max(0, acceptedAt.getTime() - assignedAt.getTime())
      : Math.max(0, now.getTime() - assignedAt.getTime());

    const acceptedWithinDeadline = acceptedAt && acceptanceDeadlineAt
      ? acceptedAt.getTime() <= acceptanceDeadlineAt.getTime()
      : null;

    const timeRemaining = acceptanceDeadlineAt
      ? Math.max(0, acceptanceDeadlineAt.getTime() - now.getTime())
      : null;

    const isOverdue = acceptanceDeadlineAt && !acceptedAt && now.getTime() > acceptanceDeadlineAt.getTime();

    return {
      assignedAt,
      acceptedAt,
      acceptanceDeadlineAt,
      acceptanceDurationMinutes,
      waitingMilliseconds,
      acceptedWithinDeadline,
      timeRemainingMilliseconds: timeRemaining,
      isOverdue,
      realTimeUsedMilliseconds: acceptedAt ? waitingMilliseconds : null,
    };
  },

  calculateExecutionMetrics(assignment, now = new Date()) {
    const acceptedAt = assignment.acceptedAt;
    const executionDeadlineAt = assignment.executionDeadlineAt;
    const executionDurationMinutes = assignment.executionDurationMinutes;
    const endedAt = assignment.endedAt;
    const end = endedAt ?? now;

    const responsibilityMilliseconds = acceptedAt ? Math.max(0, end.getTime() - acceptedAt.getTime()) : 0;
    const elapsedMilliseconds = acceptedAt ? Math.max(0, now.getTime() - acceptedAt.getTime()) : 0;

    let effectiveWorkingMilliseconds = 0;
    let isExecutionOverdue = false;
    let timeRemainingMilliseconds = null;

    if (acceptedAt && executionDeadlineAt) {
      isExecutionOverdue = !endedAt && now.getTime() > executionDeadlineAt.getTime();
      timeRemainingMilliseconds = Math.max(0, executionDeadlineAt.getTime() - now.getTime());
      effectiveWorkingMilliseconds = elapsedMilliseconds;
    }

    return {
      acceptedAt,
      executionDeadlineAt,
      executionDurationMinutes,
      endedAt,
      responsibilityMilliseconds,
      elapsedMilliseconds,
      effectiveWorkingMilliseconds,
      isExecutionOverdue,
      timeRemainingMilliseconds,
    };
  },

  shiftExecutionDeadlineForPause(cycleId, assignmentId, pauseDurationMinutes, prismaClient = prisma) {
    return prismaClient.taskCycle.updateMany({
      where: { id: cycleId, deadlinePolicy: 'RUNNING_CLOCK' },
      data: {
        executionDeadlineAt: {
          // Será ajustado na transação chamadora com base na pausa real
        },
      },
    });
  },

  async recordDeadlineChange(tx, cycleId, oldDeadlineAt, newDeadlineAt, kind, reason, changedById) {
    return tx.deadlineChange.create({
      data: {
        id: randomUUID(),
        cycleId,
        oldDeadlineAt,
        newDeadlineAt,
        kind,
        reason,
        changedById,
      },
    });
  },

  applyPauseToDeadline(currentDeadlineAt, pauseStartedAt, pauseEndedAt) {
    if (!currentDeadlineAt || !pauseStartedAt || !pauseEndedAt) return currentDeadlineAt;
    const pauseDurationMs = pauseEndedAt.getTime() - pauseStartedAt.getTime();
    return new Date(currentDeadlineAt.getTime() + pauseDurationMs);
  },

  validateAcceptanceWithinDeadline(acceptedAt, acceptanceDeadlineAt) {
    if (!acceptedAt || !acceptanceDeadlineAt) return null;
    return acceptedAt.getTime() <= acceptanceDeadlineAt.getTime();
  },

});

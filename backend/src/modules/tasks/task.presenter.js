import { isOverdue } from './task.policy.js';

export const presentAssignment = (assignment) => assignment ? ({
  id: assignment.id, userId: assignment.userId, assignedById: assignment.assignedById,
  assignedAt: assignment.assignedAt, acceptedAt: assignment.acceptedAt,
  endedAt: assignment.endedAt, endReason: assignment.endReason,
  ...(assignment.user ? { user: { id: assignment.user.id, name: assignment.user.name } } : {}),
}) : null;

export const presentTask = (task) => {
  const cycle = task.currentCycle;
  const assignment = cycle?.assignments?.find((item) => !item.endedAt) ?? null;
  return {
    id: task.id, publicNumber: String(task.publicNumber), team: task.team ? { id: task.team.id, name: task.team.name } : { id: task.teamId },
    parentCycleId: task.parentCycleId, createdAt: task.createdAt, updatedAt: task.updatedAt,
    cycle: cycle ? { id: cycle.id, cycleNumber: cycle.cycleNumber, title: cycle.title, description: cycle.description, priority: cycle.priority, status: cycle.status, deadlineAt: cycle.deadlineAt, version: cycle.version, openedAt: cycle.openedAt, closedAt: cycle.closedAt, completionText: cycle.completionText, overdue: isOverdue(cycle), assignment: presentAssignment(assignment) } : null,
  };
};

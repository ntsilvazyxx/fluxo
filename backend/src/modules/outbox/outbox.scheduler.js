import { randomUUID } from 'node:crypto';

export const createReminderScheduler = ({ prisma }) => {

  const scheduleDeadlineReminders = async ({ taskIds } = {}) => {
    const now = new Date();
    const soonThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const cycles = await prisma.taskCycle.findMany({
      where: {
        ...(taskIds ? { taskId: { in: taskIds } } : {}),
        closedAt: null,
        status: { in: ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'] },
        deadlineAt: { not: null, lte: soonThreshold },
      },
      include: {
        assignments: { where: { endedAt: null }, select: { userId: true } },
        deadlineChanges: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const created = [];

    for (const cycle of cycles) {
      if (!cycle.deadlineAt) continue;

      const effectiveDeadline = cycle.deadlineChanges?.[0]?.newDeadlineAt ?? cycle.deadlineAt;
      const isOverdue = new Date(effectiveDeadline) < now;
      const isSoon = !isOverdue && new Date(effectiveDeadline) <= soonThreshold;

      if (!isOverdue && !isSoon) continue;

      const eventType = isOverdue ? 'TASK_OVERDUE' : 'TASK_DEADLINE_SOON';
      const dedupeKey = `reminder:${cycle.taskId}:${eventType}:${cycle.version}:${Math.floor(new Date(effectiveDeadline).getTime() / (60 * 60 * 1000))}`;

      const existing = await prisma.outboxEvent.findUnique({ where: { dedupeKey } });
      if (existing) continue;

      await prisma.outboxEvent.create({
        data: {
          id: randomUUID(),
          eventType,
          payloadJson: {
            taskId: cycle.taskId,
            cycleId: cycle.id,
            deadlineAt: effectiveDeadline,
            cycleNumber: cycle.cycleNumber,
          },
          dedupeKey,
        },
      });
      created.push({ cycleId: cycle.id, eventType });
    }

    return created;
  };

  return { scheduleDeadlineReminders };
};

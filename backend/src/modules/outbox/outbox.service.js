import { createHash, randomUUID } from 'node:crypto';

const NOTIFICATION_EVENTS = new Set([
  'TASK_ASSIGNED',
  'TASK_REASSIGNED',
  'ASSIGNMENT_ACCEPTED',
  'ASSIGNMENT_REJECTED',
  'TASK_REQUEST_CREATED',
  'TASK_REQUEST_APPROVED',
  'TASK_REQUEST_DENIED',
  'RETURN_REQUESTED',
  'EXTENSION_REQUESTED',
  'RETURN_APPROVED',
  'RETURN_DENIED',
  'EXTENSION_APPROVED',
  'EXTENSION_DENIED',
  'DEADLINE_CHANGED',
  'TASK_COMPLETED',
  'TASK_CANCELLED',
  'TASK_REOPENED',
  'TASK_RESTORED',
  'TASK_DEADLINE_SOON',
  'TASK_OVERDUE',
]);

export const createOutboxService = ({ emailSender }) => {
  const recipientsForEvent = async (tx, eventType, payload) => {
    const recipients = new Set();

    const addUser = (userId) => { if (userId) recipients.add(userId); };
    addUser(payload.userId);

    switch (eventType) {
      case 'TASK_ASSIGNED':
      case 'TASK_REASSIGNED': {
        addUser(payload.userId);
        const assignment = await tx.taskAssignment.findUnique({
          where: { id: payload.assignmentId },
          select: { userId: true },
        });
        addUser(assignment?.userId);
        break;
      }
      case 'ASSIGNMENT_ACCEPTED':
      case 'ASSIGNMENT_REJECTED': {
        const assignment = await tx.taskAssignment.findUnique({
          where: { id: payload.assignmentId },
          select: { userId: true },
        });
        addUser(assignment?.userId);
        break;
      }
      case 'TASK_REQUEST_CREATED':
      case 'TASK_REQUEST_APPROVED':
      case 'TASK_REQUEST_DENIED':
      case 'RETURN_REQUESTED':
      case 'EXTENSION_REQUESTED':
      case 'RETURN_APPROVED':
      case 'RETURN_DENIED':
      case 'EXTENSION_APPROVED':
      case 'EXTENSION_DENIED': {
        const request = await tx.taskRequest.findUnique({
          where: { id: payload.requestId },
          select: { assignment: { select: { userId: true } }, decidedById: true },
        });
        addUser(request?.assignment?.userId);
        addUser(request?.decidedById);
        break;
      }
      case 'DEADLINE_CHANGED': {
        const cycle = await tx.taskCycle.findUnique({
          where: { id: payload.cycleId },
          select: {
            assignments: { where: { endedAt: null }, select: { userId: true } },
          },
        });
        cycle?.assignments.forEach((a) => addUser(a.userId));
        break;
      }
      case 'TASK_COMPLETED':
      case 'TASK_CANCELLED':
      case 'TASK_REOPENED':
      case 'TASK_RESTORED': {
        const cycle = await tx.taskCycle.findUnique({
          where: { id: payload.cycleId },
          select: {
            assignments: { where: { endedAt: null }, select: { userId: true } },
            task: { select: { createdById: true } },
          },
        });
        cycle?.assignments.forEach((a) => addUser(a.userId));
        addUser(cycle?.task?.createdById);
        break;
      }
      case 'TASK_DEADLINE_SOON':
      case 'TASK_OVERDUE': {
        const cycle = await tx.taskCycle.findUnique({
          where: { id: payload.cycleId },
          select: {
            assignments: { where: { endedAt: null }, select: { userId: true } },
          },
        });
        cycle?.assignments.forEach((a) => addUser(a.userId));
        break;
      }
    }

    return [...recipients];
  };

  const titleForEvent = (eventType, _payload) => {
    const titles = {
      TASK_ASSIGNED: 'Nova atribuição de tarefa',
      TASK_REASSIGNED: 'Tarefa reatribuída',
      ASSIGNMENT_ACCEPTED: 'Atribuição aceita',
      ASSIGNMENT_REJECTED: 'Atribuição rejeitada',
      TASK_REQUEST_CREATED: 'Solicitação de devolução ou prorrogação',
      TASK_REQUEST_APPROVED: 'Solicitação aprovada',
      TASK_REQUEST_DENIED: 'Solicitação negada',
      DEADLINE_CHANGED: 'Prazo alterado',
      TASK_COMPLETED: 'Tarefa concluída',
      TASK_CANCELLED: 'Tarefa cancelada',
      TASK_REOPENED: 'Tarefa reaberta',
      TASK_RESTORED: 'Tarefa restaurada',
      TASK_DEADLINE_SOON: 'Prazo se aproximando',
      TASK_OVERDUE: 'Tarefa atrasada',
    };
    return titles[eventType] || 'Notificação';
  };

  const bodyForEvent = (eventType, payload, appBaseUrl) => {
    const taskUrl = `${appBaseUrl}/tarefas/${payload.taskId}`;
    const bodies = {
      TASK_ASSIGNED: `Você foi atribuído à tarefa #${payload.publicNumber ?? payload.taskId}. ${payload.reason ?? ''} Acesse: ${taskUrl}`,
      TASK_REASSIGNED: `A tarefa #${payload.publicNumber ?? payload.taskId} foi reatribuída para você. ${payload.reason ?? ''} Acesse: ${taskUrl}`,
      ASSIGNMENT_ACCEPTED: `Você aceitou a atribuição da tarefa #${payload.publicNumber ?? payload.taskId}. Acesse: ${taskUrl}`,
      ASSIGNMENT_REJECTED: `Você rejeitou a atribuição da tarefa #${payload.publicNumber ?? payload.taskId}. Motivo: ${payload.reason ?? ''} Acesse: ${taskUrl}`,
      TASK_REQUEST_CREATED: `Nova solicitação para a tarefa #${payload.publicNumber ?? payload.taskId}: ${payload.requestType}. Motivo: ${payload.reason ?? ''} Acesse: ${taskUrl}`,
      TASK_REQUEST_APPROVED: `Solicitação aprovada para a tarefa #${payload.publicNumber ?? payload.taskId}. Acesse: ${taskUrl}`,
      TASK_REQUEST_DENIED: `Solicitação negada para a tarefa #${payload.publicNumber ?? payload.taskId}. Motivo: ${payload.decisionReason ?? ''} Acesse: ${taskUrl}`,
      DEADLINE_CHANGED: `O prazo da tarefa #${payload.publicNumber ?? payload.taskId} foi alterado. Acesse: ${taskUrl}`,
      TASK_COMPLETED: `A tarefa #${payload.publicNumber ?? payload.taskId} foi concluída. Acesse: ${taskUrl}`,
      TASK_CANCELLED: `A tarefa #${payload.publicNumber ?? payload.taskId} foi cancelada. Motivo: ${payload.reason ?? ''} Acesse: ${taskUrl}`,
      TASK_REOPENED: `A tarefa #${payload.publicNumber ?? payload.taskId} foi reaberta. Acesse: ${taskUrl}`,
      TASK_RESTORED: `A tarefa #${payload.publicNumber ?? payload.taskId} foi restaurada. Acesse: ${taskUrl}`,
      TASK_DEADLINE_SOON: `O prazo da tarefa #${payload.publicNumber ?? payload.taskId} se aproxima (${payload.deadlineAt}). Acesse: ${taskUrl}`,
      TASK_OVERDUE: `A tarefa #${payload.publicNumber ?? payload.taskId} está atrasada desde ${payload.deadlineAt}. Acesse: ${taskUrl}`,
    };
    return bodies[eventType] || `Notificação para a tarefa ${payload.taskId}.`;
  };

  const processEvent = async (tx, event) => {
    const { eventType, payloadJson } = event;
    const payload = payloadJson ?? {};
    const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';

    if (!NOTIFICATION_EVENTS.has(eventType)) return { processed: true, skipped: true };

    const recipients = await recipientsForEvent(tx, eventType, payload);
    const title = titleForEvent(eventType, payload);
    const body = bodyForEvent(eventType, payload, appBaseUrl);

    for (const userId of recipients) {
      const preference = await tx.notificationPreference.findUnique({
        where: { userId_notificationType: { userId, notificationType: eventType } },
      });
      const internalEnabled = preference ? preference.internalEnabled : true;
      const emailEnabled = preference ? preference.emailEnabled : true;

      if (internalEnabled) {
        await tx.notification.upsert({
          where: { id: notificationId(event.id, userId) },
          update: {},
          create: {
            id: notificationId(event.id, userId),
            userId,
            type: eventType,
            title,
            body,
            entityType: 'Task',
            entityId: payload.taskId,
          },
        });
      }

      if (emailEnabled) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { emailNormalized: true, name: true },
        });
        if (user?.emailNormalized) {
          const existing = await tx.emailDelivery.upsert({
            where: { outboxEventId_recipient: { outboxEventId: event.id, recipient: user.emailNormalized } },
            update: {},
            create: { id: randomUUID(), outboxEventId: event.id, recipient: user.emailNormalized, status: 'PENDING', attemptCount: 0 },
          });
          if (existing.status === 'SENT') continue;
          const delivery = await emailSender.send({
            to: user.emailNormalized,
            subject: title,
            body,
          });
          await tx.emailDelivery.update({
            where: { id: existing.id },
            data: {
              status: delivery.status,
              attemptCount: { increment: 1 },
              lastError: delivery.lastError,
              sentAt: delivery.sentAt,
            },
          });
          if (delivery.status === 'FAILED') throw new Error(delivery.lastError ?? 'Falha ao enviar e-mail.');
        }
      }
    }

    return { processed: true, recipients: recipients.length };
  };

  const claimEvent = async (prisma, filter = {}) => {
    const now = new Date();
    return prisma.$transaction(async (tx) => {
      const event = await tx.outboxEvent.findFirst({
        where: { AND: [{ status: 'PENDING', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, filter] },
        orderBy: { createdAt: 'asc' },
      });
      if (!event) return null;
      const claimed = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: 'PENDING' },
        data: { status: 'PROCESSING', claimedAt: now, attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) return null;
      return tx.outboxEvent.findUnique({ where: { id: event.id } });
    });
  };

  const completeEvent = async (prisma, eventId, success, errorMessage) => {
    const now = new Date();
    if (success) {
      return prisma.outboxEvent.update({
        where: { id: eventId },
        data: { status: 'PROCESSED', processedAt: now },
      });
    }

    const event = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
    const attempts = event?.attempts ?? 0;
    const maxAttempts = 5;

    if (attempts >= maxAttempts) {
      return prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          status: 'FAILED',
          lastError: errorMessage,
          processedAt: now,
        },
      });
    }

    const backoffMs = Math.min(1000 * 2 ** attempts, 3600000);
    return prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: 'PENDING',
        nextAttemptAt: new Date(Date.now() + backoffMs),
        claimedAt: null,
        lastError: errorMessage,
      },
    });
  };

  const recoverOrphaned = async (prisma) => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    return prisma.outboxEvent.updateMany({
      where: {
        status: 'PROCESSING',
        claimedAt: { lt: thirtyMinutesAgo },
      },
      data: {
        status: 'PENDING',
        claimedAt: null,
      },
    });
  };

  return { processEvent, claimEvent, completeEvent, recoverOrphaned };
};

const notificationId = (eventId, userId) => {
  const hex = createHash('sha256').update(`${eventId}:${userId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

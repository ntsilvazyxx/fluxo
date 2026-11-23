import { randomUUID } from 'node:crypto';
import { runCriticalTransaction } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import { canAdministerLock } from './chat.policy.js';
import { presentLockState } from './chat.presenter.js';

export const createChatLockService = ({ prisma }) => {
  /**
   * 1. Bloqueio por Solicitação (RETURN ou EXTENSION)
   * Precedência: REQUEST_PENDING (1). Não substitui ADMIN_MAINTENANCE (3) nem CYCLE_CLOSED (2).
   */
  const applyRequestLock = async (client, taskId, cycleId, requestId, actorId) => {
    const conversation = await client.chatConversation.findUnique({
      where: { taskId },
      include: { lockState: true },
    });

    if (!conversation || !conversation.lockState) return null;

    const lockState = conversation.lockState;

    // Se já bloqueado por ADMIN_MAINTENANCE (3) ou CYCLE_CLOSED (2), a precedência mais alta se mantém
    if (lockState.isLocked) {
      if (['ADMIN_MAINTENANCE', 'CYCLE_CLOSED'].includes(lockState.reason)) {
        return lockState;
      }

      // Já bloqueado por solicitação anterior: mantém bloqueio e registra LOCK_REASSERTED se for outra solicitação
      if (lockState.reason === 'REQUEST_PENDING') {
        if (lockState.requestId !== requestId) {
          await client.chatLockEvent.create({
            data: {
              id: randomUUID(),
              conversationId: conversation.id,
              cycleId,
              eventType: 'LOCK_REASSERTED',
              reason: 'REQUEST_PENDING',
              requestId,
              actorId,
              metadata: { previousRequestId: lockState.requestId },
            },
          });
        }
        return lockState;
      }
    }

    const now = new Date();
    const updated = await client.chatLockState.update({
      where: { id: lockState.id },
      data: {
        isLocked: true,
        reason: 'REQUEST_PENDING',
        requestId,
        cycleId,
        lockedAt: now,
        lockedById: actorId,
      },
    });

    await client.chatLockEvent.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        cycleId,
        eventType: 'LOCK_ACQUIRED',
        reason: 'REQUEST_PENDING',
        requestId,
        actorId,
      },
    });

    return updated;
  };

  /**
   * 2. Desbloqueio por Decisão de Solicitação (APPROVED ou DENIED)
   * REGRA SEAF: A decisão sobre qualquer uma das solicitações pendentes libera o bloqueio
   * causado por solicitações, mesmo que outras solicitações continuem pendentes.
   * Não pode remover bloqueios independentes (ADMIN_MAINTENANCE ou CYCLE_CLOSED).
   */
  const releaseRequestLock = async (client, taskId, cycleId, requestId, actorId, decisionStatus) => {
    const conversation = await client.chatConversation.findUnique({
      where: { taskId },
      include: { lockState: true },
    });

    if (!conversation || !conversation.lockState) return null;

    const lockState = conversation.lockState;

    // Precedência: Se bloqueado por ADMIN_MAINTENANCE ou CYCLE_CLOSED, a decisão não remove o bloqueio
    if (lockState.isLocked && ['ADMIN_MAINTENANCE', 'CYCLE_CLOSED'].includes(lockState.reason)) {
      return lockState;
    }

    // Se estiver bloqueado por REQUEST_PENDING -> Libera o bloqueio!
    if (lockState.isLocked && lockState.reason === 'REQUEST_PENDING') {
      const updated = await client.chatLockState.update({
        where: { id: lockState.id },
        data: {
          isLocked: false,
          reason: null,
          requestId: null,
          cycleId,
          lockedAt: null,
          lockedById: null,
        },
      });

      await client.chatLockEvent.create({
        data: {
          id: randomUUID(),
          conversationId: conversation.id,
          cycleId,
          eventType: 'LOCK_RELEASED',
          reason: 'REQUEST_PENDING',
          requestId,
          actorId,
          metadata: { decisionStatus },
        },
      });

      return updated;
    }

    // Se já estava desbloqueado quando a decisão foi tomada
    if (!lockState.isLocked) {
      await client.chatLockEvent.create({
        data: {
          id: randomUUID(),
          conversationId: conversation.id,
          cycleId,
          eventType: 'DECISION_RECORDED_WHILE_UNLOCKED',
          requestId,
          actorId,
          metadata: { decisionStatus },
        },
      });
      return lockState;
    }

    return lockState;
  };

  /**
   * 3. Bloqueio por Conclusão ou Cancelamento (CYCLE_CLOSED)
   * Precedência: CYCLE_CLOSED (2). Não substitui ADMIN_MAINTENANCE (3).
   */
  const applyCycleClosedLock = async (client, taskId, cycleId, actorId) => {
    const conversation = await client.chatConversation.findUnique({
      where: { taskId },
      include: { lockState: true },
    });

    if (!conversation || !conversation.lockState) return null;
    const lockState = conversation.lockState;

    // Precedência: ADMIN_MAINTENANCE (3) prevalece sobre CYCLE_CLOSED (2)
    if (lockState.isLocked && lockState.reason === 'ADMIN_MAINTENANCE') {
      await client.chatLockEvent.create({
        data: {
          id: randomUUID(),
          conversationId: conversation.id,
          cycleId,
          eventType: 'CYCLE_TERMINATED',
          reason: 'ADMIN_MAINTENANCE',
          actorId,
          metadata: { note: 'Cycle terminated while under administrative maintenance' },
        },
      });
      return lockState;
    }

    const now = new Date();
    const updated = await client.chatLockState.update({
      where: { id: lockState.id },
      data: {
        isLocked: true,
        reason: 'CYCLE_CLOSED',
        requestId: null,
        cycleId,
        lockedAt: now,
        lockedById: actorId,
      },
    });

    await client.chatLockEvent.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        cycleId,
        eventType: 'CYCLE_TERMINATED',
        reason: 'CYCLE_CLOSED',
        actorId,
      },
    });

    return updated;
  };

  /**
   * 4. Desbloqueio por Reabertura de Ciclo (CYCLE_REOPENED)
   */
  const releaseCycleClosedLock = async (client, taskId, newCycleId, actorId) => {
    const conversation = await client.chatConversation.findUnique({
      where: { taskId },
      include: { lockState: true },
    });

    if (!conversation || !conversation.lockState) return null;
    const lockState = conversation.lockState;

    // Se estiver sob ADMIN_MAINTENANCE, preserva o bloqueio administrativo e apenas atualiza cycleId
    if (lockState.isLocked && lockState.reason === 'ADMIN_MAINTENANCE') {
      const updated = await client.chatLockState.update({
        where: { id: lockState.id },
        data: { cycleId: newCycleId },
      });

      await client.chatLockEvent.create({
        data: {
          id: randomUUID(),
          conversationId: conversation.id,
          cycleId: newCycleId,
          eventType: 'CYCLE_REOPENED',
          reason: 'ADMIN_MAINTENANCE',
          actorId,
          metadata: { note: 'Cycle reopened while under administrative maintenance' },
        },
      });

      return updated;
    }

    // Se estava bloqueado por CYCLE_CLOSED (ou ciclo anterior), libera
    const updated = await client.chatLockState.update({
      where: { id: lockState.id },
      data: {
        isLocked: false,
        reason: null,
        requestId: null,
        cycleId: newCycleId,
        lockedAt: null,
        lockedById: null,
      },
    });

    await client.chatLockEvent.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        cycleId: newCycleId,
        eventType: 'CYCLE_REOPENED',
        actorId,
      },
    });

    return updated;
  };

  /**
   * 5. Bloqueio Administrativo (POST /api/v1/tasks/:taskId/chat/lock)
   */
  const adminLock = async (actor, taskId, input) => {
    if (!canAdministerLock(actor)) {
      throw new AppError(403, 'FORBIDDEN', 'Você não possui permissão para administrar bloqueios de chat.');
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
      include: { currentCycle: true },
    });

    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
    }

    const conversation = await prisma.chatConversation.findUnique({
      where: { taskId },
      include: { lockState: true },
    });

    if (!conversation) {
      throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
    }

    return runCriticalTransaction(prisma, async (tx) => {
      // Row lock na conversa para serialização estrita
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM chat_conversations WHERE id = ${conversation.id} FOR UPDATE`;
      }

      const lockState = await tx.chatLockState.findUnique({
        where: { conversationId: conversation.id },
      });

      const now = new Date();

      if (input.isLocked) {
        // Bloqueia com ADMIN_MAINTENANCE (precedência máxima = 3)
        const updated = await tx.chatLockState.update({
          where: { id: lockState.id },
          data: {
            isLocked: true,
            reason: input.reason ?? 'ADMIN_MAINTENANCE',
            cycleId: task.currentCycleId,
            lockedAt: now,
            lockedById: actor.userId,
          },
        });

        await tx.chatLockEvent.create({
          data: {
            id: randomUUID(),
            conversationId: conversation.id,
            cycleId: task.currentCycleId,
            eventType: 'ADMIN_INTERVENTION',
            reason: input.reason ?? 'ADMIN_MAINTENANCE',
            actorId: actor.userId,
            metadata: {
              justification: input.justification,
              action: 'LOCK',
              previousState: {
                isLocked: lockState.isLocked,
                reason: lockState.reason,
              },
            },
          },
        });

        return presentLockState(updated);
      } else {
        // Desbloqueia administrativamente
        // Se a tarefa já estava concluída ou cancelada, preserva o bloqueio de CYCLE_CLOSED
        const isCycleClosed = Boolean(task.currentCycle?.closedAt);
        const newReason = isCycleClosed ? 'CYCLE_CLOSED' : null;
        const newIsLocked = isCycleClosed;

        const updated = await tx.chatLockState.update({
          where: { id: lockState.id },
          data: {
            isLocked: newIsLocked,
            reason: newReason,
            cycleId: task.currentCycleId,
            lockedAt: newIsLocked ? lockState.lockedAt : null,
            lockedById: newIsLocked ? lockState.lockedById : null,
          },
        });

        await tx.chatLockEvent.create({
          data: {
            id: randomUUID(),
            conversationId: conversation.id,
            cycleId: task.currentCycleId,
            eventType: 'ADMIN_INTERVENTION',
            reason: lockState.reason,
            actorId: actor.userId,
            metadata: {
              justification: input.justification,
              action: 'UNLOCK',
              revertedTo: newReason,
            },
          },
        });

        return presentLockState(updated);
      }
    });
  };

  return {
    applyRequestLock,
    releaseRequestLock,
    applyCycleClosedLock,
    releaseCycleClosedLock,
    adminLock,
  };
};

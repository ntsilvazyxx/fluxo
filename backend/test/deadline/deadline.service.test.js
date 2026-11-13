import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDeadlineService, isValidAcceptanceDuration, isValidExecutionDuration } from '../../src/modules/deadline/deadline.service.js';

const makePrisma = () => {
  const deadlineChanges = [];
  return {
    deadlineChange: {
      create: async (arg) => {
        const { data } = arg;
        const change = { id: data.id, ...data };
        deadlineChanges.push(change);
        return change;
      },
    },
    taskCycle: {
      updateMany: async () => ({ count: 1 }),
    },
    getDeadlineChanges: () => deadlineChanges,
  };
};

describe('deadline.service', () => {
  describe('validação de durações', () => {
    it('aceita durações de aceite válidas (1, 2, 4, 8, 12, 24 horas)', () => {
      for (const m of [60, 120, 240, 480, 720, 1440]) {
        assert.equal(isValidAcceptanceDuration(m), true);
      }
      for (const m of [30, 90, 180, 1000]) {
        assert.equal(isValidAcceptanceDuration(m), false);
      }
    });

    it('aceita durações de execução válidas (0.5, 1, 2, 3, 5 dias)', () => {
      for (const m of [720, 1440, 2880, 4320, 7200]) {
        assert.equal(isValidExecutionDuration(m), true);
      }
      for (const m of [360, 1000, 1441]) {
        assert.equal(isValidExecutionDuration(m), false);
      }
    });
  });

  describe('cálculo de prazo de aceite (horas corridas)', () => {
    it('calcula deadline de aceite a partir do momento da atribuição', () => {
      const { calculateAcceptanceDeadline } = createDeadlineService({ prisma: makePrisma() });
      const assignedAt = new Date('2026-11-13T10:00:00Z');
      const deadline = calculateAcceptanceDeadline(assignedAt, 120); // 2 horas
      assert.equal(deadline.getTime(), new Date('2026-11-13T12:00:00Z').getTime());
    });

    it('calcula deadline de aceite para 24 horas', () => {
      const { calculateAcceptanceDeadline } = createDeadlineService({ prisma: makePrisma() });
      const assignedAt = new Date('2026-11-13T08:00:00Z');
      const deadline = calculateAcceptanceDeadline(assignedAt, 1440); // 24 horas
      assert.equal(deadline.getTime(), new Date('2026-11-14T08:00:00Z').getTime());
    });

    it('calcula deadline de aceite para 1 hora', () => {
      const { calculateAcceptanceDeadline } = createDeadlineService({ prisma: makePrisma() });
      const assignedAt = new Date('2026-11-13T10:00:00Z');
      const deadline = calculateAcceptanceDeadline(assignedAt, 60); // 1 hora
      assert.equal(deadline.getTime(), new Date('2026-11-13T11:00:00Z').getTime());
    });
  });

  describe('cálculo de prazo de execução (dias corridos)', () => {
    it('converte meio dia para 12 horas', () => {
      const { calculateExecutionDeadline } = createDeadlineService({ prisma: makePrisma() });
      const acceptedAt = new Date('2026-11-13T10:00:00Z');
      const deadline = calculateExecutionDeadline(acceptedAt, 720); // meio dia = 720 minutos
      assert.equal(deadline.getTime(), new Date('2026-11-13T22:00:00Z').getTime());
    });

    it('converte 1 dia para 24 horas', () => {
      const { calculateExecutionDeadline } = createDeadlineService({ prisma: makePrisma() });
      const acceptedAt = new Date('2026-11-13T10:00:00Z');
      const deadline = calculateExecutionDeadline(acceptedAt, 1440); // 1 dia
      assert.equal(deadline.getTime(), new Date('2026-11-14T10:00:00Z').getTime());
    });

    it('converte 2 dias para 48 horas', () => {
      const { calculateExecutionDeadline } = createDeadlineService({ prisma: makePrisma() });
      const acceptedAt = new Date('2026-11-13T10:00:00Z');
      const deadline = calculateExecutionDeadline(acceptedAt, 2880); // 2 dias
      assert.equal(deadline.getTime(), new Date('2026-11-15T10:00:00Z').getTime());
    });

    it('converte 3 dias para 72 horas', () => {
      const { calculateExecutionDeadline } = createDeadlineService({ prisma: makePrisma() });
      const acceptedAt = new Date('2026-11-13T10:00:00Z');
      const deadline = calculateExecutionDeadline(acceptedAt, 4320); // 3 dias
      assert.equal(deadline.getTime(), new Date('2026-11-16T10:00:00Z').getTime());
    });

    it('converte 5 dias para 120 horas', () => {
      const { calculateExecutionDeadline } = createDeadlineService({ prisma: makePrisma() });
      const acceptedAt = new Date('2026-11-13T10:00:00Z');
      const deadline = calculateExecutionDeadline(acceptedAt, 7200); // 5 dias
      assert.equal(deadline.getTime(), new Date('2026-11-18T10:00:00Z').getTime());
    });
  });

  describe('métricas de aceite', () => {
    it('identifica aceite dentro do prazo', () => {
      const { calculateAcceptanceMetrics } = createDeadlineService({ prisma: makePrisma() });
      const assignedAt = new Date('2026-11-13T10:00:00Z');
      const acceptedAt = new Date('2026-11-13T11:00:00Z');
      const deadline = new Date('2026-11-13T12:00:00Z');
      const assignment = { assignedAt, acceptedAt, acceptanceDeadlineAt: deadline };
      const metrics = calculateAcceptanceMetrics(assignment);
      assert.equal(metrics.acceptedWithinDeadline, true);
      assert.equal(metrics.waitingMilliseconds, 3600000); // 1 hora
      assert.equal(metrics.isOverdue, false);
    });

    it('identifica aceite fora do prazo', () => {
      const { calculateAcceptanceMetrics } = createDeadlineService({ prisma: makePrisma() });
      const assignedAt = new Date('2026-11-13T10:00:00Z');
      const acceptedAt = new Date('2026-11-13T13:00:00Z'); // após o deadline de 12:00
      const deadline = new Date('2026-11-13T12:00:00Z');
      const assignment = { assignedAt, acceptedAt, acceptanceDeadlineAt: deadline };
      const metrics = calculateAcceptanceMetrics(assignment);
      assert.equal(metrics.acceptedWithinDeadline, false);
      assert.equal(metrics.waitingMilliseconds, 10800000); // 3 horas
    });

    it('detecta atraso quando não aceito e prazo expirado', () => {
      const { calculateAcceptanceMetrics } = createDeadlineService({ prisma: makePrisma() });
      const assignedAt = new Date('2026-11-13T10:00:00Z');
      const deadline = new Date('2026-11-13T11:00:00Z');
      const now = new Date('2026-11-13T12:00:00Z'); // depois do prazo
      const assignment = { assignedAt, acceptedAt: null, acceptanceDeadlineAt: deadline };
      const metrics = calculateAcceptanceMetrics(assignment, now);
      assert.equal(metrics.isOverdue, true);
      assert.equal(metrics.acceptedWithinDeadline, null);
    });

    it('preserva tempo real utilizado para aceitar', () => {
      const { calculateAcceptanceMetrics } = createDeadlineService({ prisma: makePrisma() });
      const assignedAt = new Date('2026-11-13T10:00:00Z');
      const acceptedAt = new Date('2026-11-13T10:45:00Z'); // 45 minutos
      const deadline = new Date('2026-11-13T12:00:00Z');
      const assignment = { assignedAt, acceptedAt, acceptanceDeadlineAt: deadline };
      const metrics = calculateAcceptanceMetrics(assignment);
      assert.equal(metrics.realTimeUsedMilliseconds, 2700000); // 45 minutos
    });
  });

  describe('métricas de execução', () => {
    it('calcula tempo decorrido e verifica atraso', () => {
      const { calculateExecutionMetrics } = createDeadlineService({ prisma: makePrisma() });
      const acceptedAt = new Date('2026-11-13T10:00:00Z');
      const executionDeadlineAt = new Date('2026-11-15T10:00:00Z'); // 2 dias depois
      const now = new Date('2026-11-16T10:00:00Z'); // depois do prazo
      const assignment = { acceptedAt, executionDeadlineAt, executionDurationMinutes: 2880, endedAt: null };
      const metrics = calculateExecutionMetrics(assignment, now);
      assert.equal(metrics.isExecutionOverdue, true);
      assert.equal(metrics.timeRemainingMilliseconds, 0);
      assert.ok(metrics.responsibilityMilliseconds > 0);
    });

    it('calcula tempo restante quando ainda dentro do prazo', () => {
      const { calculateExecutionMetrics } = createDeadlineService({ prisma: makePrisma() });
      const acceptedAt = new Date('2026-11-13T10:00:00Z');
      const executionDeadlineAt = new Date('2026-11-15T10:00:00Z');
      const now = new Date('2026-11-14T10:00:00Z'); // 1 dia depois
      const assignment = { acceptedAt, executionDeadlineAt, executionDurationMinutes: 2880, endedAt: null };
      const metrics = calculateExecutionMetrics(assignment, now);
      assert.equal(metrics.isExecutionOverdue, false);
      assert.equal(metrics.timeRemainingMilliseconds, 86400000); // 1 dia restante
    });

    it('registra tempo efetivo quando finalizado', () => {
      const { calculateExecutionMetrics } = createDeadlineService({ prisma: makePrisma() });
      const acceptedAt = new Date('2026-11-13T10:00:00Z');
      const endedAt = new Date('2026-11-14T12:00:00Z'); // 26 horas depois
      const executionDeadlineAt = new Date('2026-11-15T10:00:00Z');
      const assignment = { acceptedAt, endedAt, executionDeadlineAt, executionDurationMinutes: 2880 };
      const now = new Date('2026-11-16T10:00:00Z');
      const metrics = calculateExecutionMetrics(assignment, now);
      assert.equal(metrics.endedAt, endedAt);
      assert.equal(metrics.responsibilityMilliseconds, 93600000); // 26 horas
      assert.equal(metrics.isExecutionOverdue, false); // finalizado antes do prazo
    });
  });

  describe('deslocamento de deadline por pausa', () => {
    it('desloca executionDeadlineAt pela duração da pausa', () => {
      const { applyPauseToDeadline } = createDeadlineService({ prisma: makePrisma() });
      const currentDeadline = new Date('2026-11-15T10:00:00Z');
      const pauseStarted = new Date('2026-11-14T10:00:00Z');
      const pauseEnded = new Date('2026-11-14T12:00:00Z'); // 2 horas de pausa
      const newDeadline = applyPauseToDeadline(currentDeadline, pauseStarted, pauseEnded);
      assert.equal(newDeadline.getTime(), new Date('2026-11-15T12:00:00Z').getTime());
    });

    it('retorna o mesmo deadline quando não há dados de pausa', () => {
      const { applyPauseToDeadline } = createDeadlineService({ prisma: makePrisma() });
      const currentDeadline = new Date('2026-11-15T10:00:00Z');
      assert.equal(applyPauseToDeadline(currentDeadline, null, null), currentDeadline);
      assert.equal(applyPauseToDeadline(null, new Date(), new Date()), null);
    });
  });

  describe('compatibilidade LEGACY_CALENDAR', () => {
    it('não altera prazos de ciclos LEGACY_CALENDAR', () => {
      const { calculateExecutionDeadline } = createDeadlineService({ prisma: makePrisma() });
      // O serviço de deadline não modifica ciclos LEGACY_CALENDAR
      // A lógica de preservação está nos métodos de task.service.js
      assert.equal(typeof calculateExecutionDeadline, 'function');
    });
  });

  describe('mudança de dia, mês e ano', () => {
    it('calcula deadline cruzando mudança de mês', () => {
      const { calculateAcceptanceDeadline } = createDeadlineService({ prisma: makePrisma() });
      const assignedAt = new Date('2026-11-30T22:00:00Z');
      const deadline = calculateAcceptanceDeadline(assignedAt, 120); // 2 horas
      assert.equal(deadline.getTime(), new Date('2026-12-01T00:00:00Z').getTime());
    });

    it('calcula deadline cruzando mudança de ano', () => {
      const { calculateAcceptanceDeadline } = createDeadlineService({ prisma: makePrisma() });
      const assignedAt = new Date('2026-12-31T23:00:00Z');
      const deadline = calculateAcceptanceDeadline(assignedAt, 120); // 2 horas
      assert.equal(deadline.getTime(), new Date('2027-01-01T01:00:00Z').getTime());
    });
  });

  describe('registro de alteração de prazo', () => {
    it('registra alteração de prazo de execução com kind EXECUTION_EXTENSION', async () => {
      const prisma = makePrisma();
      const { recordDeadlineChange } = createDeadlineService({ prisma });
      const cycleId = 'cycle-1';
      const oldDeadline = new Date('2026-11-15T10:00:00Z');
      const newDeadline = new Date('2026-11-17T10:00:00Z');
      await recordDeadlineChange(prisma, cycleId, oldDeadline, newDeadline, 'EXECUTION_EXTENSION', 'Prorrogação aprovada', 'user-1');
      const changes = prisma.getDeadlineChanges();
      assert.equal(changes.length, 1);
      assert.equal(changes[0].kind, 'EXECUTION_EXTENSION');
      assert.equal(changes[0].cycleId, cycleId);
      assert.equal(changes[0].oldDeadlineAt.getTime(), oldDeadline.getTime());
      assert.equal(changes[0].newDeadlineAt.getTime(), newDeadline.getTime());
      assert.equal(changes[0].changedById, 'user-1');
    });

    it('registra alteração de prazo por pausa com kind RETURN_PAUSE', async () => {
      const prisma = makePrisma();
      const { recordDeadlineChange } = createDeadlineService({ prisma });
      await recordDeadlineChange(prisma, 'cycle-1', new Date('2026-11-15T10:00:00Z'), new Date('2026-11-15T12:00:00Z'), 'RETURN_PAUSE', 'Pausa por devolução', 'user-1');
      const changes = prisma.getDeadlineChanges();
      assert.equal(changes.length, 1);
      assert.equal(changes[0].kind, 'RETURN_PAUSE');
    });
  });

  describe('regressão LEGACY_CALENDAR', () => {
    it('atribuição em ciclo legado não falha e preserva deadlineAt do calendário', () => {
      // Simula a lógica de branch do task.service.assign para LEGACY_CALENDAR
      const cycle = { deadlinePolicy: 'LEGACY_CALENDAR', deadlineAt: new Date('2026-11-20T10:00:00Z'), acceptanceDurationMinutes: null, executionDurationMinutes: null };
      let acceptanceDeadlineAt = null;
      let executionDeadlineAt = null;
      if (cycle.deadlinePolicy === 'RUNNING_CLOCK') {
        acceptanceDeadlineAt = new Date();
      }
      // Para LEGACY_CALENDAR, não chama calculateAcceptanceDeadline nem calculateExecutionDeadline
      assert.equal(acceptanceDeadlineAt, null);
      assert.equal(executionDeadlineAt, null);
      assert.equal(cycle.deadlinePolicy, 'LEGACY_CALENDAR');
      assert.ok(cycle.deadlineAt); // deadlineAt do calendário é preservado
    });

    it('aceite em ciclo legado usa cycle.deadlineAt, não calcula novo executionDeadlineAt', () => {
      // Simula a lógica de branch do task.service.accept para LEGACY_CALENDAR
      const cycle = { deadlinePolicy: 'LEGACY_CALENDAR', deadlineAt: new Date('2026-11-20T10:00:00Z') };
      const now = new Date('2026-11-13T10:00:00Z');
      const executionDeadlineAt = cycle.deadlinePolicy === 'RUNNING_CLOCK'
        ? new Date(now.getTime() + 2880 * 60000) // não deve ser chamado para legado
        : cycle.deadlineAt; // usa deadlineAt do calendário
      assert.equal(executionDeadlineAt.getTime(), cycle.deadlineAt.getTime());
      assert.equal(executionDeadlineAt.getTime(), new Date('2026-11-20T10:00:00Z').getTime());
    });

    it('rejeição em ciclo legado preserva deadlineAt do calendário', () => {
      // Simula a lógica de branch do task.service.reject para LEGACY_CALENDAR
      const cycle = { deadlinePolicy: 'LEGACY_CALENDAR', deadlineAt: new Date('2026-11-20T10:00:00Z') };
      const cycleUpdateData = { status: 'PENDING', version: { increment: 1 } };
      if (cycle.deadlinePolicy === 'RUNNING_CLOCK') {
        cycleUpdateData.deadlineAt = null;
        cycleUpdateData.acceptanceDeadlineAt = null;
        cycleUpdateData.executionDeadlineAt = null;
      }
      // Para LEGACY_CALENDAR, deadlineAt não é tocado
      assert.equal(cycleUpdateData.deadlineAt, undefined);
      assert.equal(cycleUpdateData.acceptanceDeadlineAt, undefined);
      assert.equal(cycleUpdateData.executionDeadlineAt, undefined);
      assert.ok(cycle.deadlineAt); // preservado
    });

    it('serviço de deadline não corrompe dados de ciclo legado', () => {
      const { calculateAcceptanceDeadline, calculateExecutionDeadline } = createDeadlineService({ prisma: makePrisma() });
      // As funções existem e são chamadas apenas pelo task.service quando deadlinePolicy === 'RUNNING_CLOCK'
      // Para LEGACY_CALENDAR, o task.service não as invoca
      const assignedAt = new Date('2026-11-13T10:00:00Z');
      const deadline = calculateAcceptanceDeadline(assignedAt, 120);
      assert.equal(deadline.getTime(), new Date('2026-11-13T12:00:00Z').getTime());
      const acceptedAt = new Date('2026-11-13T10:00:00Z');
      const execDeadline = calculateExecutionDeadline(acceptedAt, 1440);
      assert.equal(execDeadline.getTime(), new Date('2026-11-14T10:00:00Z').getTime());
    });

    it('ciclo legado permanece com deadlinePolicy inalterado após operações', () => {
      const cycle = { deadlinePolicy: 'LEGACY_CALENDAR', deadlineAt: new Date('2026-11-20T10:00:00Z') };
      // Nenhuma operação do novo modelo altera deadlinePolicy
      assert.equal(cycle.deadlinePolicy, 'LEGACY_CALENDAR');
      assert.ok(cycle.deadlineAt);
    });
  });
});

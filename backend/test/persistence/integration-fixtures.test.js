import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { cycleFixtureData, factories } from '../../testing/integration/fixtures.js';

describe('ciclos sintéticos sem banco', () => {
  it('fornece openedAt obrigatório e política legada sem depender de registros existentes', () => {
    const startedAt = Date.now(); const taskId = randomUUID(); const data = cycleFixtureData(taskId);
    const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    const cycleModel = /model TaskCycle \{([^}]+)\}/.exec(schema)[1];
    assert.match(cycleModel, /^\s*openedAt\s+DateTime\s+@db\.DateTime\(3\)\s*$/m);
    assert.equal(data.taskId, taskId); assert.equal(data.deadlinePolicy, 'LEGACY_CALENDAR');
    assert.ok(data.openedAt instanceof Date); assert.ok(+data.openedAt >= startedAt && +data.openedAt <= Date.now());
    assert.notEqual(data.id, cycleFixtureData(taskId).id);
  });
  it('preserva a identidade da tarefa e a cronologia entre ciclos anteriores e atual', () => {
    const taskId = randomUUID();
    const old = cycleFixtureData(taskId, { openedAt: '2026-11-09T08:00:00-04:00', closedAt: '2026-11-10T18:00:00-04:00', status: 'COMPLETED', completionText: 'Entrega sintética concluída' });
    const current = cycleFixtureData(taskId, { cycleNumber: 2, openedAt: '2026-11-11T08:00:00-04:00' });
    assert.equal(old.taskId, current.taskId); assert.notEqual(old.id, current.id);
    assert.equal(old.openedAt.toISOString(), '2026-11-09T12:00:00.000Z'); assert.ok(old.closedAt <= current.openedAt);
    assert.equal(current.cycleNumber, 2); assert.equal(current.status, 'PENDING'); assert.equal(current.closedAt, undefined);
    assert.equal(current.assignments, undefined); assert.equal(current.requests, undefined);
  });
  it('recusa datas ausentes/inválidas, encerramento anterior e estado incompatível', () => {
    const taskId = randomUUID();
    for (const openedAt of [null, undefined, 'invalid']) assert.throws(() => cycleFixtureData(taskId, { openedAt }));
    assert.throws(() => cycleFixtureData(taskId, { openedAt: '2026-11-10', closedAt: '2026-11-09', status: 'CANCELLED' }), /antes da abertura/);
    assert.throws(() => cycleFixtureData(taskId, { status: 'COMPLETED' }), /incompatíveis/);
    assert.throws(() => cycleFixtureData(taskId, { closedAt: new Date() }), /incompatíveis/);
  });
  it('mantém obrigatório o guard para as factories com escrita', () => {
    assert.throws(() => factories({}), /conexão de integração validada/);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateAssignmentMetrics } from '../../src/modules/time-accounting/time-accounting.js';

const at = (value) => new Date(value);
const hour = 3600000;
const running = { deadlinePolicy: 'RUNNING_CLOCK' };
const assignment = (overrides = {}) => ({
  assignedAt: at('2026-11-13T20:00:00Z'), acceptedAt: at('2026-11-13T21:00:00Z'),
  endedAt: null, calendarVersion: null, pauseIntervals: [], ...overrides,
});

describe('métricas RUNNING_CLOCK sem calendário', () => {
  it('conta espera e execução em horas corridas, inclusive fora do expediente', () => {
    const result = calculateAssignmentMetrics(assignment(), at('2026-11-14T02:00:00Z'), running);
    assert.deepEqual(result, { waitingMilliseconds: hour, responsibilityMilliseconds: 5 * hour, pausedMilliseconds: 0, effectiveWorkingMilliseconds: 5 * hour });
  });
  it('desconta pausa fechada e retoma a contagem sem modificar prazos', () => {
    const data = assignment({ executionDeadlineAt: at('2026-11-14T21:00:00Z'), pauseIntervals: [{ startedAt: at('2026-11-13T22:00:00Z'), endedAt: at('2026-11-13T23:00:00Z') }] });
    const before = structuredClone(data);
    const paused = calculateAssignmentMetrics(data, at('2026-11-13T23:00:00Z'), running);
    const resumed = calculateAssignmentMetrics(data, at('2026-11-14T01:00:00Z'), running);
    assert.equal(paused.pausedMilliseconds, hour); assert.equal(paused.effectiveWorkingMilliseconds, hour);
    assert.equal(resumed.effectiveWorkingMilliseconds, 3 * hour); assert.deepEqual(data, before);
  });
  it('congela tempo efetivo durante pausa aberta e limita ao encerramento', () => {
    const data = assignment({ pauseIntervals: [{ startedAt: at('2026-11-13T22:00:00Z'), endedAt: null }] });
    const first = calculateAssignmentMetrics(data, at('2026-11-13T23:00:00Z'), running);
    const later = calculateAssignmentMetrics(data, at('2026-11-14T01:00:00Z'), running);
    assert.equal(first.effectiveWorkingMilliseconds, hour); assert.equal(later.effectiveWorkingMilliseconds, hour);
    const closed = calculateAssignmentMetrics({ ...data, endedAt: at('2026-11-13T23:00:00Z') }, at('2026-11-15T01:00:00Z'), running);
    assert.equal(closed.responsibilityMilliseconds, 2 * hour); assert.equal(closed.pausedMilliseconds, hour);
  });
  it('intersecta pausas com a responsabilidade e não desconta sobreposição duas vezes', () => {
    const data = assignment({ pauseIntervals: [
      { startedAt: at('2026-11-13T20:00:00Z'), endedAt: at('2026-11-13T22:00:00Z') },
      { startedAt: at('2026-11-13T21:30:00Z'), endedAt: at('2026-11-13T23:00:00Z') },
      { startedAt: at('2026-11-14T02:00:00Z'), endedAt: null },
    ] });
    const result = calculateAssignmentMetrics(data, at('2026-11-14T00:00:00Z'), running);
    assert.equal(result.pausedMilliseconds, 2 * hour); assert.equal(result.effectiveWorkingMilliseconds, hour);
  });
  it('sem aceite registra apenas espera, inclusive quando a atribuição foi encerrada', () => {
    const data = assignment({ acceptedAt: null, endedAt: at('2026-11-13T22:00:00Z') });
    assert.deepEqual(calculateAssignmentMetrics(data, at('2026-11-14T00:00:00Z'), running), { waitingMilliseconds: 2 * hour, responsibilityMilliseconds: 0, pausedMilliseconds: 0, effectiveWorkingMilliseconds: 0 });
  });
  it('normaliza instantes ISO com offset e preserva valores numéricos na serialização', () => {
    const result = calculateAssignmentMetrics({ assignedAt: '2026-12-31T19:00:00-04:00', acceptedAt: '2026-12-31T20:00:00-04:00', endedAt: '2027-01-01T02:00:00Z' }, at('2027-01-02T00:00:00Z'), running);
    assert.equal(result.waitingMilliseconds, hour); assert.equal(result.effectiveWorkingMilliseconds, 2 * hour);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  });
  it('não converte datas inválidas em NaN/null ou em tempo fictício', () => {
    assert.throws(() => calculateAssignmentMetrics(assignment({ acceptedAt: 'invalid' }), new Date(), running), /acceptedAt/);
    assert.throws(() => calculateAssignmentMetrics(assignment({ acceptedAt: false }), new Date(), running), /acceptedAt/);
    assert.throws(() => calculateAssignmentMetrics(assignment({ pauseIntervals: [{ startedAt: 'invalid' }] }), new Date(), running), /startedAt/);
    assert.throws(() => calculateAssignmentMetrics(assignment({ pauseIntervals: [{ startedAt: at('2026-11-13T23:00:00Z'), endedAt: at('2026-11-13T22:00:00Z') }] }), new Date(), running), /pausa inválido/);
  });
  it('não interpreta calendário ausente em LEGACY_CALENDAR como relógio corrido', () => {
    assert.throws(() => calculateAssignmentMetrics(assignment(), at('2026-11-14T00:00:00Z'), { deadlinePolicy: 'LEGACY_CALENDAR' }));
  });
});

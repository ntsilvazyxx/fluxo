import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { transitionTo } from '../../src/modules/tasks/task.policy.js';

describe('ciclos de reabertura e restauração', () => {
  it('reabre somente ciclo concluído', () => {
    assert.equal(transitionTo('COMPLETED', 'reopen'), 'PENDING');
    assert.throws(() => transitionTo('CANCELLED', 'reopen'), (error) => error.code === 'INVALID_TASK_TRANSITION');
  });

  it('restaura somente ciclo cancelado', () => {
    assert.equal(transitionTo('CANCELLED', 'restore'), 'PENDING');
    assert.throws(() => transitionTo('COMPLETED', 'restore'), (error) => error.code === 'INVALID_TASK_TRANSITION');
  });
});

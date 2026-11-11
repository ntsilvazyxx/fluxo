import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isRetryableTransactionError,
  LOCK_ORDER,
  runCriticalTransaction,
} from '../../src/infrastructure/database/transaction.js';

describe('transações críticas', () => {
  it('repete a transação inteira após deadlock e preserva READ COMMITTED', async () => {
    const optionsSeen = [];
    let attempts = 0;
    const prisma = {
      async $transaction(operation, options) {
        optionsSeen.push(options);
        attempts += 1;

        if (attempts < 3) {
          const error = new Error('deadlock');
          error.code = 'P2034';
          throw error;
        }

        return operation({ attempt: attempts });
      },
    };

    const result = await runCriticalTransaction(
      prisma,
      async (transaction) => transaction.attempt,
      { sleep: async () => {}, random: () => 0 },
    );

    assert.equal(result, 3);
    assert.equal(attempts, 3);
    assert.ok(optionsSeen.every((options) => options.isolationLevel === 'ReadCommitted'));
  });

  it('não repete erros de negócio', async () => {
    let attempts = 0;
    const expectedError = new Error('business conflict');
    const prisma = {
      async $transaction() {
        attempts += 1;
        throw expectedError;
      },
    };

    await assert.rejects(() => runCriticalTransaction(prisma, async () => {}), expectedError);
    assert.equal(attempts, 1);
  });

  it('reconhece códigos MySQL transitórios e documenta a ordem de locks', () => {
    assert.equal(isRetryableTransactionError({ errno: 1213 }), true);
    assert.equal(isRetryableTransactionError({ errno: 1205 }), true);
    assert.deepEqual(LOCK_ORDER, [
      'root-task',
      'subtasks-by-id',
      'cycles-by-id',
      'assignments-by-id',
      'requests-by-id',
    ]);
  });
});

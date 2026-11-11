import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseDatabaseUrl } from '../../src/infrastructure/database/prisma.js';

describe('configuração do banco', () => {
  it('converte uma URL MySQL em opções do driver sem exigir senha', () => {
    assert.deepEqual(parseDatabaseUrl('mysql://root:@127.0.0.1:3306/seaf_tasks_test'), {
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: 'seaf_tasks_test',
    });
  });

  it('rejeita protocolos diferentes de MySQL', () => {
    assert.throws(
      () => parseDatabaseUrl('postgresql://localhost/seaf_tasks_test'),
      /protocolo mysql/,
    );
  });
});

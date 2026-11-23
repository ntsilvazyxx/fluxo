import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertChatHomologationDatabase,
  getChatHomologationDatabaseUrl,
} from '../../testing/chat-homologation-guard.js';

const safeEnvironment = {
  RUN_CHAT_REAL_HOMOLOGATION: '1',
  CHAT_HOMOLOGATION_DATABASE_URL:
    'mysql://seaf_chat_test:senha-temporaria@127.0.0.1:3306/seaf_chat_homologation',
};

describe('guard da homologação real do Chat', () => {
  it('exige opt-in explícito e URL específica', () => {
    assert.throws(() => getChatHomologationDatabaseUrl({}), /RUN_CHAT_REAL_HOMOLOGATION=1/);
    assert.throws(
      () => getChatHomologationDatabaseUrl({ RUN_CHAT_REAL_HOMOLOGATION: '1' }),
      /CHAT_HOMOLOGATION_DATABASE_URL/,
    );
  });

  it('recusa o banco operacional e qualquer nome aproximado', () => {
    assert.throws(
      () =>
        getChatHomologationDatabaseUrl({
          ...safeEnvironment,
          CHAT_HOMOLOGATION_DATABASE_URL:
            'mysql://seaf_chat_test:senha@127.0.0.1:3306/seaf_gestao_functional',
        }),
      /banco operacional/,
    );
    assert.throws(
      () =>
        getChatHomologationDatabaseUrl({
          ...safeEnvironment,
          CHAT_HOMOLOGATION_DATABASE_URL:
            'mysql://seaf_chat_test:senha@127.0.0.1:3306/seaf_chat_homologation_extra',
        }),
      /exatamente seaf_chat_homologation/,
    );
  });

  it('recusa root e credenciais sem senha', () => {
    assert.throws(
      () =>
        getChatHomologationDatabaseUrl({
          ...safeEnvironment,
          CHAT_HOMOLOGATION_DATABASE_URL:
            'mysql://root:senha@127.0.0.1:3306/seaf_chat_homologation',
        }),
      /conta root/,
    );
    assert.throws(
      () =>
        getChatHomologationDatabaseUrl({
          ...safeEnvironment,
          CHAT_HOMOLOGATION_DATABASE_URL:
            'mysql://seaf_chat_test@127.0.0.1:3306/seaf_chat_homologation',
        }),
      /senha não vazia/,
    );
  });

  it('aceita somente a configuração isolada esperada', () => {
    assert.equal(
      getChatHomologationDatabaseUrl(safeEnvironment),
      safeEnvironment.CHAT_HOMOLOGATION_DATABASE_URL,
    );
  });

  it('confirma identidade efetiva e negação de acesso operacional', async () => {
    const client = {
      async $queryRawUnsafe(sql) {
        if (sql.startsWith('SELECT DATABASE()')) {
          return [
            {
              db: 'seaf_chat_homologation',
              version: '10.11.16-MariaDB',
              currentUser: 'seaf_chat_test@127.0.0.1',
            },
          ];
        }
        const error = new Error('SELECT command denied');
        error.code = 1142;
        throw error;
      },
    };

    const result = await assertChatHomologationDatabase(client);
    assert.equal(result.database, 'seaf_chat_homologation');
    assert.equal(result.operationalAccessDenied, true);
  });

  it('falha fechada se a conta alcançar o banco operacional', async () => {
    const client = {
      async $queryRawUnsafe(sql) {
        if (sql.startsWith('SELECT DATABASE()')) {
          return [
            {
              db: 'seaf_chat_homologation',
              version: '10.11.16-MariaDB',
              currentUser: 'seaf_chat_test@127.0.0.1',
            },
          ];
        }
        return [{ 1: 1 }];
      },
    };

    await assert.rejects(
      () => assertChatHomologationDatabase(client),
      /possui acesso ao banco operacional/,
    );
  });
});

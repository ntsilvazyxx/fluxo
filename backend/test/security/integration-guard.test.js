import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateIntegrationEnvironment,
  writableIntegrationDatabase,
  validateIntegrationConnection,
  verifyNoUnexpectedDatabaseAccess,
  expectedMigrations,
} from '../../scripts/integration-guard.js';

describe('Integration Guard — Validação e Isolamento Fail-Closed', () => {
  const validUrl = 'mysql://seaf_it2_run:pass@127.0.0.1:3306/seaf_gestao_integration_2';

  describe('1. Validação do ambiente e bloqueio de schemas não autorizados', () => {
    it('rejeita execução quando RUN_DATABASE_INTEGRATION != 1', () => {
      assert.throws(
        () => validateIntegrationEnvironment({ RUN_DATABASE_INTEGRATION: '0' }),
        /exige RUN_DATABASE_INTEGRATION=1 explícito/
      );
    });

    it('rejeita schema funcional seaf_gestao_functional ou qualquer schema fora da lista autorizada', () => {
      for (const target of ['seaf_gestao_functional', 'seaf_gestao_dev', 'banco_customizado', 'app_db']) {
        assert.throws(
          () =>
            validateIntegrationEnvironment({
              RUN_DATABASE_INTEGRATION: '1',
              INTEGRATION_DATABASE_NAME: target,
              DATABASE_URL: `mysql://u:p@127.0.0.1:3306/${target}`,
              TEST_DATABASE_URL: `mysql://u:p@127.0.0.1:3306/${target}`,
            }),
          /INTEGRATION_DATABASE_NAME deve selecionar explicitamente um dos dois nomes autorizados/
        );
      }
    });

    it('bloqueia escrita no schema preservado da primeira campanha (seaf_gestao_integration)', () => {
      assert.throws(
        () =>
          writableIntegrationDatabase({
            RUN_DATABASE_INTEGRATION: '1',
            INTEGRATION_DATABASE_NAME: 'seaf_gestao_integration',
            DATABASE_URL: 'mysql://u:p@127.0.0.1:3306/seaf_gestao_integration',
            TEST_DATABASE_URL: 'mysql://u:p@127.0.0.1:3306/seaf_gestao_integration',
          }),
        /primeira campanha preservada; escrita e reutilização de seaf_gestao_integration proibidas/
      );
    });

    it('rejeita URLs com host diferente de 127.0.0.1 ou porta diferente de 3306', () => {
      assert.throws(
        () =>
          validateIntegrationEnvironment({
            RUN_DATABASE_INTEGRATION: '1',
            INTEGRATION_DATABASE_NAME: 'seaf_gestao_integration_2',
            DATABASE_URL: 'mysql://u:p@192.168.1.10:3306/seaf_gestao_integration_2',
            TEST_DATABASE_URL: 'mysql://u:p@192.168.1.10:3306/seaf_gestao_integration_2',
          }),
        /destino exclusivo seaf_gestao_integration_2 em 127.0.0.1:3306/
      );
    });

    it('rejeita divergência entre DATABASE_URL e TEST_DATABASE_URL', () => {
      assert.throws(
        () =>
          validateIntegrationEnvironment({
            RUN_DATABASE_INTEGRATION: '1',
            INTEGRATION_DATABASE_NAME: 'seaf_gestao_integration_2',
            DATABASE_URL: validUrl,
            TEST_DATABASE_URL: 'mysql://other_user:pass@127.0.0.1:3306/seaf_gestao_integration_2',
          }),
        /DATABASE_URL e TEST_DATABASE_URL devem ser idênticas/
      );
    });
  });

  describe('2. Validação da conexão, SHOW DATABASES e schemas de metadados permitidos', () => {
    const mockClient = (databases, grants, historyCount = 11) => {
      const migrations = expectedMigrations();
      return {
        $queryRawUnsafe: async (sql) => {
          if (sql.includes('SELECT DATABASE()')) {
            return [{ db: 'seaf_gestao_integration_2', version: '10.11.16-MariaDB', port: 3306 }];
          }
          if (sql.includes('SHOW DATABASES')) {
            return databases.map((d) => ({ Database: d }));
          }
          if (sql.includes('SELECT migration_name')) {
            return migrations.slice(0, historyCount).map((m) => ({
              name: m.name,
              checksum: m.checksum,
              finished: new Date(),
              rolledBack: null,
            }));
          }
          if (sql.includes('SHOW GRANTS')) {
            return grants.map((g) => ({ Grants: g }));
          }
          throw new Error(`SQL inesperado: ${sql}`);
        },
      };
    };

    const validGrants = [
      'GRANT USAGE ON *.* TO `seaf_it2_run`@`127.0.0.1`',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON `seaf\\_gestao\\_integration\\_2`.* TO `seaf_it2_run`@`127.0.0.1`',
    ];

    it('aprova quando apenas o banco autorizado e schemas de metadados (information_schema, performance_schema) estão visíveis', async () => {
      const client = mockClient(['seaf_gestao_integration_2', 'information_schema', 'performance_schema'], validGrants);
      const result = await validateIntegrationConnection(client, undefined, 'seaf_gestao_integration_2');
      assert.equal(result.database, 'seaf_gestao_integration_2');
      assert.equal(result.migrations, 11);
    });

    it('rejeita imediatamente se qualquer schema de aplicação não autorizado estiver visível (mesmo fora da lista institucional)', async () => {
      for (const unauthorizedDb of ['seaf_gestao_functional', 'seaf_gestao_dev', 'outro_banco_qualquer', 'test', 'mysql']) {
        const client = mockClient(['seaf_gestao_integration_2', 'information_schema', unauthorizedDb], validGrants);
        await assert.rejects(
          () => validateIntegrationConnection(client, undefined, 'seaf_gestao_integration_2'),
          new RegExp(`schema não autorizado visível na conexão: "${unauthorizedDb}"`)
        );
      }
    });

    it('rejeita histórico com contagem diferente das 11 migrações oficiais', async () => {
      const client = mockClient(['seaf_gestao_integration_2', 'information_schema'], validGrants, 10);
      await assert.rejects(
        () => validateIntegrationConnection(client, undefined, 'seaf_gestao_integration_2'),
        /histórico deve conter exatamente as onze migrações autorizadas/
      );
    });

    it('rejeita conta de testes se possuir privilégios DDL (CREATE, DROP, ALTER)', async () => {
      const ddlGrants = [
        'GRANT USAGE ON *.* TO `seaf_it2_run`@`127.0.0.1`',
        'GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP ON `seaf\\_gestao\\_integration\\_2`.* TO `seaf_it2_run`@`127.0.0.1`',
      ];
      const client = mockClient(['seaf_gestao_integration_2', 'information_schema'], ddlGrants);
      await assert.rejects(
        () => validateIntegrationConnection(client, undefined, 'seaf_gestao_integration_2'),
        /conta de testes possui DDL ou privilégio inesperado/
      );
    });
  });

  describe('3. Probes sintéticos: diferenciação rigorosa de erro 1044 vs 1049', () => {
    it('aprova probe quando o servidor retorna estritamente erro 1044 (ER_DBACCESS_DENIED_ERROR)', async () => {
      const mockProbe = async () => {
        const err = new Error('Access denied for user');
        err.errno = 1044;
        err.code = 'ER_DBACCESS_DENIED_ERROR';
        throw err;
      };

      await assert.doesNotReject(() => verifyNoUnexpectedDatabaseAccess(validUrl, mockProbe));
    });

    it('rejeita probe se a conexão for permitida (sem erro, significando vazamento de acesso)', async () => {
      const mockProbeSuccess = async () => {
        // Conexão bem-sucedida a banco não autorizado
      };

      await assert.rejects(
        () => verifyNoUnexpectedDatabaseAccess(validUrl, mockProbeSuccess),
        /a conta de integração acessa o banco não autorizado/
      );
    });

    it('rejeita probe quando o servidor retorna erro 1049 (ER_BAD_DB_ERROR, banco inexistente não é prova de isolamento)', async () => {
      const mockProbe1049 = async () => {
        const err = new Error('Unknown database');
        err.errno = 1049;
        err.code = 'ER_BAD_DB_ERROR';
        throw err;
      };

      await assert.rejects(
        () => verifyNoUnexpectedDatabaseAccess(validUrl, mockProbe1049),
        /retornou 1049; o banco pode não existir apesar de a conta ter passado pela verificação de acesso/
      );
    });

    it('rejeita probe quando ocorre erro inesperado de rede/timeout', async () => {
      const mockProbeTimeout = async () => {
        const err = new Error('Connection timeout');
        err.code = 'ETIMEDOUT';
        throw err;
      };

      await assert.rejects(
        () => verifyNoUnexpectedDatabaseAccess(validUrl, mockProbeTimeout),
        /falhou com erro inesperado; acesso não autorizado não pôde ser descartado/
      );
    });
  });
});

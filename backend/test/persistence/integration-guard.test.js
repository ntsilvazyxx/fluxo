import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { it } from 'node:test';
import { expectedMigrations, openGuardedIntegration, validateIntegrationEnvironment, selectedIntegrationDatabase, writableIntegrationDatabase, INTEGRATION_DATABASES, MIGRATION_NAMES } from '../../scripts/integration-guard.js';
import { createIntegrationApp, createIntegrationPrisma, integrationConfig } from '../../testing/integration/context.js';
const url = 'mysql://synthetic_guard@127.0.0.1:3306/seaf_gestao_integration_2';
const environment = { RUN_DATABASE_INTEGRATION: '1', INTEGRATION_DATABASE_NAME: 'seaf_gestao_integration_2', DATABASE_URL: url, TEST_DATABASE_URL: url };
const migrations = expectedMigrations();
const deniedProbe = async () => { throw Object.assign(new Error('access denied'), { errno: 1044 }); };
const guarded = (options) => openGuardedIntegration({ probeDatabase: deniedProbe, ...options });
function fake({ server, history, grants } = {}) {
  let disconnected = false; const queries = [];
  return { queries, get disconnected() { return disconnected; }, async $disconnect() { disconnected = true; },
    async $queryRawUnsafe(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT DATABASE')) return [server ?? { db: 'seaf_gestao_integration_2', port: 3306, version: '10.11.16-MariaDB' }];
      if (sql.startsWith('SELECT migration')) return history ?? migrations.map(m => ({ ...m, finished: new Date(), rolledBack: null }));
      if (sql.startsWith('SHOW GRANTS')) return (grants ?? ['GRANT USAGE ON *.* TO account', dmlGrant('seaf_gestao_integration_2')]).map(grant => ({ grant }));
      throw new Error('SQL inesperado');
    } };
}
for (const database of ['seaf_gestao_dev', 'seaf_gestao_test', 'seaf_gestao_recovery', 'other', 'seaf_gestao_integration_2/extra']) {
  it('recusa destino ' + database + ' antes de conectar', async () => {
    let connected = false; const bad = url.replace('seaf_gestao_integration_2', database);
    await assert.rejects(guarded({ environment: { ...environment, DATABASE_URL: bad, TEST_DATABASE_URL: bad }, connect() { connected = true; } }), /bloqueada/);
    assert.equal(connected, false);
  });
}
for (const bad of [undefined, '', 'not-a-url', url.replace('127.0.0.1', 'localhost'), url.replace(':3306', ':3307'), url.replace(':3306', ''), url.replace('mysql:', 'postgres:'), url + '?database=seaf_gestao_dev', url + '#fragment', url.replace('synthetic_guard@', '')]) {
  it('recusa URL inesperada sem revelar seu valor', () => {
    assert.throws(() => validateIntegrationEnvironment({ ...environment, DATABASE_URL: bad, TEST_DATABASE_URL: bad }), /bloqueada/);
  });
}
it('exige opt-in e duas conexões explícitas idênticas', () => {
  for (const value of [undefined, '0', 'true']) assert.throws(() => validateIntegrationEnvironment({ ...environment, RUN_DATABASE_INTEGRATION: value }));
  assert.throws(() => validateIntegrationEnvironment({ ...environment, TEST_DATABASE_URL: url.replace('synthetic_guard', 'different') }), /DATABASE_URL e TEST_DATABASE_URL/);
  assert.equal(validateIntegrationEnvironment(environment), url);
});
it('aceita seis migrações e DML restrito usando somente três consultas de leitura', async () => {
  const client = fake(); assert.equal(await guarded({ environment, connect: async () => client }), client);
  assert.equal(client.queries.length, 3); assert.ok(client.queries.every(sql => /^(SELECT|SHOW) /.test(sql)));
});
for (const server of [{ db: 'seaf_gestao_test', port: 3306, version: '10.11.16-MariaDB' }, { db: 'seaf_gestao_integration_2', port: 3307, version: '10.11.16-MariaDB' }, { db: 'seaf_gestao_integration_2', port: 3306, version: '8.0-MySQL' }]) {
  it('recusa identidade real divergente e desconecta', async () => {
    const client = fake({ server }); await assert.rejects(guarded({ environment, connect: async () => client }));
    assert.equal(client.disconnected, true); assert.equal(client.queries.length, 1);
  });
}
for (const mutate of [rows => rows.slice(1), rows => [...rows, rows[0]], rows => rows.map((r,i) => i ? r : { ...r, checksum: 'changed' }), rows => rows.map((r,i) => i ? r : { ...r, finished: null }), rows => rows.map((r,i) => i ? r : { ...r, rolledBack: new Date() })]) {
  it('recusa migração ausente, extra, modificada ou incompleta', async () => {
    const client = fake({ history: mutate(migrations.map(m => ({ ...m, finished: new Date() }))) });
    await assert.rejects(guarded({ environment, connect: async () => client }), /seis|incompleto/); assert.equal(client.disconnected, true);
  });
}
for (const grant of ['GRANT ALL PRIVILEGES ON *.* TO account', 'GRANT SELECT, INSERT, UPDATE, DELETE ON seaf_gestao_test.* TO account', 'GRANT SELECT, INSERT, UPDATE, DELETE, DROP ON seaf_gestao_integration_2.* TO account', 'GRANT SELECT ON seaf_gestao_integration_2.* TO account', 'GRANT SELECT, INSERT, UPDATE, DELETE ON seaf_gestao_integration_2.* TO account WITH GRANT OPTION', 'GRANT role_name TO account']) {
  it('recusa privilégios excessivos ou insuficientes', async () => {
    const client = fake({ grants: [grant] }); await assert.rejects(guarded({ environment, connect: async () => client })); assert.equal(client.disconnected, true);
  });
}
it('runner e execução direta não contornam o guard com destino protegido', () => {
  const childEnvironment = { ...process.env, RUN_DATABASE_INTEGRATION: '1', INTEGRATION_DATABASE_NAME: 'seaf_gestao_integration_2', DATABASE_URL: 'mysql://invalid@127.0.0.1:1/seaf_gestao_dev', TEST_DATABASE_URL: 'mysql://invalid@127.0.0.1:1/seaf_gestao_dev' };
  delete childEnvironment.NODE_TEST_CONTEXT;
  for (const entry of ['scripts/run-integration.js', ...readdirSync(new URL('../integration/', import.meta.url)).filter(name => name.endsWith('.test.js')).map(name => `test/integration/${name}`)]) {
    const result = spawnSync(process.execPath, entry.startsWith('test/') ? ['--test', entry] : [entry], { cwd: new URL('../../', import.meta.url), encoding: 'utf8', env: childEnvironment });
    assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /destino exclusivo seaf_gestao_integration_2/);
  }
});

function environmentFor(name) {
  const selectedUrl = new URL(url); selectedUrl.pathname = `/${name}`;
  return { ...environment, INTEGRATION_DATABASE_NAME: name, DATABASE_URL: selectedUrl.href, TEST_DATABASE_URL: selectedUrl.href };
}
const dmlGrant = (name) => `GRANT SELECT, INSERT, UPDATE, DELETE ON ${String.fromCharCode(96)}${name.replaceAll('_', String.fromCharCode(92) + '_')}${String.fromCharCode(96)}.* TO account`;
for (const name of INTEGRATION_DATABASES) {
  it(`reconhece exatamente ${name} em preflight simulado de leitura`, async () => {
    const env = environmentFor(name);
    assert.equal(selectedIntegrationDatabase(env), name);
    const client = fake({ server: { db: name, port: 3306, version: '10.11.16-MariaDB' }, grants: [dmlGrant(name)] });
    assert.equal(await guarded({ environment: env, connect: async () => client }), client);
    assert.equal(client.queries.length, 3); assert.ok(client.queries.every(sql => /^(SELECT|SHOW) /.test(sql)));
    const quotedEscape = fake({ server: { db: name, port: 3306, version: '10.11.16-MariaDB' }, grants: [dmlGrant(name).replaceAll(String.fromCharCode(92), String.fromCharCode(92).repeat(2))] });
    assert.equal(await guarded({ environment: env, connect: async () => quotedEscape }), quotedEscape);
  });
}
for (const name of [undefined, '', 'seaf_gestao_integration_20', 'seaf_gestao_integration_3', 'prefix_seaf_gestao_integration_2', 'seaf_gestao_integration_2 ', 'SEAF_GESTAO_INTEGRATION_2', 'seaf_gestao_dev', 'seaf_gestao_test', 'seaf_gestao_recovery']) {
  it('recusa seleção ausente/aproximada/protegida antes de abrir conexão', async () => {
    let connected = false;
    await assert.rejects(guarded({ environment: { ...environment, INTEGRATION_DATABASE_NAME: name }, connect: async () => { connected = true; } }), /INTEGRATION_DATABASE_NAME/);
    assert.equal(connected, false);
  });
}
for (const path of ['seaf_gestao_integration', 'seaf_gestao_integration_20', 'seaf_gestao_integration_2_backup']) {
  it('seleção explícita não permite usar a URL de outra campanha ou sufixo', async () => {
    const unexpected = environmentFor(path).DATABASE_URL; let connected = false;
    await assert.rejects(guarded({ environment: { ...environment, DATABASE_URL: unexpected, TEST_DATABASE_URL: unexpected }, connect: async () => { connected = true; } }), /destino exclusivo/);
    assert.equal(connected, false);
  });
}
it('recusa URLs misturando as duas campanhas autorizadas', () => {
  assert.throws(() => validateIntegrationEnvironment({ ...environment, TEST_DATABASE_URL: environmentFor('seaf_gestao_integration').TEST_DATABASE_URL }), /destino exclusivo/);
});
for (const selected of INTEGRATION_DATABASES) {
  it('recusa banco efetivo de outra campanha mesmo quando ambos os nomes estão na lista', async () => {
    const actual = INTEGRATION_DATABASES.find(name => name !== selected);
    const client = fake({ server: { db: actual, port: 3306, version: '10.11.16-MariaDB' } });
    await assert.rejects(guarded({ environment: environmentFor(selected), connect: async () => client }), /conexão real/);
    assert.equal(client.queries.length, 1); assert.equal(client.disconnected, true);
  });
}
for (const grants of [[dmlGrant('seaf_gestao_integration')], [dmlGrant('seaf_gestao_integration_2'), dmlGrant('seaf_gestao_integration')], ['GRANT SELECT, INSERT, UPDATE, DELETE ON seaf_gestao_integration%.* TO account'], ['GRANT SELECT, INSERT, UPDATE, DELETE ON seaf_gestao_integration_2.* TO account']]) {
  it('conta da segunda campanha não pode ter acesso à primeira ou a padrão de schemas', async () => {
    const client = fake({ grants });
    await assert.rejects(guarded({ environment, connect: async () => client }), /outro banco/);
    assert.equal(client.disconnected, true);
  });
}
it('primeira campanha só é elegível para leitura; não para API/fixtures/configuração de execução', async () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, environmentFor('seaf_gestao_integration'));
    assert.throws(() => writableIntegrationDatabase(process.env), /primeira campanha preservada/);
    await assert.rejects(createIntegrationPrisma(), /primeira campanha preservada/);
    assert.throws(() => integrationConfig(), /primeira campanha preservada/);
    assert.equal(writableIntegrationDatabase(environment), 'seaf_gestao_integration_2');
    const runner = readFileSync(new URL('../../scripts/run-integration.js', import.meta.url), 'utf8');
    assert.ok(runner.indexOf('writableIntegrationDatabase(process.env)') < runner.indexOf('await openGuardedIntegration()'));
  } finally {
    for (const key of Object.keys(environment)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
it('lista autorizada é fechada e imutável', () => {
  assert.deepEqual(INTEGRATION_DATABASES, ['seaf_gestao_integration', 'seaf_gestao_integration_2']);
  assert.throws(() => INTEGRATION_DATABASES.push('seaf_gestao_dev'), TypeError);
});
it('todas as suítes usam apenas o contexto exclusivo de integração', () => {
  for (const file of readdirSync(new URL('../integration/', import.meta.url)).filter(name => name.endsWith('.test.js'))) {
    const source = readFileSync(new URL('../integration/' + file, import.meta.url), 'utf8');
    for (const forbidden of ['infrastructure/database/prisma.js', 'quality/test-database.js', 'quality/fixtures.js', 'src/app.js', 'src/server.js', 'new PrismaClient(', 'new PrismaMariaDb(']) assert.equal(source.includes(forbidden), false, file);
    assert.ok(source.includes('testing/integration/context.js'), file);
  }
});
it('API não aceita cliente que não passou pela verificação real', () => {
  assert.throws(() => createIntegrationApp({ prisma: {} }), /validada/);
});
it('contexto recusa conexão adicional antes de abrir cliente ou criar fixtures', async () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, environment);
    await assert.rejects(createIntegrationPrisma('mysql://synthetic_guard@127.0.0.1:3306/seaf_gestao_recovery'), /destino exclusivo/);
    await assert.rejects(createIntegrationPrisma(url.replace('synthetic_guard', 'different')), /diverge/);
  } finally {
    for (const key of Object.keys(environment)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
it('contexto força e-mail desligado e armazenamento temporário mesmo com overrides', () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, environment);
    const config = integrationConfig({ mailEnabled: true, imageStoragePath: 'private-real', attachmentStoragePath: 'private-real' });
    assert.equal(config.mailEnabled, false); assert.notEqual(config.imageStoragePath, 'private-real'); assert.notEqual(config.attachmentStoragePath, 'private-real');
    assert.ok(config.imageStoragePath.includes('seaf-integration-')); assert.ok(config.attachmentStoragePath.includes('seaf-integration-'));
    assert.match(config.authDataEncryptionKey, /^[a-f0-9]{64}$/);
  } finally {
    for (const key of Object.keys(environment)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});

it('probes os bancos proibidos com a mesma conta e aceita somente negação MariaDB 1044', async () => {
  const client = fake();
  const probes = [];
  await guarded({
    environment,
    connect: async () => client,
    probeDatabase: async (databaseUrl, databaseName) => {
      probes.push({ databaseUrl, databaseName });
      if (probes.length % 2 === 0) {
        throw Object.assign(new Error('access denied'), {
          code: 'P1010',
          meta: { driverAdapterError: { cause: { originalCode: '1044' } } },
        });
      }
      throw Object.assign(new Error('access denied'), { errno: 1044 });
    },
  });

  const names = probes.map(({ databaseName }) => databaseName);
  assert.deepEqual(names.slice(0, 1), ['test']);
  assert.match(names[1], /^test_[a-f0-9]{32}$/);
  assert.match(names[2], /^seaf_guard_unauthorized_[a-f0-9]{32}$/);
  assert.deepEqual(names.slice(3), [
    'seaf_gestao_dev',
    'seaf_gestao_test',
    'seaf_gestao_recovery',
    'seaf_gestao_integration',
    'mysql',
    'phpmyadmin',
  ]);
  for (const probe of probes) {
    const probeUrl = new URL(probe.databaseUrl);
    assert.equal(probeUrl.username, 'synthetic_guard');
    assert.equal(probeUrl.hostname, '127.0.0.1');
    assert.equal(probeUrl.port, '3306');
    assert.equal(probeUrl.pathname, `/${probe.databaseName}`);
  }
});

for (const databaseName of ['test', 'test_*', 'seaf_gestao_dev', 'seaf_gestao_test', 'seaf_gestao_recovery', 'seaf_gestao_integration', 'mysql', 'phpmyadmin']) {
  it(`bloqueia acesso inesperado a ${databaseName}`, async () => {
    const client = fake();
    await assert.rejects(guarded({
      environment,
      connect: async () => client,
      probeDatabase: async (_databaseUrl, probedName) => {
        if (databaseName === 'test_*' ? /^test_[a-f0-9]{32}$/.test(probedName) : probedName === databaseName) return;
        throw Object.assign(new Error('access denied'), { errno: 1044 });
      },
    }), /acessa o banco não autorizado/);
    assert.equal(client.disconnected, true);
  });
}

it('bloqueia acesso ao banco não autorizado de controle', async () => {
  const client = fake();
  let controlDatabase;
  await assert.rejects(guarded({
    environment,
    connect: async () => client,
    probeDatabase: async (_databaseUrl, databaseName) => {
      if (databaseName.startsWith('seaf_guard_unauthorized_')) {
        controlDatabase = databaseName;
        return;
      }
      throw Object.assign(new Error('access denied'), { errno: 1044 });
    },
  }), /acessa o banco não autorizado/);
  assert.match(controlDatabase, /^seaf_guard_unauthorized_[a-f0-9]{32}$/);
  assert.equal(client.disconnected, true);
});

it('trata 1049 em schema aleatório inexistente como possível privilégio indevido', async () => {
  const client = fake();
  await assert.rejects(guarded({
    environment,
    connect: async () => client,
    probeDatabase: async (_databaseUrl, databaseName) => {
      if (/^test_[a-f0-9]{32}$/.test(databaseName)) {
        throw Object.assign(new Error('unknown database'), { cause: { originalCode: '1049' } });
      }
      throw Object.assign(new Error('access denied'), { errno: 1044 });
    },
  }), /1049/);
  assert.equal(client.disconnected, true);
});

for (const error of [
  Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }),
  Object.assign(new Error('unclassified database error'), { code: 'P1001' }),
  new Error('unexpected probe failure'),
]) {
  it('falha fechada quando um probe não retorna negação 1044', async () => {
    const client = fake();
    await assert.rejects(guarded({
      environment,
      connect: async () => client,
      probeDatabase: async () => { throw error; },
    }), /erro inesperado/);
    assert.equal(client.disconnected, true);
  });
}

it('mantém os checksums calculados dos arquivos e interrompe antes dos probes em divergência', async () => {
  const expected = expectedMigrations();
  assert.deepEqual(expected.map(({ name }) => name), MIGRATION_NAMES);
  for (const migration of expected) {
    const contents = readFileSync(new URL(`../../prisma/migrations/${migration.name}/migration.sql`, import.meta.url));
    assert.equal(migration.checksum, createHash('sha256').update(contents).digest('hex'));
  }

  const client = fake({
    history: migrations.map((migration, index) => ({
      ...migration,
      checksum: index === 0 ? '0'.repeat(64) : migration.checksum,
      finished: new Date(),
      rolledBack: null,
    })),
  });
  let probes = 0;
  await assert.rejects(guarded({
    environment,
    connect: async () => client,
    probeDatabase: async () => { probes += 1; throw Object.assign(new Error('access denied'), { errno: 1044 }); },
  }), /incompleto/);
  assert.equal(probes, 0);
  assert.equal(client.disconnected, true);
});

for (const missing of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
  it(`mantém obrigatório o privilégio ${missing} da conta de execução`, async () => {
    const privileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].filter((privilege) => privilege !== missing);
    const client = fake({ grants: [`GRANT ${privileges.join(', ')} ON seaf_gestao_integration_2.* TO account`] });
    await assert.rejects(guarded({ environment, connect: async () => client }), /privilégios|precisa de SELECT/);
    assert.equal(client.disconnected, true);
  });
}

it('reconhece P2010 somente quando a causa identifica MariaDB 1044', async () => {
  const client = fake();
  let probes = 0;
  await guarded({
    environment,
    connect: async () => client,
    probeDatabase: async () => {
      probes += 1;
      throw Object.assign(new Error('query failed'), {
        code: 'P2010',
        meta: { driverAdapterError: { cause: { originalCode: '1044', kind: 'DatabaseAccessDenied' } } },
      });
    },
  });
  assert.equal(probes, 9);
});

it('bloqueia erro MariaDB 1049 do driver direto', async () => {
  const client = fake();
  await assert.rejects(guarded({
    environment,
    connect: async () => client,
    probeDatabase: async () => {
      throw Object.assign(new Error('unknown database'), { errno: 1049, code: 'ER_BAD_DB_ERROR' });
    },
  }), /1049/);
  assert.equal(client.disconnected, true);
});

it('bloqueia P2010 com causa MariaDB 1049', async () => {
  const client = fake();
  let probes = 0;
  await assert.rejects(guarded({
    environment,
    connect: async () => client,
    probeDatabase: async () => {
      probes += 1;
      throw Object.assign(new Error('query failed'), {
        code: 'P2010',
        meta: { driverAdapterError: { cause: { originalCode: '1049', kind: 'DatabaseDoesNotExist' } } },
      });
    },
  }), /1049/);
  assert.equal(probes, 1);
  assert.equal(client.disconnected, true);
});

it('bloqueia P2010 sem código MariaDB identificável', async () => {
  const client = fake();
  await assert.rejects(guarded({
    environment,
    connect: async () => client,
    probeDatabase: async () => {
      throw Object.assign(new Error('query failed'), {
        code: 'P2010',
        meta: { driverAdapterError: { cause: { kind: 'mysql' } } },
      });
    },
  }), /erro inesperado/);
  assert.equal(client.disconnected, true);
});

it('não classifica 45028 de timeout do driver como negação 1044', async () => {
  const client = fake();
  await assert.rejects(guarded({
    environment,
    connect: async () => client,
    probeDatabase: async () => {
      throw Object.assign(new Error('pool acquisition timeout'), {
        code: 'P2010',
        meta: { driverAdapterError: { cause: { code: 45028, originalCode: '45028', kind: 'mysql' } } },
      });
    },
  }), /erro inesperado/);
  assert.equal(client.disconnected, true);
});

it('não classifica falha de autenticação MariaDB 1045 como negação do schema', async () => {
  const client = fake();
  await assert.rejects(guarded({
    environment,
    connect: async () => client,
    probeDatabase: async () => {
      throw Object.assign(new Error('authentication failed'), { errno: 1045, code: 'ER_ACCESS_DENIED_ERROR' });
    },
  }), /erro inesperado/);
  assert.equal(client.disconnected, true);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { it } from 'node:test';
import { expectedMigrations, openGuardedIntegration, validateIntegrationEnvironment } from '../../scripts/integration-guard.js';
import { createIntegrationApp, createIntegrationPrisma, integrationConfig } from '../../testing/integration/context.js';
const url = 'mysql://synthetic_guard@127.0.0.1:3306/seaf_gestao_integration';
const environment = { RUN_DATABASE_INTEGRATION: '1', DATABASE_URL: url, TEST_DATABASE_URL: url };
const migrations = expectedMigrations();
function fake({ server, history, grants } = {}) {
  let disconnected = false; const queries = [];
  return { queries, get disconnected() { return disconnected; }, async $disconnect() { disconnected = true; },
    async $queryRawUnsafe(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT DATABASE')) return [server ?? { db: 'seaf_gestao_integration', port: 3306, version: '10.11.16-MariaDB' }];
      if (sql.startsWith('SELECT migration')) return history ?? migrations.map(m => ({ ...m, finished: new Date(), rolledBack: null }));
      if (sql.startsWith('SHOW GRANTS')) return (grants ?? ['GRANT USAGE ON *.* TO account', 'GRANT SELECT, INSERT, UPDATE, DELETE ON ' + String.fromCharCode(96) + 'seaf_gestao_integration' + String.fromCharCode(96) + '.* TO account']).map(grant => ({ grant }));
      throw new Error('SQL inesperado');
    } };
}
for (const database of ['seaf_gestao_dev', 'seaf_gestao_test', 'seaf_gestao_recovery', 'other', 'seaf_gestao_integration/extra']) {
  it('recusa destino ' + database + ' antes de conectar', async () => {
    let connected = false; const bad = url.replace('seaf_gestao_integration', database);
    await assert.rejects(openGuardedIntegration({ environment: { ...environment, DATABASE_URL: bad, TEST_DATABASE_URL: bad }, connect() { connected = true; } }), /bloqueada/);
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
  const client = fake(); assert.equal(await openGuardedIntegration({ environment, connect: async () => client }), client);
  assert.equal(client.queries.length, 3); assert.ok(client.queries.every(sql => /^(SELECT|SHOW) /.test(sql)));
});
for (const server of [{ db: 'seaf_gestao_test', port: 3306, version: '10.11.16-MariaDB' }, { db: 'seaf_gestao_integration', port: 3307, version: '10.11.16-MariaDB' }, { db: 'seaf_gestao_integration', port: 3306, version: '8.0-MySQL' }]) {
  it('recusa identidade real divergente e desconecta', async () => {
    const client = fake({ server }); await assert.rejects(openGuardedIntegration({ environment, connect: async () => client }));
    assert.equal(client.disconnected, true); assert.equal(client.queries.length, 1);
  });
}
for (const mutate of [rows => rows.slice(1), rows => [...rows, rows[0]], rows => rows.map((r,i) => i ? r : { ...r, checksum: 'changed' }), rows => rows.map((r,i) => i ? r : { ...r, finished: null }), rows => rows.map((r,i) => i ? r : { ...r, rolledBack: new Date() })]) {
  it('recusa migração ausente, extra, modificada ou incompleta', async () => {
    const client = fake({ history: mutate(migrations.map(m => ({ ...m, finished: new Date() }))) });
    await assert.rejects(openGuardedIntegration({ environment, connect: async () => client }), /seis|incompleto/); assert.equal(client.disconnected, true);
  });
}
for (const grant of ['GRANT ALL PRIVILEGES ON *.* TO account', 'GRANT SELECT, INSERT, UPDATE, DELETE ON seaf_gestao_test.* TO account', 'GRANT SELECT, INSERT, UPDATE, DELETE, DROP ON seaf_gestao_integration.* TO account', 'GRANT SELECT ON seaf_gestao_integration.* TO account', 'GRANT SELECT, INSERT, UPDATE, DELETE ON seaf_gestao_integration.* TO account WITH GRANT OPTION', 'GRANT role_name TO account']) {
  it('recusa privilégios excessivos ou insuficientes', async () => {
    const client = fake({ grants: [grant] }); await assert.rejects(openGuardedIntegration({ environment, connect: async () => client })); assert.equal(client.disconnected, true);
  });
}
it('runner e execução direta não contornam o guard com destino protegido', () => {
  const childEnvironment = { ...process.env, RUN_DATABASE_INTEGRATION: '1', DATABASE_URL: 'mysql://invalid@127.0.0.1:1/seaf_gestao_dev', TEST_DATABASE_URL: 'mysql://invalid@127.0.0.1:1/seaf_gestao_dev' };
  delete childEnvironment.NODE_TEST_CONTEXT;
  for (const entry of ['scripts/run-integration.js', ...readdirSync(new URL('../integration/', import.meta.url)).filter(name => name.endsWith('.test.js')).map(name => `test/integration/${name}`)]) {
    const result = spawnSync(process.execPath, entry.startsWith('test/') ? ['--test', entry] : [entry], { cwd: new URL('../../', import.meta.url), encoding: 'utf8', env: childEnvironment });
    assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /destino exclusivo seaf_gestao_integration/);
  }
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

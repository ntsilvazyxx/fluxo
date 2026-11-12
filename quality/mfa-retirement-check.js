// Read-only evidence before/after the compensatory migration. Never logs secrets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { testDatabase, checkDatabase } from './test-database.js';
const mode = process.argv[2];
if (!['before', 'after', 'verify-archives'].includes(mode)) throw Error('Use before, after or verify-archives');
const { prisma } = testDatabase();
const digest = (s) => createHash('sha256').update(s).digest('hex');
const canonical = (row) => JSON.stringify(Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key]])), (_key, value) => typeof value === 'bigint' ? value.toString() : value);
const normalizedName = (name) => ({ legacy_mfa_auth_challenges: 'auth_challenges', legacy_mfa_credentials: 'mfa_credentials' })[name] ?? name;
const quote = (s) => { if (!/^\w+$/.test(s)) throw Error('Invalid identifier'); return `\`${s}\``; };
try {
  const server = await checkDatabase(prisma);
  const tables = await prisma.$queryRaw`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`;
  const evidence = {};
  for (const { name } of tables) {
    if (name === '_prisma_migrations') continue;
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM ${quote(name)}`);
    const normalized = rows.map((row) => {
      if (name === 'user_sessions' && Object.hasOwn(row, 'legacyMfaVerifiedAt')) {
        row.mfaVerifiedAt = row.legacyMfaVerifiedAt; delete row.legacyMfaVerifiedAt;
      }
      return canonical(row);
    }).sort();
    evidence[normalizedName(name)] = { count: rows.length, sha256: digest(normalized.join('\n')) };
  }
  const migrations = await prisma.$queryRaw`SELECT migration_name AS name, checksum, finished_at AS finished, rolled_back_at AS rolledBack FROM _prisma_migrations ORDER BY migration_name`;
  for (const migration of migrations) {
    assert.ok(migration.finished); assert.equal(migration.rolledBack, null);
    assert.equal(migration.checksum, digest(readFileSync(`backend/prisma/migrations/${migration.name}/migration.sql`)), migration.name);
  }
  mkdirSync('.artifacts', { recursive: true });
  if (mode === 'before') {
    assert.ok(tables.some(({ name }) => name === 'auth_challenges'));
    assert.ok(!tables.some(({ name }) => name.startsWith('legacy_mfa')));
    writeFileSync('.artifacts/mfa-retirement-before.json', JSON.stringify({ server, evidence, migrations }, null, 2));
  } else {
    const before = JSON.parse(readFileSync('.artifacts/mfa-retirement-before.json', 'utf8'));
    if (mode === 'after') assert.deepEqual(evidence, before.evidence, 'Every table row must be preserved');
    else for (const table of ['auth_challenges', 'mfa_credentials']) assert.deepEqual(evidence[table], before.evidence[table], 'Archived credentials must not change during tests');
    assert.equal(migrations.length, before.migrations.length + 1);
    for (const old of before.migrations) assert.equal(migrations.find((m) => m.name === old.name)?.checksum, old.checksum);
    assert.ok(tables.some(({ name }) => name === 'legacy_mfa_auth_challenges'));
    assert.ok(tables.some(({ name }) => name === 'legacy_mfa_credentials'));
    assert.ok(!tables.some(({ name }) => ['auth_challenges', 'mfa_credentials'].includes(name)));
    const report = { checkedAt: new Date().toISOString(), server, ...(mode === 'after' ? { allRowsPreserved: true } : { archivesUnchangedAfterTests: true }), tables: Object.keys(evidence).length, archivedChallenges: evidence.auth_challenges, archivedCredentials: evidence.mfa_credentials, migrations: migrations.map(({ name, checksum }) => ({ name, checksum })) };
    writeFileSync(mode === 'after' ? '.artifacts/mfa-retirement-result.json' : '.artifacts/mfa-retirement-post-tests.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
} finally { await prisma.$disconnect(); }

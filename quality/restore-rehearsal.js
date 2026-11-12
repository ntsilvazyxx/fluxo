import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { testDatabase, checkDatabase } from './test-database.js';
import { createPrismaClient, parseDatabaseUrl } from '../backend/src/infrastructure/database/prisma.js';
const { url, prisma: source } = testDatabase();
const connection = parseDatabaseUrl(url);
const targetName = `seaf_restore_test_${randomUUID().replaceAll('-', '')}`;
// Destination generated here, never supplied by a CLI argument or environment variable.
if (!/^seaf_restore_test_[a-f0-9]{32}$/.test(targetName) || ['seaf_gestao_dev', 'seaf_gestao_test'].includes(targetName)) throw Error('Destino proibido');
const bin = process.env.MARIADB_BIN ?? 'C:/xampp/mysql/bin';
const dumpFile = path.resolve(`.artifacts/restore/${targetName}.sql`);
const args = [`--host=${connection.host}`, `--port=${connection.port}`, `--user=${connection.user}`, '--default-character-set=utf8mb4'];
const childEnv = { ...process.env, MYSQL_PWD: connection.password };
const run = (exe, extra, input) => {
  const result = spawnSync(path.join(bin, exe), [...args, ...extra], { env: childEnv, input, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw Error(`Falha em ${exe}; código ${result.status}. Diagnóstico não inclui dump ou credenciais.`);
};
const quote = (name) => { if (!/^\w+$/.test(name)) throw Error('Identificador inválido'); return `\`${name}\``; };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v);
async function snapshot(prisma) {
  const tables = await prisma.$queryRaw`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`;
  const rows = [];
  for (const { name } of tables) {
    // Identifier comes exclusively from information_schema and is validated above.
    const data = await prisma.$queryRawUnsafe(`SELECT * FROM ${quote(name)}`);
    rows.push({ table: name, count: data.length, hash: digest(data.map(canonical).sort().join('\n')) });
  }
  const triggers = await prisma.$queryRaw`SELECT TRIGGER_NAME AS name, ACTION_TIMING AS timing, EVENT_MANIPULATION AS event, EVENT_OBJECT_TABLE AS tableName, ACTION_STATEMENT AS statement FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME`;
  const constraints = await prisma.$queryRaw`SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() ORDER BY TABLE_NAME, CONSTRAINT_NAME`;
  const indexes = await prisma.$queryRaw`SELECT TABLE_NAME AS tableName, INDEX_NAME AS name, COLUMN_NAME AS columnName, SEQ_IN_INDEX AS position, NON_UNIQUE AS nonUnique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
  const fks = await prisma.$queryRaw`SELECT CONSTRAINT_NAME AS constraintName, TABLE_NAME AS tableName, COLUMN_NAME AS columnName, REFERENCED_TABLE_NAME AS targetTable, REFERENCED_COLUMN_NAME AS targetColumn FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`;
  let orphans = 0;
  const groups = Object.groupBy(fks, (fk) => `${fk.tableName}/${fk.constraintName}`);
  for (const columns of Object.values(groups)) {
    const fk = columns[0];
    const join = columns.map((c) => `a.${quote(c.columnName)}=b.${quote(c.targetColumn)}`).join(' AND ');
    const nonNull = columns.map((c) => `a.${quote(c.columnName)} IS NOT NULL`).join(' AND ');
    const [row] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM ${quote(fk.tableName)} a LEFT JOIN ${quote(fk.targetTable)} b ON ${join} WHERE ${nonNull} AND b.${quote(fk.targetColumn)} IS NULL`);
    orphans += Number(row.n);
  }
  const normalizedTriggers = triggers.map((t) => ({ ...t, statement: t.statement.replace(/\r\n/g, '\n') }));
  return { rows, triggerHash: digest(canonical(normalizedTriggers)), triggerCount: triggers.length, constraintHash: digest(canonical(constraints)), constraintCount: constraints.length, indexHash: digest(canonical(indexes)), foreignKeyColumns: fks.length, orphans };
}
let restored;
try {
  const db = await checkDatabase(source);
  const existing = await source.$queryRaw`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=${targetName}`;
  if (existing.length) throw Error('Destino já existe; execução interrompida sem sobrescrever.');
  const before = await snapshot(source); if (before.orphans) throw Error('Origem possui órfãos; não prosseguir.');
  mkdirSync(path.dirname(dumpFile), { recursive: true });
  const start = performance.now();
  run('mysqldump.exe', ['--single-transaction', '--skip-lock-tables', '--routines', '--events', '--triggers', '--hex-blob', '--skip-add-drop-table', `--result-file=${dumpFile}`, connection.database]);
  const sql = readFileSync(dumpFile);
  if (/^\s*(CREATE DATABASE|DROP DATABASE|USE\s+)/im.test(sql.toString('utf8'))) throw Error('Dump contém seleção de banco; importação recusada.');
  const backupMs = performance.now() - start;
  // Only this newly generated, confirmed absent destination is created/imported.
  run('mysql.exe', ['--execute', `CREATE DATABASE ${quote(targetName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`]);
  const restoreStart = performance.now(); run('mysql.exe', [targetName], sql);
  const cloneUrl = new URL(url); cloneUrl.pathname = `/${targetName}`; restored = createPrismaClient(cloneUrl.toString());
  const [confirmed] = await restored.$queryRaw`SELECT DATABASE() AS db`;
  if (confirmed.db !== targetName) throw Error('Conexão restaurada incorreta');
  const after = await snapshot(restored);
  const equal = canonical(before) === canonical(after);
  if (!equal) { writeFileSync('.artifacts/restore-mismatch.json', JSON.stringify({ targetName, before, after }, null, 2)); throw Error('Backup restaurado difere da origem; diagnóstico por hashes registrado.'); }
  // Prove historical trigger enforcement without leaving mutations behind.
  const audit = await restored.auditEvent.findFirst(); let appendOnlyBlocked = false;
  if (audit) {
    try { await restored.auditEvent.update({ where: { id: audit.id }, data: { reason: 'restore-probe' } }); }
    catch { appendOnlyBlocked = true; }
    if (!appendOnlyBlocked) throw Error('Trigger de auditoria não protege o restore');
  }
  const report = { generatedAt: new Date(), source: db, destination: targetName, backupSha256: digest(sql), bytes: sql.length, backupMs: +backupMs.toFixed(2), restoreAndVerificationMs: +(performance.now() - restoreStart).toFixed(2), equal, appendOnlyBlocked, ...after, retainedForInspection: true };
  writeFileSync('.artifacts/restore-result.json', JSON.stringify(report, null, 2));
  console.info(JSON.stringify({ ...report, rows: report.rows.map(({ table, count }) => ({ table, count })) }, null, 2));
} finally { await restored?.$disconnect(); await source.$disconnect(); }
// No DROP DATABASE: the isolated clone is retained for authorized inspection/removal.

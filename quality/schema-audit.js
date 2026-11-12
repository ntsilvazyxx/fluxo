import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { testDatabase, checkDatabase } from './test-database.js';

const { prisma } = testDatabase();
try {
  const db = await checkDatabase(prisma);
  const migrations = await prisma.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
  const expectedTriggers = [];
  const directories = readdirSync('backend/prisma/migrations', { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  if (migrations.length !== directories.length) throw Error('Quantidade de migrações divergente');
  for (const name of directories) {
    const content = readFileSync(`backend/prisma/migrations/${name}/migration.sql`);
    const row = migrations.find((m) => m.migration_name === name);
    if (!row?.finished_at || row.rolled_back_at || row.checksum !== createHash('sha256').update(content).digest('hex')) throw Error(`Migração divergente: ${name}`);
    expectedTriggers.push(...[...content.toString('utf8').matchAll(/CREATE TRIGGER\s+`?(\w+)`?/gi)].map((match) => match[1]));
  }
  const triggers = await prisma.$queryRaw`SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()`;
  const uniqueExpectedTriggers = [...new Set(expectedTriggers)].sort();
  const missingTriggers = uniqueExpectedTriggers.filter((name) => !triggers.some((t) => t.name === name));
  if (missingTriggers.length) throw Error(`Triggers ausentes: ${missingTriggers.join(',')}`);
  const constraints = await prisma.$queryRaw`SELECT CONSTRAINT_TYPE AS type, COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() GROUP BY CONSTRAINT_TYPE`;
  const generated = await prisma.$queryRaw`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND EXTRA LIKE '%GENERATED%'`;
  const charset = await prisma.$queryRaw`SELECT DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collationName FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()`;
  const output = { db, migrations: directories, expectedTriggers: uniqueExpectedTriggers, foundTriggers: triggers.map((t) => t.name).sort(), missingTriggers, constraints, generated, charset };
  const json = JSON.stringify(output, (_key, value) => typeof value === 'bigint' ? Number(value) : value, 2);
  mkdirSync('.artifacts', { recursive: true }); writeFileSync('.artifacts/schema-audit.json', json); console.info(json);
} finally { await prisma.$disconnect(); }

import { Prisma } from '@prisma/client';

const RETRYABLE_PRISMA_CODES = new Set(['P2034']);
const RETRYABLE_DATABASE_CODES = new Set([
  '1205',
  '1213',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
]);

const normalizeIds = (ids = []) => [...new Set(ids)].sort();

const wait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export function isRetryableTransactionError(error) {
  if (RETRYABLE_PRISMA_CODES.has(error?.code)) {
    return true;
  }

  const databaseCode = String(
    error?.meta?.database_error_code ?? error?.cause?.errno ?? error?.errno ?? '',
  );

  return RETRYABLE_DATABASE_CODES.has(databaseCode);
}

export async function runCriticalTransaction(prisma, operation, options = {}) {
  const {
    maxRetries = 2,
    baseDelayMs = 20,
    maxWait = 5_000,
    timeout = 10_000,
    sleep = wait,
    random = Math.random,
  } = options;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: 'ReadCommitted',
        maxWait,
        timeout,
      });
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableTransactionError(error)) {
        throw error;
      }

      const jitter = Math.floor(random() * baseDelayMs);
      await sleep(baseDelayMs * 2 ** attempt + jitter);
    }
  }
}

async function lockIds(transaction, table, ids) {
  const normalizedIds = normalizeIds(ids);

  if (normalizedIds.length === 0) {
    return;
  }

  const queryByTable = {
    tasks: Prisma.sql`SELECT id FROM tasks WHERE id IN (${Prisma.join(normalizedIds)}) ORDER BY id FOR UPDATE`,
    task_cycles: Prisma.sql`SELECT id FROM task_cycles WHERE id IN (${Prisma.join(normalizedIds)}) ORDER BY id FOR UPDATE`,
    task_assignments: Prisma.sql`SELECT id FROM task_assignments WHERE id IN (${Prisma.join(normalizedIds)}) ORDER BY id FOR UPDATE`,
    task_requests: Prisma.sql`SELECT id FROM task_requests WHERE id IN (${Prisma.join(normalizedIds)}) ORDER BY id FOR UPDATE`,
  };

  await transaction.$queryRaw(queryByTable[table]);
}

export async function lockTaskAggregate(transaction, aggregate) {
  const {
    rootTaskId,
    subtaskIds = [],
    cycleIds = [],
    assignmentIds = [],
    requestIds = [],
  } = aggregate;

  await lockIds(transaction, 'tasks', rootTaskId ? [rootTaskId] : []);
  await lockIds(transaction, 'tasks', subtaskIds);
  await lockIds(transaction, 'task_cycles', cycleIds);
  await lockIds(transaction, 'task_assignments', assignmentIds);
  await lockIds(transaction, 'task_requests', requestIds);
}

export const LOCK_ORDER = Object.freeze([
  'root-task',
  'subtasks-by-id',
  'cycles-by-id',
  'assignments-by-id',
  'requests-by-id',
]);

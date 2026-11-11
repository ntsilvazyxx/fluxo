import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readProjectFile = (relativePath) =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

describe('artefatos de migração', () => {
  it('contém as entidades mínimas previstas no SDD 03', async () => {
    const schema = await readProjectFile('prisma/schema.prisma');
    const requiredModels = [
      'Role',
      'User',
      'Team',
      'TeamMember',
      'TeamManager',
      'Task',
      'TaskCycle',
      'TaskAssignment',
      'TaskRequest',
      'TaskPauseInterval',
      'DeadlineChange',
      'TaskImage',
      'WorkCalendar',
      'CalendarVersion',
      'WorkSchedule',
      'CalendarException',
      'AuditEvent',
      'Notification',
      'OutboxEvent',
      'EmailDelivery',
      'IdempotencyKey',
      'UserSession',
    ];

    for (const model of requiredModels) {
      assert.match(schema, new RegExp(`model ${model} \\{`));
    }
  });

  it('versiona as unicidades ativas e FKs compostas no SQL MariaDB', async () => {
    const migration = await readProjectFile(
      'prisma/migrations/20261111171000_add_integrity_constraints/migration.sql',
    );

    for (const token of [
      'activeTaskKey',
      'activeCycleKey',
      'activeAssignmentKey',
      'pendingRequestKey',
      'tasks_current_cycle_same_task_fkey',
      'task_requests_assignment_cycle_fkey',
      'trg_tasks_no_nested_subtask_insert',
      'trg_audit_events_append_only_update',
    ]) {
      assert.match(migration, new RegExp(token));
    }

    assert.doesNotMatch(migration, /DROP\s+(DATABASE|SCHEMA)/i);
  });
});

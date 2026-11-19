import { z } from 'zod';

const uuid = z.string().uuid();
const version = z.number().int().nonnegative();
const reason = z.string().trim().min(5).max(2000);
const priorities = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const statuses = z.enum(['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
const empty = z.object({});

export const sigadocNumberSchema = z
  .string()
  .trim()
  .min(1, 'Informe o número do processo SIGADOC.')
  .max(128, 'O número do processo SIGADOC deve ter até 128 caracteres.');

export const sigadocLinkSchema = z
  .string()
  .trim()
  .max(2048, 'O link do processo SIGADOC deve ter até 2048 caracteres.')
  .refine((val) => {
    try {
      const parsed = new URL(val);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'O link do processo SIGADOC deve ser uma URL válida com protocolo HTTP ou HTTPS.');

export const listTasksSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(255).optional(),
    teamId: uuid.optional(),
    responsibleId: uuid.optional(),
    priority: priorities.optional(),
    status: statuses.optional(),
    overdue: z.enum(['true', 'false']).optional(),
    deadlineFrom: z.coerce.date().optional(),
    deadlineTo: z.coerce.date().optional(),
  }),
});

export const taskCalendarSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Mês deve estar no formato AAAA-MM').optional(),
    start: z.coerce.date().optional(),
    end: z.coerce.date().optional(),
    teamId: uuid.optional(),
    responsibleId: uuid.optional(),
  }),
});

export const taskIdSchema = z.object({
  body: empty,
  params: z.object({ id: uuid }),
  query: empty,
});

const acceptanceMinutes = z.union([
  z.literal(60),
  z.literal(120),
  z.literal(240),
  z.literal(480),
  z.literal(720),
  z.literal(1440),
]);

const executionMinutes = z.union([
  z.literal(720),
  z.literal(1440),
  z.literal(2880),
  z.literal(4320),
  z.literal(7200),
]);

export const createTaskSchema = z.object({
  body: z
    .object({
      teamId: uuid,
      userId: uuid,
      title: z.string().trim().min(3).max(255),
      description: z.string().trim().min(3).max(10000),
      priority: priorities.default('NORMAL'),
      acceptanceDurationMinutes: z.coerce.number().pipe(acceptanceMinutes),
      executionDurationMinutes: z.coerce.number().pipe(executionMinutes),
      initialAttachmentIds: z.array(uuid).max(1000).default([]),
      reason: reason.optional(),
      sigadocProcessNumber: sigadocNumberSchema.optional().nullable(),
      sigadocProcessLink: sigadocLinkSchema.optional().nullable(),
    })
    .refine(
      (data) => {
        const hasNum = Boolean(data.sigadocProcessNumber && data.sigadocProcessNumber.trim());
        const hasLink = Boolean(data.sigadocProcessLink && data.sigadocProcessLink.trim());
        return (hasNum && hasLink) || (!hasNum && !hasLink);
      },
      {
        message: 'Para vincular um processo SIGADOC, informe tanto o número quanto o link.',
        path: ['sigadocProcessLink'],
      },
    ),
  params: empty,
  query: empty,
});

export const updateTaskSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(3).max(255).optional(),
      description: z.string().trim().min(3).max(10000).optional(),
      priority: priorities.optional(),
      sigadocProcessNumber: sigadocNumberSchema.nullable().optional(),
      sigadocProcessLink: sigadocLinkSchema.nullable().optional(),
      expectedVersion: version,
      reason,
    })
    .refine(
      (v) =>
        v.title !== undefined ||
        v.description !== undefined ||
        v.priority !== undefined ||
        v.sigadocProcessNumber !== undefined ||
        v.sigadocProcessLink !== undefined,
      'Informe uma alteração.',
    )
    .refine(
      (v) => {
        const numDefined = v.sigadocProcessNumber !== undefined;
        const linkDefined = v.sigadocProcessLink !== undefined;
        if (!numDefined && !linkDefined) return true;
        if (numDefined && !linkDefined) return false;
        if (!numDefined && linkDefined) return false;
        // Both are defined. Check whether both are null (removal) or both non-null (update)
        const numNull = v.sigadocProcessNumber === null;
        const linkNull = v.sigadocProcessLink === null;
        return (numNull && linkNull) || (!numNull && !linkNull);
      },
      {
        message: 'Para alterar ou remover o processo SIGADOC, informe ambos os campos ou passe null em ambos.',
        path: ['sigadocProcessLink'],
      },
    ),
  params: z.object({ id: uuid }),
  query: empty,
});

export const assignTaskSchema = z.object({
  body: z.object({
    userId: uuid,
    acceptanceDurationMinutes: z.coerce.number().pipe(acceptanceMinutes),
    executionDurationMinutes: z.coerce.number().pipe(executionMinutes),
    expectedVersion: version,
    reason: reason.optional(),
  }),
  params: z.object({ id: uuid }),
  query: empty,
});

export const assignmentActionSchema = z.object({
  body: z.object({ expectedVersion: version }),
  params: z.object({ id: uuid }),
  query: empty,
});

export const rejectAssignmentSchema = z.object({
  body: z.object({ expectedVersion: version, reason }),
  params: z.object({ id: uuid }),
  query: empty,
});

export const completeTaskSchema = z.object({
  body: z.object({
    expectedVersion: version,
    completionText: z.string().trim().min(10).max(10000),
  }),
  params: z.object({ id: uuid }),
  query: empty,
});

export const cancelTaskSchema = z.object({
  body: z.object({ expectedVersion: version, reason }),
  params: z.object({ id: uuid }),
  query: empty,
});

export const restartTaskSchema = z.object({
  body: z.object({ expectedVersion: version, reason }),
  params: z.object({ id: uuid }),
  query: empty,
});

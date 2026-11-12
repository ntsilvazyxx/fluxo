import { z } from 'zod';

const uuid = z.string().uuid();
const date = z.coerce.date();
const baseFilters = z.object({
  periodStart: date.optional(),
  periodEnd: date.optional(),
  teamId: uuid.optional(),
  responsibleId: uuid.optional(),
  status: z.enum(['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  deadlineSituation: z.enum(['OVERDUE', 'DUE_SOON', 'ON_TIME', 'NO_DEADLINE']).optional(),
}).superRefine((value, context) => {
  if (value.periodStart && value.periodEnd && value.periodStart > value.periodEnd) {
    context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'O fim do per\u00edodo deve ser posterior ao in\u00edcio.' });
  }
});

export const dashboardSchema = z.object({ body: z.object({}), params: z.object({}), query: baseFilters });

export const reportSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: baseFilters.extend({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(255).optional(),
    sortBy: z.enum(['openedAt', 'closedAt', 'deadlineAt', 'priority', 'status', 'publicNumber']).default('openedAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  }),
});

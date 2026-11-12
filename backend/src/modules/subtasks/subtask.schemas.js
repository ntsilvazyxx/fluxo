import { z } from 'zod';

const uuid = z.string().uuid();
const reason = z.string().trim().min(5).max(2000);
const priority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const listSubtasksSchema = z.object({
  body: z.object({}),
  params: z.object({ id: uuid }),
  query: z.object({}),
});

export const createSubtaskSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3).max(255),
    description: z.string().trim().min(3).max(10000),
    priority: priority.default('NORMAL'),
    userId: uuid,
    deadlineAt: z.coerce.date(),
    expectedVersion: z.number().int().nonnegative(),
    reason: reason.optional(),
  }),
  params: z.object({ id: uuid }),
  query: z.object({}),
});

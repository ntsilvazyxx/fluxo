import { z } from 'zod';

const uuid = z.string().uuid();

export const listNotificationsSchema = z.object({
  params: z.object({}),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    unread: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  }),
  body: z.object({}).passthrough(),
});

export const markReadSchema = z.object({
  params: z.object({ id: uuid }),
  query: z.object({}),
  body: z.object({}).passthrough(),
});

export const markReadAllSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z.object({}).passthrough(),
});

import { z } from 'zod';

const uuid = z.string().uuid();
const expectedVersion = z.coerce.number().int().nonnegative();

export const taskImagesSchema = z.object({
  params: z.object({ id: uuid }),
  query: z.object({}),
  body: z.object({}).passthrough(),
});

export const uploadImageSchema = z.object({
  params: z.object({ id: uuid }),
  query: z.object({}),
  body: z.object({ expectedVersion }),
});

export const imageIdSchema = z.object({
  params: z.object({ id: uuid }),
  query: z.object({}),
  body: z.object({}).passthrough(),
});

export const deleteImageSchema = z.object({
  params: z.object({ id: uuid }),
  query: z.object({}),
  body: z.object({
    expectedVersion,
    reason: z.string().trim().min(5).max(2_000),
  }),
});

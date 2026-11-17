import { z } from 'zod';

export const ALLOWED_CARD_COLORS = [
  'blue',
  'emerald',
  'amber',
  'rose',
  'purple',
  'orange',
];

export const listKanbanColorsSchema = z.object({
  params: z.object({}),
  query: z.object({
    taskIds: z.string().optional(),
  }),
  body: z.object({}).passthrough(),
});

export const updateKanbanColorSchema = z.object({
  params: z.object({
    taskId: z.string().trim().min(1).max(36),
  }),
  query: z.object({}),
  body: z.object({
    color: z.enum([...ALLOWED_CARD_COLORS, 'default']).nullable(),
  }),
});

export const deleteKanbanColorSchema = z.object({
  params: z.object({
    taskId: z.string().trim().min(1).max(36),
  }),
  query: z.object({}),
  body: z.object({}).passthrough(),
});

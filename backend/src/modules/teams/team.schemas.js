import { z } from 'zod';
const uuid = z.string().uuid();
const empty = { body: z.object({}), query: z.object({}) };
export const teamIdSchema = z.object({ ...empty, params: z.object({ id: uuid }) });
export const createTeamSchema = z.object({ body: z.object({ name: z.string().trim().min(3).max(160) }), params: z.object({}), query: z.object({}) });
export const updateTeamSchema = z.object({ body: z.object({ name: z.string().trim().min(3).max(160) }), params: z.object({ id: uuid }), query: z.object({}) });
export const teamUserSchema = z.object({ ...empty, params: z.object({ id: uuid, userId: uuid }) });

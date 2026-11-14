import { z } from 'zod';
import { userPasswordSchema } from '../auth/auth.schemas.js';

const roles = z.enum(['ADMIN_MASTER', 'SECRETARY', 'MANAGER', 'TECHNICIAN']);
const uuid = z.string().uuid();

export const listUsersSchema = z.object({ body: z.object({}), params: z.object({}), query: z.object({ q: z.string().max(160).optional() }) });
export const userIdSchema = z.object({ body: z.object({}), params: z.object({ id: uuid }), query: z.object({}) });
export const createUserSchema = z.object({
  body: z.object({ name: z.string().trim().min(3).max(160), email: z.string().email().max(254), password: userPasswordSchema, roleCode: roles }),
  params: z.object({}), query: z.object({}),
});
export const updateUserSchema = z.object({
  body: z.object({ name: z.string().trim().min(3).max(160).optional(), roleCode: roles.optional(), isActive: z.boolean().optional(), reason: z.string().trim().min(5).max(1000) }).refine((value) => value.name !== undefined || value.roleCode !== undefined || value.isActive !== undefined, 'Informe uma alteração.'),
  params: z.object({ id: uuid }), query: z.object({}),
});
export const adminPasswordResetSchema = z.object({
  body: z.object({ password: userPasswordSchema, reason: z.string().trim().min(5).max(1000) }),
  params: z.object({ id: uuid }), query: z.object({}),
});

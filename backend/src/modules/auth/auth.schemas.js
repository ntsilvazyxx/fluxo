import { z } from 'zod';

const password = z
  .string()
  .min(12, 'A senha deve ter pelo menos 12 caracteres.')
  .max(128, 'A senha deve ter no máximo 128 caracteres.')
  .regex(/[a-z]/, 'A senha deve conter letra minúscula.')
  .regex(/[A-Z]/, 'A senha deve conter letra maiúscula.')
  .regex(/[0-9]/, 'A senha deve conter número.');

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(128),
  }),
  params: z.object({}),
  query: z.object({}),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email: z.string().email().max(254) }),
  params: z.object({}),
  query: z.object({}),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(32).max(200),
    password,
  }),
  params: z.object({}),
  query: z.object({}),
});

export const userPasswordSchema = password;

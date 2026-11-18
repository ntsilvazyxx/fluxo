import { z } from 'zod';

const uuid = z.string().uuid('ID inválido.');
const empty = z.object({});

export const listCommentsSchema = z.object({
  params: z.object({
    id: uuid,
  }),
  query: empty,
  body: empty,
});

export const createCommentSchema = z.object({
  params: z.object({
    id: uuid,
  }),
  query: empty,
  body: z.object({
    content: z
      .string({ required_error: 'O comentário é obrigatório.' })
      .trim()
      .min(1, 'O comentário não pode ser vazio.')
      .max(2000, 'O comentário deve ter no máximo 2000 caracteres.'),
    clientMessageId: z
      .string()
      .trim()
      .max(64, 'Identificador de mensagem do cliente muito longo.')
      .optional(),
  }),
});



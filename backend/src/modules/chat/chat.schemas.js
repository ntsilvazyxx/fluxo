import { z } from 'zod';

export const uuidSchema = z.string().uuid({ message: 'Identificador deve ser um UUID válido.' });

export const sequenceSchema = z.union([
  z.number().int().nonnegative({ message: 'Sequência deve ser não-negativa.' }),
  z.string().regex(/^\d+$/, { message: 'Sequência deve conter apenas dígitos não-negativos.' }),
]);

// Param Schemas
export const taskIdParamSchema = z.object({
  taskId: uuidSchema,
}).strict();

export const conversationParamSchema = z.object({
  taskId: uuidSchema,
}).strict();

export const messageIdParamSchema = z.object({
  taskId: uuidSchema,
  messageId: uuidSchema,
}).strict();

export const attachmentParamSchema = z.object({
  taskId: uuidSchema,
  messageId: uuidSchema,
  attachmentId: uuidSchema,
}).strict();

export const participantParamSchema = z.object({
  taskId: uuidSchema,
  participantId: uuidSchema,
}).strict();

// Query Schemas
export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  beforeSequence: sequenceSchema.optional(),
  afterSequence: sequenceSchema.optional(),
  q: z.string().trim().min(1).max(255).optional(),
  status: z.enum(['PENDING', 'PUBLISHED', 'FAILED']).default('PUBLISHED'),
}).strict();

export const listParticipantsQuerySchema = z.object({
  activeOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
}).strict();

export const listLockEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

// Body Schemas
export const sendMessageSchema = z.object({
  clientMessageId: uuidSchema,
  content: z.string().trim().max(10000, { message: 'Mensagem excede o limite de 10.000 caracteres.' }).nullable().optional(),
  stagedAttachmentIds: z.array(uuidSchema)
    .max(5, { message: 'Máximo de 5 anexos por mensagem.' })
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Não são permitidos identificadores de anexo repetidos no mesmo envio.',
    })
    .default([]),
}).strict().refine(
  (data) => (Boolean(data.content && data.content.trim().length > 0) || (Array.isArray(data.stagedAttachmentIds) && data.stagedAttachmentIds.length > 0)),
  { message: 'A mensagem deve conter texto ou pelo menos um anexo.', path: ['content'] }
);

export const addParticipantSchema = z.object({
  userId: uuidSchema,
}).strict();

export const removeParticipantSchema = z.object({
  endReason: z.enum([
    'REASSIGNED',
    'REMOVED_BY_MANAGER',
    'ACCOUNT_DEACTIVATED',
    'ASSIGNMENT_REJECTED',
    'CYCLE_ENDED',
  ], { message: 'Motivo de encerramento inválido.' }).default('REMOVED_BY_MANAGER'),
}).strict().default({});

export const advanceReadCursorSchema = z.object({
  lastReadMessageId: uuidSchema.nullable().optional(),
  lastReadSequence: sequenceSchema,
}).strict();

export const initLegacyChatSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
}).strict().default({});

export const adminLockSchema = z.object({
  isLocked: z.boolean(),
  reason: z.enum(['REQUEST_PENDING', 'CYCLE_CLOSED', 'ADMIN_MAINTENANCE']).default('ADMIN_MAINTENANCE'),
  justification: z.string().trim().min(5, { message: 'Justificativa obrigatória (mínimo de 5 caracteres).' }).max(1000),
}).strict();

// Wrapped Route Schemas (para o middleware de validação Express)
const emptySchema = z.object({}).strict();

export const getConversationRouteSchema = z.object({
  params: taskIdParamSchema,
  query: emptySchema,
  body: emptySchema,
});

export const initLegacyChatRouteSchema = z.object({
  params: taskIdParamSchema,
  query: emptySchema,
  body: initLegacyChatSchema,
});

export const listParticipantsRouteSchema = z.object({
  params: taskIdParamSchema,
  query: listParticipantsQuerySchema,
  body: emptySchema,
});

export const addParticipantRouteSchema = z.object({
  params: taskIdParamSchema,
  query: emptySchema,
  body: addParticipantSchema,
});

export const removeParticipantRouteSchema = z.object({
  params: participantParamSchema,
  query: emptySchema,
  body: removeParticipantSchema,
});

export const listMessagesRouteSchema = z.object({
  params: taskIdParamSchema,
  query: listMessagesQuerySchema,
  body: emptySchema,
});

export const sendMessageRouteSchema = z.object({
  params: taskIdParamSchema,
  query: emptySchema,
  body: sendMessageSchema,
});

export const advanceReadCursorRouteSchema = z.object({
  params: taskIdParamSchema,
  query: emptySchema,
  body: advanceReadCursorSchema,
});

export const adminLockRouteSchema = z.object({
  params: taskIdParamSchema,
  query: emptySchema,
  body: adminLockSchema,
});

export const listLockEventsRouteSchema = z.object({
  params: taskIdParamSchema,
  query: listLockEventsQuerySchema,
  body: emptySchema,
});

export const uploadIdParamSchema = z.object({
  taskId: uuidSchema,
  uploadId: uuidSchema,
}).strict();

export const stageAttachmentSchema = z.object({
  clientUploadId: z.string().trim().min(1, 'clientUploadId é obrigatório.').max(128),
}).passthrough();

export const stageAttachmentRouteSchema = z.object({
  params: taskIdParamSchema,
  query: emptySchema,
  body: stageAttachmentSchema,
});

export const getStagedAttachmentRouteSchema = z.object({
  params: uploadIdParamSchema,
  query: emptySchema,
  body: emptySchema,
});

export const cancelStagedAttachmentRouteSchema = z.object({
  params: uploadIdParamSchema,
  query: emptySchema,
  body: emptySchema,
});

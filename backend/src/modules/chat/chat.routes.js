import { Router } from 'express';
import multer from 'multer';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createChatService } from './chat.service.js';
import { createChatParticipantService } from './chat-participant.service.js';
import { createChatMessageService } from './chat-message.service.js';
import { createChatLockService } from './chat-lock.service.js';
import { createChatController } from './chat.controller.js';
import { createLocalChatAttachmentStorage } from './chat-attachment.local-storage.js';
import { createClamAvChatAttachmentScanner } from './chat-attachment-scanner.js';
import { createChatAttachmentService } from './chat-attachment.service.js';
import {
  getConversationRouteSchema,
  initLegacyChatRouteSchema,
  listParticipantsRouteSchema,
  addParticipantRouteSchema,
  removeParticipantRouteSchema,
  listMessagesRouteSchema,
  sendMessageRouteSchema,
  advanceReadCursorRouteSchema,
  adminLockRouteSchema,
  stageAttachmentRouteSchema,
  getStagedAttachmentRouteSchema,
  cancelStagedAttachmentRouteSchema,
} from './chat.schemas.js';

const uploadTmpRoot = path.join(tmpdir(), 'seaf-chat-staged');

const receiveChatAttachment = (maxBytes) => {
  const upload = multer({
    storage: multer.diskStorage({
      destination: async (_req, _file, done) => {
        try {
          done(null, await mkdtemp(`${uploadTmpRoot}-`));
        } catch (err) {
          done(err);
        }
      },
      filename: (_req, _file, done) => done(null, randomUUID()),
    }),
    limits: { files: 1, fields: 5, fileSize: maxBytes },
  }).fields([
    { name: 'attachment', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        const isTooLarge = err.code === 'LIMIT_FILE_SIZE';
        return next(new AppError(
          isTooLarge ? 413 : 400,
          isTooLarge ? 'CHAT_ATTACHMENT_TOO_LARGE' : 'INVALID_ATTACHMENT_UPLOAD',
          isTooLarge ? 'O arquivo excede o limite máximo permitido.' : 'Upload de anexo inválido.',
        ));
      }
      next();
    });
  };
};

export const createTaskChatAttachmentRouter = ({
  prisma,
  config,
  storage,
  scanner,
  attachmentService,
}) => {
  const router = Router({ mergeParams: true });

  const defaultStoragePath = config?.chatAttachmentStoragePath
    ?? path.join(tmpdir(), 'seaf-chat-attachments');

  const effectiveStorage = storage ?? createLocalChatAttachmentStorage({
    rootPath: defaultStoragePath,
    timeoutMs: config?.chatAttachmentStorageTimeoutMs,
    maxConcurrentWrites: config?.chatAttachmentStorageMaxConcurrentWrites,
  });

  const effectiveScanner = scanner ?? createClamAvChatAttachmentScanner();

  const userQuotaBytes = Number(config?.chatAttachmentUserQuotaBytes) || 100 * 1024 * 1024;
  const conversationQuotaBytes = Number(config?.chatAttachmentConversationQuotaBytes) || 250 * 1024 * 1024;

  const effectiveAttachmentService = attachmentService ?? createChatAttachmentService({
    prisma,
    storage: effectiveStorage,
    scanner: effectiveScanner,
    enabled: config?.chatAttachmentStorageEnabled ?? false,
    ttlMinutes: config?.chatAttachmentStagingTtlMinutes ?? 1440,
    maxBytes: config?.chatAttachmentStorageMaxBytes ?? 20 * 1024 * 1024,
    userQuotaBytes,
    conversationQuotaBytes,
  });

  const controller = createChatController({
    attachmentService: effectiveAttachmentService,
  });

  router.post(
    '/staged',
    receiveChatAttachment(config?.chatAttachmentStorageMaxBytes ?? 20 * 1024 * 1024),
    validate(stageAttachmentRouteSchema),
    asyncHandler(controller.stageAttachment),
  );

  router.get(
    '/staged/:uploadId',
    validate(getStagedAttachmentRouteSchema),
    asyncHandler(controller.getStagedAttachment),
  );

  router.delete(
    '/staged/:uploadId',
    validate(cancelStagedAttachmentRouteSchema),
    asyncHandler(controller.cancelStagedAttachment),
  );

  return router;
};

export const createTaskChatRouter = ({
  prisma,
  config,
  storage,
  scanner,
  attachmentService,
}) => {
  const router = Router();
  const defaultStoragePath = config?.chatAttachmentStoragePath
    ?? path.join(tmpdir(), 'seaf-chat-attachments');

  const effectiveStorage = storage ?? createLocalChatAttachmentStorage({
    rootPath: defaultStoragePath,
    timeoutMs: config?.chatAttachmentStorageTimeoutMs,
    maxConcurrentWrites: config?.chatAttachmentStorageMaxConcurrentWrites,
  });

  const participantService = createChatParticipantService({ prisma });
  const chatService = createChatService({ prisma, participantService });
  const messageService = createChatMessageService({
    prisma,
    storage: effectiveStorage,
    config,
  });
  const lockService = createChatLockService({ prisma });

  const controller = createChatController({
    chatService,
    participantService,
    messageService,
    lockService,
  });

  router.use(authenticate({ prisma, config }));

  router.get(
    '/:taskId/chat',
    validate(getConversationRouteSchema),
    asyncHandler(controller.getConversation),
  );

  router.post(
    '/:taskId/chat/init',
    validate(initLegacyChatRouteSchema),
    asyncHandler(controller.initLegacyChat),
  );

  router.get(
    '/:taskId/chat/participants',
    validate(listParticipantsRouteSchema),
    asyncHandler(controller.listParticipants),
  );

  router.post(
    '/:taskId/chat/participants',
    validate(addParticipantRouteSchema),
    asyncHandler(controller.addParticipant),
  );

  router.delete(
    '/:taskId/chat/participants/:participantId',
    validate(removeParticipantRouteSchema),
    asyncHandler(controller.removeParticipant),
  );

  router.get(
    '/:taskId/chat/messages',
    validate(listMessagesRouteSchema),
    asyncHandler(controller.listMessages),
  );

  router.post(
    '/:taskId/chat/messages',
    validate(sendMessageRouteSchema),
    asyncHandler(controller.sendMessage),
  );

  router.post(
    '/:taskId/chat/read',
    validate(advanceReadCursorRouteSchema),
    asyncHandler(controller.advanceReadCursor),
  );

  router.post(
    '/:taskId/chat/lock',
    validate(adminLockRouteSchema),
    asyncHandler(controller.adminLock),
  );

  router.use(
    '/:taskId/chat/attachments',
    createTaskChatAttachmentRouter({
      prisma,
      config,
      storage,
      scanner,
      attachmentService,
    }),
  );

  return router;
};

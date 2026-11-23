import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createChatService } from './chat.service.js';
import { createChatParticipantService } from './chat-participant.service.js';
import { createChatMessageService } from './chat-message.service.js';
import { createChatLockService } from './chat-lock.service.js';
import { createChatController } from './chat.controller.js';
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
} from './chat.schemas.js';

export const createTaskChatRouter = ({ prisma, config }) => {
  const router = Router();
  const participantService = createChatParticipantService({ prisma });
  const chatService = createChatService({ prisma, participantService });
  const messageService = createChatMessageService({ prisma });
  const lockService = createChatLockService({ prisma });
  const controller = createChatController({ chatService, participantService, messageService, lockService });

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

  return router;
};

import { rm } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/errors/app-error.js';

const cleanupUploadedTempFile = (file) => {
  if (!file?.path) return;
  rm(file.path, { force: true })
    .then(() => {
      const parent = path.dirname(file.path);
      if (parent && path.basename(parent).startsWith('seaf-chat-staged-')) {
        return rm(parent, { recursive: true, force: true });
      }
    })
    .catch(() => undefined);
};

export const createChatController = ({
  chatService,
  participantService,
  messageService,
  lockService,
  attachmentService,
}) => ({
  async getConversation(req, res) {
    const data = await chatService.getConversation(
      req.auth,
      req.validated.params.taskId,
    );
    res.status(200).json({ data });
  },

  async initLegacyChat(req, res) {
    const data = await chatService.initLegacyConversation(
      req.auth,
      req.validated.params.taskId,
      req.validated.body?.reason,
    );
    res.status(201).json({ data });
  },

  async listParticipants(req, res) {
    const data = await participantService.listParticipants(
      req.auth,
      req.validated.params.taskId,
      req.validated.query,
    );
    res.status(200).json({ data });
  },

  async addParticipant(req, res) {
    const data = await participantService.addParticipant(
      req.auth,
      req.validated.params.taskId,
      req.validated.body.userId,
    );
    res.status(201).json({ data });
  },

  async removeParticipant(req, res) {
    const data = await participantService.removeParticipant(
      req.auth,
      req.validated.params.taskId,
      req.validated.params.participantId,
      req.validated.body?.endReason,
    );
    res.status(200).json({ data });
  },

  async sendMessage(req, res) {
    const data = await messageService.sendMessage(
      req.auth,
      req.validated.params.taskId,
      req.validated.body,
    );
    const status = data?.status === 'PENDING' ? 202 : 201;
    res.status(status).json({ data });
  },

  async listMessages(req, res) {
    const data = await messageService.listMessages(
      req.auth,
      req.validated.params.taskId,
      req.validated.query,
    );
    res.status(200).json({ data });
  },

  async advanceReadCursor(req, res) {
    const data = await messageService.advanceReadCursor(
      req.auth,
      req.validated.params.taskId,
      req.validated.body,
    );
    res.status(200).json({ data });
  },

  async adminLock(req, res) {
    const taskId = req.validated?.params?.taskId ?? req.params?.taskId;
    const body = req.validated?.body ?? req.body;
    const data = await lockService.adminLock(
      req.auth,
      taskId,
      body,
    );
    res.status(200).json({ data });
  },

  async stageAttachment(req, res) {
    const file = req.file ?? req.files?.attachment?.[0] ?? req.files?.file?.[0];
    try {
      const clientUploadId = req.validated?.body?.clientUploadId
        ?? req.body?.clientUploadId
        ?? req.headers['x-client-upload-id']
        ?? req.headers['idempotency-key'];

      if (!file) {
        throw new AppError(400, 'CHAT_ATTACHMENT_REQUIRED', 'Arquivo obrigatório.');
      }
      if (!clientUploadId) {
        throw new AppError(400, 'CLIENT_UPLOAD_ID_REQUIRED', 'Identificador clientUploadId é obrigatório.');
      }

      const data = await attachmentService.stage(
        req.auth,
        req.validated?.params?.taskId ?? req.params.taskId,
        clientUploadId,
        file,
        req.correlationId,
      );
      res.status(201).json({ data });
    } finally {
      cleanupUploadedTempFile(file);
    }
  },

  async getStagedAttachment(req, res) {
    const taskId = req.validated?.params?.taskId ?? req.params.taskId;
    const uploadId = req.validated?.params?.uploadId ?? req.params.uploadId;
    const data = await attachmentService.get(req.auth, taskId, uploadId);
    res.status(200).json({ data });
  },

  async cancelStagedAttachment(req, res) {
    const taskId = req.validated?.params?.taskId ?? req.params.taskId;
    const uploadId = req.validated?.params?.uploadId ?? req.params.uploadId;
    const data = await attachmentService.cancel(req.auth, taskId, uploadId, req.correlationId);
    res.status(200).json({ data });
  },

  async downloadAttachment(req, res, next) {
    const taskId = req.validated?.params?.taskId ?? req.params.taskId;
    const messageId = req.validated?.params?.messageId ?? req.params.messageId;
    const attachmentId = req.validated?.params?.attachmentId ?? req.params.attachmentId;
    const correlationId = req.correlationId;

    const downloadInfo = await messageService.getAttachmentForDownload(
      req.auth,
      taskId,
      messageId,
      attachmentId,
      correlationId,
    );

    const cleanName = (downloadInfo.originalName || 'attachment')
      .replace(/[\r\n\0\t]/g, '')
      .replace(/[/\\]/g, '_')
      .replace(/["']/g, '')
      .trim() || 'attachment';

    const safeAscii = cleanName
      .replace(/[^\x20-\x7E]/g, '_')
      .trim() || 'attachment';

    const encodedUtf8 = encodeURIComponent(cleanName)
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A');

    res.setHeader('Content-Type', downloadInfo.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedUtf8}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (downloadInfo.sizeBytes) {
      res.setHeader('Content-Length', downloadInfo.sizeBytes.toString());
    }

    let finished = false;
    const stream = downloadInfo.stream;

    req.on('close', () => {
      if (!finished) {
        finished = true;
        stream?.destroy();
      }
    });

    stream.on('error', async (err) => {
      finished = true;
      if (typeof messageService.recordDownloadStreamFailure === 'function') {
        await messageService.recordDownloadStreamFailure(req.auth, downloadInfo, correlationId).catch(() => undefined);
      }
      if (!res.headersSent) {
        next(err);
      } else {
        res.destroy(err);
      }
    });

    res.on('finish', () => {
      finished = true;
    });

    stream.pipe(res);
  },
});

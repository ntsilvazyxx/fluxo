export const createChatController = ({ chatService, participantService, messageService, lockService }) => ({
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
    res.status(201).json({ data });
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
});

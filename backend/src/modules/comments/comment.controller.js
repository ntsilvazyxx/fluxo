export const createCommentController = ({ service }) => ({
  async list(req, res) {
    const comments = await service.list(req.auth, req.validated.params.id);
    res.status(200).json({ data: { comments } });
  },

  async create(req, res) {
    const comment = await service.create(
      req,
      req.validated.params.id,
      req.validated.body,
    );
    res.status(201).json({ data: { comment } });
  },
});


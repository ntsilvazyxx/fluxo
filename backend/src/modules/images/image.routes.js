import { Router } from 'express';
import multer from 'multer';

import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../shared/errors/app-error.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createImageController } from './image.controller.js';
import { taskImagesSchema, uploadImageSchema, imageIdSchema, deleteImageSchema } from './image.schemas.js';
import { createImageService } from './image.service.js';
import { createFileImageStorage } from './image.storage.js';
import { MAX_IMAGE_BYTES } from './image.validation.js';

const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2 },
});

const receiveImage = (request, response, next) => {
  multipart.single('image')(request, response, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'IMAGE_TOO_LARGE', 'A imagem deve ter no mÃ¡ximo 10 MB.'));
    }
    return next(new AppError(400, 'INVALID_IMAGE_UPLOAD', 'O upload da imagem Ã© invÃ¡lido.'));
  });
};

const build = ({ prisma, config, imageStorage }) => {
  const storage = imageStorage ?? createFileImageStorage(config.imageStoragePath);
  return createImageController({ service: createImageService({ prisma, storage }) });
};

export const createTaskImageRouter = (dependencies) => {
  const router = Router();
  const controller = build(dependencies);
  router.use(authenticate(dependencies));
  router.get('/:id/images', validate(taskImagesSchema), asyncHandler(controller.list));
  router.post(
    '/:id/images',
    receiveImage,
    validate(uploadImageSchema),
    asyncHandler(controller.upload),
  );
  return router;
};

export const createImageRouter = (dependencies) => {
  const router = Router();
  const controller = build(dependencies);
  router.use(authenticate(dependencies));
  router.get('/:id/content', validate(imageIdSchema), asyncHandler(controller.content));
  router.delete('/:id', validate(deleteImageSchema), asyncHandler(controller.remove));
  return router;
};

import { AppError } from '../shared/errors/app-error.js';

export const validate = (schema) => (request, _response, next) => {
  const result = schema.safeParse({
    body: request.body ?? {},
    params: request.params,
    query: request.query,
  });

  if (!result.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Dados inválidos.',
        result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message }))),
    );
    return;
  }

  request.validated = result.data;
  next();
};

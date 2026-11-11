import { AppError } from '../shared/errors/app-error.js';

export const requireRoles = (...allowedRoles) => (request, _response, next) => {
  if (!request.auth || !allowedRoles.includes(request.auth.roleCode)) {
    next(new AppError(403, 'FORBIDDEN', 'Você não tem permissão para esta operação.'));
    return;
  }

  next();
};

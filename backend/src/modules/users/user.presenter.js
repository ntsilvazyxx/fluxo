export const presentUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.emailNormalized,
  role: {
    id: user.role.id,
    code: user.role.code,
    label: user.role.label,
  },
  isActive: user.isActive,
  version: user.version,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

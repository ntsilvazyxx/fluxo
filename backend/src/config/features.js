const isNonProduction = (config) => (config?.nodeEnv ?? 'production') !== 'production';

// The ADMIN MASTER remains a technical administration profile. Task creation is
// an explicit, non-production-only exception and stays disabled by default.
export const canAdminCreateTask = (config) => config?.adminTaskCreationEnabled === true && isNonProduction(config);

export const featureFlags = (config) => ({ adminTaskCreation: canAdminCreateTask(config) });

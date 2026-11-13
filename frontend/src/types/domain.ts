/** Contratos compartilhados do frontend para respostas já expostas pela API. */
export type RoleCode = 'ADMIN_MASTER' | 'SECRETARY' | 'MANAGER' | 'TECHNICIAN';
export type TaskStatus = 'PENDING' | 'AWAITING_ACCEPTANCE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type ApiError = { error?: { message?: string } };
export type ApiEnvelope<T> = { data: T };
export type UserSummary = { id: string; name: string; isActive?: boolean; role: { code: RoleCode; label?: string } };
export type Pagination = { page: number; totalPages: number; total: number };
export type TaskImage = { id: string; createdAt: string; cycleNumber: number; isCurrentCycle: boolean; canDelete: boolean; uploadedBy: UserSummary; url?: string };

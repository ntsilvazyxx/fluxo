/** Contratos compartilhados do frontend para respostas já expostas pela API. */
export type RoleCode = 'ADMIN_MASTER' | 'SECRETARY' | 'MANAGER' | 'TECHNICIAN';
export type TaskStatus = 'PENDING' | 'AWAITING_ACCEPTANCE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type DeadlinePolicy = 'LEGACY_CALENDAR' | 'RUNNING_CLOCK';

export type ApiError = { error?: { message?: string } };
export type ApiEnvelope<T> = { data: T };
export type UserSummary = { id: string; name: string; isActive?: boolean; role: { code: RoleCode; label?: string } };
export type Pagination = { page: number; totalPages: number; total: number };
export type TaskImage = { id: string; createdAt: string; cycleNumber: number; isCurrentCycle: boolean; canDelete: boolean; uploadedBy: UserSummary; url?: string };
export type TaskAttachment = { id: string; origin: 'INITIAL' | 'EXECUTION'; originalName: string; mimeType: string; sizeBytes: number; checksum: string; uploadedBy: UserSummary; cycleNumber?: number; createdAt?: string };
export type CycleView = { id: string; cycleNumber: number; title: string; description: string; priority: TaskPriority; status: TaskStatus; deadlinePolicy: DeadlinePolicy; deadlineAt: string | null; legacyDeadlineAt: string | null; acceptanceDeadlineAt: string | null; executionDeadlineAt: string | null; acceptanceDurationMinutes: number | null; executionDurationMinutes: number | null; version: number; openedAt: string; closedAt?: string; completionText?: string; overdue: boolean; assignment: { id: string; userId: string; assignedById: string; assignedAt: string; acceptedAt?: string; acceptanceDeadlineAt?: string; endedAt?: string; endReason?: string; user?: { id: string; name: string } } | null; requests: Array<{ id: string; type: string; status: string; reason: string; proposedDeadlineAt?: string; decidedById?: string; decidedAt?: string; decisionReason?: string; createdAt: string }>; deadlineChanges: Array<{ id: string; cycleId: string; oldDeadlineAt?: string; newDeadlineAt?: string; kind: string; reason?: string; changedById: string; createdAt?: string }> };

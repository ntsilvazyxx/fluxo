/**
 * Tipos e Contratos da Interface do Chat de Tarefas.
 * Alinhado estritamente com os contratos homologados do backend e chat.presenter.js.
 */

export type ChatLockReason = 'ADMIN_MAINTENANCE' | 'REQUEST_PENDING' | 'CYCLE_CLOSED';

export interface ChatLockState {
  isLocked: boolean;
  reason: ChatLockReason | null;
  lockedAt: string | null;
  lockedById?: string | null;
  lockedBy?: { id: string; name?: string } | null;
}

export interface ChatParticipantPeriod {
  id: string;
  joinedAt: string;
  endedAt: string | null;
  endReason: string | null;
  isActive: boolean;
}

export interface ChatMyParticipation {
  id: string;
  conversationId: string;
  userId: string;
  isActive: boolean;
  activePeriod?: ChatParticipantPeriod | null;
  periods?: ChatParticipantPeriod[];
}

export interface ChatConversation {
  id: string;
  taskId: string;
  task?: {
    id: string;
    publicNumber: string;
  };
  lockState: ChatLockState;
  myParticipation?: ChatMyParticipation | null;
  unreadCount: number;
  lastMessage?: ChatMessage | null;
  participantsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachmentMeta {
  id: string;
  messageId?: string;
  position?: number | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number | string;
  sha256?: string;
  origin?: string;
  createdAt: string;
  downloadUrl?: string;
}

export interface ChatMessageAuthor {
  id: string;
  name?: string;
  email?: string | null;
  role?: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  cycleId: string;
  authorId: string;
  author?: ChatMessageAuthor | null;
  sequenceNumber: number | string;
  clientMessageId?: string;
  content: string | null;
  status: 'PUBLISHED' | 'PENDING' | 'FAILED';
  createdAt: string;
  updatedAt: string;
  attachments?: ChatAttachmentMeta[];
}

export interface ChatMessagesPagination {
  limit: number;
  cursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

export interface ChatMessagesResponse {
  items: ChatMessage[];
  pagination: ChatMessagesPagination;
}

export interface SendMessagePayload {
  clientMessageId: string;
  content?: string | null;
  stagedAttachmentIds?: string[];
}

export type LocalSendStatus = 'IDLE' | 'SENDING' | 'RETRYABLE_ERROR' | 'REJECTED';

export interface PendingChatMessage extends Omit<ChatMessage, 'id' | 'sequenceNumber' | 'status'> {
  id: string; // Temporário gerado para chave React (ex: `temp-${clientMessageId}`)
  sequenceNumber: string | number; // Sequence provisória ou null
  clientMessageId: string;
  status: 'SENDING' | 'RETRYABLE_ERROR' | 'REJECTED';
  localError?: string | null;
}

export interface ChatCapabilities {
  canSendMessage: boolean;
  reasonBlocked?: string | null;
}


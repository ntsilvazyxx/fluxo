/**
 * Tipagens do módulo de anexos do Chat (Fase 5.1.7.3).
 */

export type LocalAttachmentStatus =
  | 'SELECTED'
  | 'QUEUED'
  | 'UPLOADING'
  | 'AWAITING_SERVER'
  | 'READY'
  | 'RETRYABLE_ERROR'
  | 'REJECTED'
  | 'CANCEL_REQUESTED'
  | 'REMOVING'
  | 'REMOVAL_ERROR'
  | 'EXPIRED';

export type AttachmentUploadStatus =
  | 'STAGED'
  | 'READY'
  | 'CLAIMED'
  | 'PROMOTED'
  | 'REJECTED'
  | 'FAILED'
  | 'EXPIRED';

export interface LocalAttachment {
  localId: string;
  clientUploadId: string;
  uploadId?: string;
  file?: File;
  originalName: string;
  sizeBytes: number;
  mimeType?: string;
  localStatus: LocalAttachmentStatus;
  serverStatus?: AttachmentUploadStatus;
  progress?: number; // 0 a 100
  expiresAt?: string;
  errorCode?: string;
  errorMessage?: string;
  abortController?: AbortController;
}

export interface StagedAttachmentResponse {
  id: string;
  clientUploadId?: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: AttachmentUploadStatus;
  expiresAt: string;
}

export interface AttachmentValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface BatchSelectionResult {
  accepted: LocalAttachment[];
  rejected: Array<{
    file: File;
    errorCode: string;
    errorMessage: string;
  }>;
}

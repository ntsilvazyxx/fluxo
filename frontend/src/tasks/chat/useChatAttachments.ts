import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.tsx';
import {
  cancelStagedTaskAttachment,
  ChatApiError,
  stageTaskAttachment,
} from './chat.api.ts';
import {
  CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE,
  CHAT_ATTACHMENT_MAX_MESSAGE_BYTES,
} from './chat-attachment.constants.ts';
import type {
  LocalAttachment,
  LocalAttachmentStatus,
} from './chat-attachment.types.ts';
import { validateBatchSelection } from './chat-attachment.validation.ts';

export interface UseChatAttachmentsProps {
  taskId: string;
  isOpen: boolean;
  canSend: boolean;
  isLocked: boolean;
}

export interface UseChatAttachmentsReturn {
  attachments: LocalAttachment[];
  batchErrors: string[];
  clearBatchErrors: () => void;
  addFiles: (files: File[]) => void;
  retryAttachment: (localId: string) => void;
  cancelAttachment: (localId: string) => void;
  removeAttachment: (localId: string) => Promise<void>;
  clearQueue: () => void;
  consumeAttachments: (uploadIds: string[]) => void;
  hasPendingUploads: boolean;
  totalBytes: number;
  totalCount: number;
  canAddMore: boolean;
  isUploading: boolean;
  readyAttachmentIds: string[];
}

export function useChatAttachments({
  taskId,
  isOpen,
  canSend,
  isLocked,
}: UseChatAttachmentsProps): UseChatAttachmentsReturn {
  const { user, upload, request } = useAuth();
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);

  // Referência para controlar o anexo em upload no momento e evitar concorrência
  const activeUploadRef = useRef<string | null>(null);
  const currentTaskIdRef = useRef<string>(taskId);
  const currentUserIdRef = useRef<string | undefined>(user?.id);

  // Isolamento estrito de contexto: limpa anexos se taskId ou userId mudarem
  useEffect(() => {
    if (currentTaskIdRef.current !== taskId || currentUserIdRef.current !== user?.id) {
      currentTaskIdRef.current = taskId;
      currentUserIdRef.current = user?.id;
      setAttachments([]);
      setBatchErrors([]);
      activeUploadRef.current = null;
    }
  }, [taskId, user?.id]);

  const clearBatchErrors = useCallback(() => {
    setBatchErrors([]);
  }, []);

  // Adição e validação preliminar de novos arquivos
  const addFiles = useCallback((files: File[]) => {
    if (!files || files.length === 0) return;
    if (isLocked || !canSend) return;

    setAttachments((prevQueue) => {
      const { accepted, rejected } = validateBatchSelection(files, prevQueue);

      if (rejected.length > 0) {
        const errorMsgs = rejected.map(
          (r) => `${r.file.name}: ${r.errorMessage}`,
        );
        setBatchErrors((prev) => [...prev, ...errorMsgs]);
      }

      if (accepted.length === 0) {
        return prevQueue;
      }

      return [...prevQueue, ...accepted];
    });
  }, [canSend, isLocked]);

  // Atualização atômica de campos de um anexo
  const updateAttachment = useCallback(
    (localId: string, patch: Partial<LocalAttachment>) => {
      setAttachments((prev) =>
        prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  // Reenviar anexo que falhou
  const retryAttachment = useCallback((localId: string) => {
    setAttachments((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        return {
          ...item,
          localStatus: 'QUEUED',
          progress: 0,
          errorCode: undefined,
          errorMessage: undefined,
        };
      }),
    );
  }, []);

  // Cancelar upload em andamento
  const cancelAttachment = useCallback((localId: string) => {
    setAttachments((prev) =>
      prev.map((item) => {
        if (item.localId !== localId) return item;
        return {
          ...item,
          localStatus: 'REJECTED',
          errorMessage: 'Upload cancelado pelo usuário.',
        };
      }),
    );
  }, []);

  // Remover anexo da fila (e limpar no servidor se já estiver em staging)
  const removeAttachment = useCallback(
    async (localId: string) => {
      const target = attachments.find((a) => a.localId === localId);
      if (!target) return;

      // Remove imediatamente da interface para responsividade
      setAttachments((prev) => prev.filter((a) => a.localId !== localId));

      // Se já estava em staging no servidor, solicita o cancelamento/expiração
      if (target.uploadId && request) {
        try {
          await cancelStagedTaskAttachment(request, taskId, target.uploadId);
        } catch {
          // Falhas na remoção remota (ex: já expirado) não impedem a limpeza local
        }
      }
    },
    [attachments, request, taskId],
  );

  // Limpeza completa da fila
  const clearQueue = useCallback(() => {
    // Tenta cancelar no servidor os que já subiram
    const uploaded = attachments.filter((a) => a.uploadId);
    if (uploaded.length > 0 && request) {
      uploaded.forEach((item) => {
        if (item.uploadId) {
          cancelStagedTaskAttachment(request, taskId, item.uploadId).catch(() => {});
        }
      });
    }
    setAttachments([]);
    setBatchErrors([]);
    activeUploadRef.current = null;
  }, [attachments, request, taskId]);

  // Consome anexos que foram publicados com sucesso em uma mensagem (sem chamar cancel no servidor)
  const consumeAttachments = useCallback((uploadIds: string[]) => {
    setAttachments((prev) =>
      prev.filter((a) => !a.uploadId || !uploadIds.includes(a.uploadId)),
    );
  }, []);

  // Worker sequencial de upload (1 arquivo por vez)
  useEffect(() => {
    if (!isOpen || isLocked || !canSend) return;

    // Se já houver um upload ativo, não dispara outro
    if (activeUploadRef.current) return;

    // Procura o próximo arquivo aguardando upload
    const nextItem = attachments.find(
      (a) => a.localStatus === 'SELECTED' || a.localStatus === 'QUEUED',
    );

    if (!nextItem || !nextItem.file) return;

    const localId = nextItem.localId;
    activeUploadRef.current = localId;

    // Marca como UPLOADING
    updateAttachment(localId, { localStatus: 'UPLOADING', progress: 0 });

    stageTaskAttachment(
      upload,
      taskId,
      nextItem.clientUploadId,
      nextItem.file,
      (percent) => {
        // Quando atinge 100% no XHR, o arquivo foi transmitido e o backend está processando
        const newStatus: LocalAttachmentStatus =
          percent >= 100 ? 'AWAITING_SERVER' : 'UPLOADING';
        updateAttachment(localId, {
          progress: percent,
          localStatus: newStatus,
        });
      },
    )
      .then((staged) => {
        updateAttachment(localId, {
          uploadId: staged.id,
          serverStatus: staged.status,
          expiresAt: staged.expiresAt,
          localStatus: 'READY',
          progress: 100,
          errorCode: undefined,
          errorMessage: undefined,
        });
      })
      .catch((err: any) => {
        const isAppError = err instanceof ChatApiError;
        const status = isAppError ? err.status : 0;
        const code = isAppError ? err.code : 'UPLOAD_FAILED';
        const message = err.message || 'Falha no upload do anexo.';

        // Erros recuperáveis (quota temporária 429, scanner 503, ou indisponibilidade de rede/5xx)
        const isRetryable =
          status === 429 ||
          status === 503 ||
          status >= 500 ||
          status === 0 ||
          !status;

        updateAttachment(localId, {
          localStatus: isRetryable ? 'RETRYABLE_ERROR' : 'REJECTED',
          errorCode: code,
          errorMessage: message,
        });
      })
      .finally(() => {
        activeUploadRef.current = null;
      });
  }, [attachments, canSend, isLocked, isOpen, taskId, updateAttachment, upload]);

  // Métricas agregadas da fila
  const activeAttachments = attachments.filter((a) => a.localStatus !== 'EXPIRED');
  const totalCount = activeAttachments.length;
  const totalBytes = activeAttachments.reduce((acc, a) => acc + a.sizeBytes, 0);

  const hasPendingUploads = attachments.some(
    (a) =>
      a.localStatus === 'SELECTED' ||
      a.localStatus === 'QUEUED' ||
      a.localStatus === 'UPLOADING' ||
      a.localStatus === 'AWAITING_SERVER',
  );

  const isUploading = attachments.some(
    (a) => a.localStatus === 'UPLOADING' || a.localStatus === 'AWAITING_SERVER',
  );

  const canAddMore =
    totalCount < CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE &&
    totalBytes < CHAT_ATTACHMENT_MAX_MESSAGE_BYTES &&
    !isLocked &&
    canSend;

  const readyAttachmentIds = attachments
    .filter((a) => a.localStatus === 'READY' && a.uploadId)
    .map((a) => a.uploadId as string);

  return {
    attachments,
    batchErrors,
    clearBatchErrors,
    addFiles,
    retryAttachment,
    cancelAttachment,
    removeAttachment,
    clearQueue,
    consumeAttachments,
    hasPendingUploads,
    totalBytes,
    totalCount,
    canAddMore,
    isUploading,
    readyAttachmentIds,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.tsx';
import { ChatApiError, sendTaskMessage } from './chat.api.ts';
import type {
  ChatMessage,
  LocalSendStatus,
  PendingChatMessage,
} from './chat.types.ts';

export interface UseChatMessageSenderOptions {
  taskId: string;
  canSend: boolean;
  isLocked: boolean;
  onMessageSent?: (message: ChatMessage) => void;
  onOptimisticMessage?: (message: PendingChatMessage | null) => void;
  readyAttachmentIds?: string[];
  hasPendingUploads?: boolean;
  hasAttachmentErrors?: boolean;
  onAttachmentsConsumed?: (consumedUploadIds: string[]) => void;
}

export interface SendIntent {
  clientMessageId: string;
  content: string | null;
  stagedAttachmentIds: string[];
  taskId: string;
  userId: string;
}

export function useChatMessageSender({
  taskId,
  canSend,
  isLocked,
  onMessageSent,
  onOptimisticMessage,
  readyAttachmentIds = [],
  hasPendingUploads = false,
  hasAttachmentErrors = false,
  onAttachmentsConsumed,
}: UseChatMessageSenderOptions) {
  const { user, request } = useAuth();
  const currentUserId = user?.id;

  const [text, setText] = useState('');
  const [status, setStatus] = useState<LocalSendStatus>('IDLE');
  const [error, setError] = useState<string | null>(null);

  // Intenção ativa de envio congelada (para garantia de idempotência estrita em reenvios)
  const activeIntentRef = useRef<SendIntent | null>(null);
  // Trava síncrona contra duplo-clique / múltiplos envios concorrentes
  const inFlightRef = useRef(false);
  // Rastreador de contexto ativo (impede que respostas atrasadas alterem outra tarefa/usuário)
  const contextRef = useRef({ taskId, userId: currentUserId });

  useEffect(() => {
    contextRef.current = { taskId, userId: currentUserId };
  }, [taskId, currentUserId]);

  // Limpeza estrita ao trocar de tarefa ou de usuário autenticado
  const wipeDraft = useCallback(() => {
    setText('');
    setStatus('IDLE');
    setError(null);
    activeIntentRef.current = null;
    inFlightRef.current = false;
    onOptimisticMessage?.(null);
  }, [onOptimisticMessage]);

  useEffect(() => {
    wipeDraft();
  }, [taskId, currentUserId, wipeDraft]);

  // Atualização do texto pelo usuário
  const updateText = useCallback((newText: string) => {
    setText(newText);
    // Se o usuário altera o texto após erro, a intenção anterior é descartada
    if (activeIntentRef.current) {
      activeIntentRef.current = null;
      setStatus('IDLE');
      setError(null);
      onOptimisticMessage?.(null);
    }
  }, [onOptimisticMessage]);

  /**
   * Executa o envio ou reenvio idempotente da mensagem.
   */
  const send = useCallback(async () => {
    // 1. Guardas síncronas contra disparos concorrentes
    if (inFlightRef.current) {
      return;
    }

    if (!canSend || isLocked) {
      setStatus('REJECTED');
      setError(
        isLocked
          ? 'O chat está bloqueado para envio de mensagens.'
          : 'Você não possui permissão para enviar mensagens.',
      );
      return;
    }

    if (!currentUserId || !taskId) {
      return;
    }

    // 2. Determinar conteúdo e identificador de idempotência
    let clientMessageId: string;
    let contentToSend: string | null;
    let attachmentIdsToSend: string[];

    if (activeIntentRef.current && status === 'RETRYABLE_ERROR') {
      // Reenvio idempotente: reutiliza RIGOROSAMENTE o mesmo UUID, o mesmo conteúdo e os mesmos anexos
      clientMessageId = activeIntentRef.current.clientMessageId;
      contentToSend = activeIntentRef.current.content;
      attachmentIdsToSend = activeIntentRef.current.stagedAttachmentIds;
    } else {
      // Novo envio: checagem de uploads em andamento
      if (hasPendingUploads) {
        setError('Aguarde a conclusão do upload de todos os anexos antes de enviar.');
        return;
      }

      if (hasAttachmentErrors) {
        setError('Corrija ou remova os anexos com erro antes de enviar.');
        return;
      }

      const trimmed = text.trim();
      const hasText = trimmed.length > 0;
      const hasAttachments = readyAttachmentIds.length > 0;

      // Validação de entrada: exige texto OU pelo menos um anexo
      if (!hasText && !hasAttachments) {
        setError('A mensagem deve conter texto ou pelo menos um anexo.');
        return;
      }

      if (trimmed.length > 10000) {
        setError('A mensagem excede o limite máximo permitido de 10.000 caracteres.');
        return;
      }

      if (readyAttachmentIds.length > 5) {
        setError('Máximo de 5 anexos por mensagem permitido.');
        return;
      }

      // Gera UUID v4 criptográfico seguro
      clientMessageId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      contentToSend = hasText ? trimmed : null;
      attachmentIdsToSend = [...readyAttachmentIds];

      // Congela a intenção imutável para idempotência e reenvios
      activeIntentRef.current = {
        clientMessageId,
        content: contentToSend,
        stagedAttachmentIds: attachmentIdsToSend,
        taskId,
        userId: currentUserId,
      };
    }

    // 3. Atualizar estados locais e emitir representação transitória otimista
    inFlightRef.current = true;
    setStatus('SENDING');
    setError(null);

    const optimisticMessage: PendingChatMessage = {
      id: `temp-${clientMessageId}`,
      conversationId: '',
      cycleId: '',
      authorId: currentUserId,
      author: {
        id: currentUserId,
        name: user?.name,
        role: user?.role?.code || 'USER',
      },
      sequenceNumber: '…',
      clientMessageId,
      content: contentToSend,
      status: 'SENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: [],
    };
    onOptimisticMessage?.(optimisticMessage);

    const intentSnapshot = activeIntentRef.current;

    try {
      // 4. Execução da chamada HTTP oficial
      const confirmedMessage = await sendTaskMessage(request, taskId, {
        clientMessageId,
        content: contentToSend,
        stagedAttachmentIds: attachmentIdsToSend,
      });

      // 5. Verificação de contexto pós-resposta (isolamento entre tarefas e usuários)
      if (
        contextRef.current.taskId !== intentSnapshot?.taskId ||
        contextRef.current.userId !== intentSnapshot?.userId
      ) {
        return;
      }

      // 6. Confirmação com sucesso: limpa o rascunho e remove anexos consumidos
      setText('');
      setStatus('IDLE');
      setError(null);
      activeIntentRef.current = null;
      onOptimisticMessage?.(null);

      // Descarrega da fila local os anexos que foram promovidos/consumidos
      if (intentSnapshot && intentSnapshot.stagedAttachmentIds.length > 0) {
        onAttachmentsConsumed?.(intentSnapshot.stagedAttachmentIds);
      }

      onMessageSent?.(confirmedMessage);
    } catch (err) {
      if (
        contextRef.current.taskId !== intentSnapshot?.taskId ||
        contextRef.current.userId !== intentSnapshot?.userId
      ) {
        return;
      }

      if (err instanceof ChatApiError) {
        if (err.status === 409) {
          // Conflito de idempotência definitivo
          setStatus('REJECTED');
          setError(
            err.message ||
              'Conflito de envio: o identificador já foi utilizado com conteúdo diferente.',
          );
          onOptimisticMessage?.({
            ...optimisticMessage,
            status: 'REJECTED',
            localError: err.message || 'Conflito de envio detectado.',
          });
        } else if (err.status === 423) {
          setStatus('REJECTED');
          setError('O chat desta tarefa foi bloqueado durante o envio.');
          onOptimisticMessage?.(null);
        } else if (err.status === 403) {
          setStatus('REJECTED');
          setError(
            'Você não possui autorização funcional para enviar mensagens nesta conversa.',
          );
          onOptimisticMessage?.(null);
        } else if (err.status === 400 || err.status === 422) {
          setStatus('REJECTED');
          setError(err.message || 'Dados da mensagem rejeitados pelo servidor.');
          onOptimisticMessage?.(null);
        } else {
          // Erro recuperável do servidor (500, 503, etc.)
          setStatus('RETRYABLE_ERROR');
          setError('Não foi possível confirmar o envio. Tente novamente.');
          onOptimisticMessage?.({
            ...optimisticMessage,
            status: 'RETRYABLE_ERROR',
            localError: 'Falha na comunicação com o servidor.',
          });
        }
      } else {
        // Falha de rede / Timeout: resultado desconhecido, preserva intenção para retry seguro
        setStatus('RETRYABLE_ERROR');
        setError('Não foi possível confirmar o envio. Tente novamente.');
        onOptimisticMessage?.({
          ...optimisticMessage,
          status: 'RETRYABLE_ERROR',
          localError: 'Falha de conexão durante o envio.',
        });
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [
    canSend,
    isLocked,
    currentUserId,
    taskId,
    status,
    hasPendingUploads,
    hasAttachmentErrors,
    text,
    readyAttachmentIds,
    user?.name,
    user?.role?.code,
    onOptimisticMessage,
    request,
    onAttachmentsConsumed,
    onMessageSent,
  ]);

  return {
    text,
    setText: updateText,
    status,
    error,
    isSubmitting: status === 'SENDING',
    canRetry: status === 'RETRYABLE_ERROR' && Boolean(activeIntentRef.current),
    send,
    handleSend: send,
    retry: send,
    handleRetry: send,
    clearError: () => setError(null),
    reset: wipeDraft,
  };
}

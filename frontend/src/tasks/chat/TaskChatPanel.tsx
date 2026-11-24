import {
  AlertCircle,
  AlertTriangle,
  Lock,
  MessageSquare,
  MessageSquareOff,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.tsx';
import { ChatComposer } from './ChatComposer.tsx';
import { ChatMessageItem } from './ChatMessageItem.tsx';
import { useChatAttachments } from './useChatAttachments.ts';
import { useChatMessageSender } from './useChatMessageSender.ts';
import { useTaskChat } from './useTaskChat.ts';
import type { ChatMessage } from './chat.types.ts';

export interface TaskChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  taskPublicNumber?: string | number;
  taskTitle?: string;
  triggerElement?: HTMLElement | null;
}

function getDateGroupLabel(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) return 'Hoje';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return 'Ontem';

    return d.toLocaleDateString('pt-BR');
  } catch {
    return 'Data desconhecida';
  }
}

function getLockBannerDetails(reason: string | null) {
  switch (reason) {
    case 'ADMIN_MAINTENANCE':
      return {
        title: 'Manutenção Administrativa',
        message: 'O chat está temporariamente bloqueado para envio de mensagens pela administração.',
        color: 'amber',
      };
    case 'REQUEST_PENDING':
      return {
        title: 'Solicitação em Análise',
        message: 'Novas mensagens estão suspensas temporariamente durante a análise da solicitação pendente.',
        color: 'sky',
      };
    case 'CYCLE_CLOSED':
      return {
        title: 'Ciclo Concluído',
        message: 'A tarefa foi concluída ou cancelada. Esta conversa permanece disponível em modo de consulta histórica.',
        color: 'slate',
      };
    default:
      return {
        title: 'Conversa Bloqueada',
        message: 'O envio de mensagens está bloqueado nesta conversa.',
        color: 'amber',
      };
  }
}

export function TaskChatPanel({
  isOpen,
  onClose,
  taskId,
  taskPublicNumber,
  taskTitle,
  triggerElement,
}: TaskChatPanelProps) {
  const { user } = useAuth();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const isInitialScrollDone = useRef(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const {
    conversation,
    messages,
    pendingMessage,
    loading,
    loadingMore,
    error,
    forbidden,
    chatNotInitialized,
    hasMore,
    isLocked,
    lockReason,
    canSendMessage,
    setPendingMessage,
    onMessageSent,
    loadMore,
    refetch,
  } = useTaskChat(taskId, isOpen);

  // Fila de gerenciamento e upload de anexos (Fase 5.1.7.3 / 5.1.7.4)
  const {
    attachments,
    batchErrors,
    clearBatchErrors,
    addFiles,
    retryAttachment,
    cancelAttachment,
    removeAttachment,
    clearQueue,
    consumeAttachments,
    readyAttachmentIds,
    hasPendingUploads,
    canAddMore: canAddMoreAttachments,
  } = useChatAttachments({
    taskId,
    isOpen,
    canSend: canSendMessage,
    isLocked,
  });

  const hasAttachmentErrors = attachments.some(
    (a) => a.localStatus === 'RETRYABLE_ERROR' || a.localStatus === 'REJECTED',
  );

  const {
    text,
    status: sendStatus,
    error: sendError,
    isSubmitting,
    setText,
    handleSend,
    handleRetry,
    clearError,
  } = useChatMessageSender({
    taskId,
    canSend: canSendMessage,
    isLocked,
    onMessageSent,
    onOptimisticMessage: setPendingMessage,
    readyAttachmentIds,
    hasPendingUploads,
    hasAttachmentErrors,
    onAttachmentsConsumed: consumeAttachments,
  });

  // Confirmação de fechamento se houver anexos na fila
  const handleRequestClose = () => {
    if (attachments.length > 0) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  const handleConfirmDiscard = () => {
    clearQueue();
    setShowDiscardConfirm(false);
    onClose();
  };

  const handleCancelDiscard = () => {
    setShowDiscardConfirm(false);
  };

  // Foco inicial e retorno de foco
  useEffect(() => {
    if (isOpen) {
      isInitialScrollDone.current = false;
      closeButtonRef.current?.focus();
    } else if (triggerElement && typeof triggerElement.focus === 'function') {
      triggerElement.focus();
    }
  }, [isOpen, triggerElement]);

  // Tecla Escape para fechar com verificação de descarte
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showDiscardConfirm, attachments.length]);

  // Rola para o final da lista quando mensagens forem carregadas ou enviadas
  useEffect(() => {
    if ((messages.length > 0 || pendingMessage) && messagesScrollRef.current) {
      messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight;
    }
  }, [messages.length, pendingMessage]);

  if (!isOpen) return null;

  const currentUserId = user?.id;
  const lockInfo = isLocked ? getLockBannerDetails(lockReason) : null;

  // Agrupa mensagens com separadores de data
  const renderMessageGroups = () => {
    let lastDateStr = '';
    return messages.map((m: ChatMessage) => {
      const dateLabel = getDateGroupLabel(m.createdAt);
      const isNewDateGroup = dateLabel !== lastDateStr;
      if (isNewDateGroup) {
        lastDateStr = dateLabel;
      }
      const isOwn = Boolean(currentUserId && m.authorId === currentUserId);

      return (
        <React.Fragment key={m.id}>
          {isNewDateGroup && (
            <div className="flex justify-center my-3 select-none">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider bg-slate-200/80 px-2.5 py-0.5 rounded-full shadow-2xs">
                {dateLabel}
              </span>
            </div>
          )}
          <ChatMessageItem message={m} taskId={taskId} isOwn={isOwn} />
        </React.Fragment>
      );
    });
  };

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleRequestClose();
        }
      }}
      className="fixed inset-0 z-[70] flex justify-end bg-slate-950/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-chat-panel-title"
        className="relative flex h-full w-full max-w-lg md:max-w-xl flex-col border-l border-border bg-slate-50 shadow-2xl animate-in slide-in-from-right duration-200"
      >
        {/* Cabeçalho do Chat */}
        <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <MessageSquare size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="task-chat-panel-title" className="text-sm font-bold text-text truncate">
                  Chat da tarefa
                </h2>
                {taskPublicNumber && (
                  <span className="text-xs font-bold text-brand-700">
                    #{taskPublicNumber}
                  </span>
                )}
                {isLocked && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                    Bloqueado
                  </span>
                )}
              </div>
              {taskTitle && (
                <p className="text-xs text-muted truncate max-w-xs sm:max-w-sm" title={taskTitle}>
                  {taskTitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Atualizar mensagens"
              title="Atualizar mensagens"
              disabled={loading}
              onClick={() => void refetch()}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Fechar chat da tarefa"
              onClick={handleRequestClose}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Modal interno de confirmação para descarte de anexos */}
        {showDiscardConfirm && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            aria-describedby="discard-desc"
            className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 animate-in fade-in duration-150"
          >
            <div className="w-full max-w-sm rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 id="discard-title" className="text-sm font-bold text-slate-900">
                    Descartar anexos da fila?
                  </h3>
                  <p id="discard-desc" className="text-xs text-slate-600 mt-1">
                    Você possui {attachments.length} anexo(s) selecionados que ainda não foram publicados. Ao fechar o chat, esses anexos serão descartados.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCancelDiscard}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Continuar no chat
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscard}
                  className="rounded-xl bg-danger px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-red-700 transition-colors cursor-pointer"
                >
                  Descartar e fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Banner de Bloqueio (quando aplicável) */}
        {lockInfo && (
          <div className="border-b border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-950 flex items-start gap-2">
            <Lock size={15} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">{lockInfo.title}</p>
              <p className="text-[11px] leading-tight text-amber-900/90">{lockInfo.message}</p>
            </div>
          </div>
        )}

        {/* Área de Mensagens com Rolagem Própria */}
        <div
          ref={messagesScrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 sm:px-5 space-y-1"
        >
          {/* Botão para carregar histórico anterior */}
          {hasMore && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? 'Carregando anteriores…' : 'Carregar mensagens anteriores'}
              </button>
            </div>
          )}

          {/* Skeleton de carregamento inicial */}
          {loading && messages.length === 0 && (
            <div aria-label="Carregando mensagens" className="space-y-4 py-6">
              <div className="flex flex-col items-start space-y-2 max-w-[70%]">
                <div className="h-3 w-24 bg-slate-200 rounded animate-pulse" />
                <div className="h-14 w-full bg-slate-200 rounded-2xl animate-pulse" />
              </div>
              <div className="flex flex-col items-end space-y-2 ml-auto max-w-[70%]">
                <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                <div className="h-10 w-full bg-brand-100 rounded-2xl animate-pulse" />
              </div>
              <div className="flex flex-col items-start space-y-2 max-w-[75%]">
                <div className="h-3 w-28 bg-slate-200 rounded animate-pulse" />
                <div className="h-16 w-full bg-slate-200 rounded-2xl animate-pulse" />
              </div>
            </div>
          )}

          {/* Estado de Acesso Negado (403) */}
          {forbidden && (
            <div
              role="alert"
              className="my-10 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-red-200 bg-red-50/50"
            >
              <div className="grid size-12 place-items-center rounded-full bg-red-100 text-danger mb-3">
                <ShieldAlert size={24} />
              </div>
              <h3 className="text-sm font-bold text-danger">Acesso Restrito</h3>
              <p className="mt-1 text-xs text-muted max-w-xs">
                Você não possui autorização funcional ou participação ativa no chat desta tarefa.
              </p>
            </div>
          )}

          {/* Estado de Chat Não Inicializado (404) */}
          {chatNotInitialized && (
            <div
              role="status"
              className="my-10 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-border bg-white"
            >
              <div className="grid size-12 place-items-center rounded-full bg-slate-100 text-muted mb-3">
                <MessageSquareOff size={24} />
              </div>
              <h3 className="text-sm font-bold text-text">Chat Não Inicializado</h3>
              <p className="mt-1 text-xs text-muted max-w-xs">
                A conversa desta tarefa ainda não foi iniciada ou o primeiro encaminhamento não ocorreu.
              </p>
            </div>
          )}

          {/* Estado de Erro de Conexão */}
          {error && !forbidden && !chatNotInitialized && (
            <div
              role="alert"
              className="my-6 rounded-xl border border-red-200 bg-red-50 p-4 text-center space-y-2"
            >
              <div className="flex items-center justify-center gap-1.5 text-danger font-semibold text-xs">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => void refetch()}
                className="action-secondary text-xs px-3 py-1"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Estado de Conversa Vazia */}
          {!loading && !error && !forbidden && !chatNotInitialized && messages.length === 0 && !pendingMessage && (
            <div
              role="status"
              className="my-12 flex flex-col items-center justify-center text-center p-6"
            >
              <div className="grid size-12 place-items-center rounded-full bg-slate-100 text-muted mb-3">
                <MessageSquare size={24} />
              </div>
              <h3 className="text-sm font-bold text-text">Nenhuma mensagem nesta conversa.</h3>
              <p className="mt-1 text-xs text-muted max-w-xs">
                As comunicações e orientações institucionais registradas para esta tarefa aparecerão aqui.
              </p>
            </div>
          )}

          {/* Lista de Mensagens */}
          {!loading && !forbidden && !chatNotInitialized && messages.length > 0 && renderMessageGroups()}

          {/* Mensagem Otimista / Pendente de Envio */}
          {pendingMessage && !messages.some((m) => m.clientMessageId === pendingMessage.clientMessageId) && (
            <ChatMessageItem
              message={pendingMessage as unknown as ChatMessage}
              taskId={taskId}
              isOwn={true}
            />
          )}
        </div>

        {/* Rodapé / Compositor Interativo de Mensagens com Anexos */}
        {!forbidden && !chatNotInitialized && (
          <ChatComposer
            text={text}
            onChangeText={setText}
            onSend={handleSend}
            onRetry={handleRetry}
            status={sendStatus}
            error={sendError}
            isSubmitting={isSubmitting}
            canSend={canSendMessage}
            isLocked={isLocked}
            lockReason={lockReason}
            onClearError={clearError}
            attachments={attachments}
            batchErrors={batchErrors}
            onClearBatchErrors={clearBatchErrors}
            onFilesSelected={addFiles}
            onRetryAttachment={retryAttachment}
            onCancelAttachment={cancelAttachment}
            onRemoveAttachment={removeAttachment}
            onClearAllAttachments={clearQueue}
            canAddMoreAttachments={canAddMoreAttachments}
          />
        )}
      </section>
    </div>
  );
}

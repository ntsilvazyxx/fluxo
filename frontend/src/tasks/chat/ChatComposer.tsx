import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  LoaderCircle,
  Lock,
  RefreshCw,
  Send,
  UploadCloud,
} from 'lucide-react';
import type { LocalAttachment } from './chat-attachment.types.ts';
import { ChatAttachmentPicker } from './ChatAttachmentPicker.tsx';
import { ChatAttachmentQueue } from './ChatAttachmentQueue.tsx';
import type { LocalSendStatus } from './chat.types.ts';

export interface ChatComposerProps {
  text: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onRetry: () => void;
  status: LocalSendStatus;
  error: string | null;
  isSubmitting: boolean;
  canSend: boolean;
  isLocked: boolean;
  lockReason?: string | null;
  onClearError?: () => void;
  // Integração da fila de anexos (Fase 5.1.7.3)
  attachments?: LocalAttachment[];
  batchErrors?: string[];
  onClearBatchErrors?: () => void;
  onFilesSelected?: (files: File[]) => void;
  onRetryAttachment?: (localId: string) => void;
  onCancelAttachment?: (localId: string) => void;
  onRemoveAttachment?: (localId: string) => void;
  onClearAllAttachments?: () => void;
  canAddMoreAttachments?: boolean;
}

export function ChatComposer({
  text,
  onChangeText,
  onSend,
  onRetry,
  status,
  error,
  isSubmitting,
  canSend,
  isLocked,
  lockReason,
  attachments = [],
  batchErrors = [],
  onClearBatchErrors = () => {},
  onFilesSelected,
  onRetryAttachment = () => {},
  onCancelAttachment = () => {},
  onRemoveAttachment = () => {},
  onClearAllAttachments = () => {},
  canAddMoreAttachments = true,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Auto-crescimento do textarea conforme o conteúdo digitado
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 144); // max 144px (~max-h-36)
    el.style.height = `${Math.max(newHeight, 44)}px`;
  }, [text]);

  const hasAttachments = attachments.length > 0;
  const hasPendingUploads = attachments.some(
    (a) =>
      a.localStatus === 'UPLOADING' ||
      a.localStatus === 'AWAITING_SERVER' ||
      a.localStatus === 'QUEUED' ||
      a.localStatus === 'SELECTED',
  );
  const hasErrors = attachments.some(
    (a) => a.localStatus === 'RETRYABLE_ERROR' || a.localStatus === 'REJECTED',
  );
  const allAttachmentsReady = hasAttachments && !hasPendingUploads && !hasErrors;
  const trimmedLength = text.trim().length;
  const rawLength = text.length;
  const isTooLong = trimmedLength > 10000;
  const hasContent = trimmedLength > 0 || allAttachmentsReady;

  // Envio habilitado para texto puro, anexos puros ou texto com anexos (Fase 5.1.7.4)
  const isSendDisabled =
    isSubmitting || !hasContent || isTooLong || hasPendingUploads || hasErrors;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Respeita eventos de composição IME
    if (e.nativeEvent?.isComposing || (e as any).isComposing) {
      return;
    }

    if (e.key === 'Enter') {
      if (e.shiftKey) {
        return;
      }

      e.preventDefault();
      if (!isSendDisabled && canSend && !isLocked) {
        onSend();
      }
    }
  };

  // Suporte a Drag-and-Drop de arquivos sobre o compositor
  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (isLocked || !canSend || !canAddMoreAttachments) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isLocked || !canSend || !canAddMoreAttachments) return;

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0 && onFilesSelected) {
      onFilesSelected(Array.from(droppedFiles));
    }
  };

  // 1. Estado Bloqueado por Lock
  if (isLocked) {
    return (
      <footer className="border-t border-border bg-amber-50/50 p-4">
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-amber-900 text-center">
          <Lock size={15} className="shrink-0 text-amber-700" />
          <span>
            {lockReason === 'CYCLE_CLOSED'
              ? 'Tarefa encerrada · O envio de novas mensagens está desabilitado.'
              : lockReason === 'REQUEST_PENDING'
              ? 'Solicitação pendente · Mensagens temporariamente suspensas.'
              : 'Chat em manutenção administrativa · Envio de mensagens bloqueado.'}
          </span>
        </div>
      </footer>
    );
  }

  // 2. Estado Sem Permissão Funcional (Apenas Leitura / Não Participante)
  if (!canSend) {
    return (
      <footer className="border-t border-border bg-slate-50 p-4">
        <div className="flex items-center justify-center gap-2 rounded-xl bg-white border border-border/80 px-3 py-2.5 text-center shadow-2xs">
          <Lock size={14} className="text-muted/80 shrink-0" />
          <p className="text-xs font-semibold text-muted">
            Modo somente leitura · Você não possui participação ativa nesta tarefa para envio de mensagens.
          </p>
        </div>
      </footer>
    );
  }

  return (
    <footer
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative border-t border-border bg-white p-3 sm:p-4 space-y-2.5 transition-colors"
    >
      {/* Overlay visual durante drag-and-drop */}
      {isDragging && (
        <div
          data-testid="chat-composer-drop-overlay"
          className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50/95 backdrop-blur-xs text-brand-800 transition-all pointer-events-none p-4"
        >
          <UploadCloud size={32} className="animate-bounce text-brand-700" />
          <span className="text-xs font-bold mt-1.5">Solte os arquivos aqui para anexar</span>
          <span className="text-[11px] text-brand-600">Até 5 arquivos, máx. 20 MB cada (50 MB total)</span>
        </div>
      )}

      {/* Fila de Anexos em Gerenciamento / Upload */}
      {(attachments.length > 0 || batchErrors.length > 0) && (
        <ChatAttachmentQueue
          attachments={attachments}
          batchErrors={batchErrors}
          onClearBatchErrors={onClearBatchErrors}
          onRetry={onRetryAttachment}
          onCancel={onCancelAttachment}
          onRemove={onRemoveAttachment}
          onClearAll={onClearAllAttachments}
        />
      )}

      {/* Alerta de erro recuperável com botão de nova tentativa */}
      {status === 'RETRYABLE_ERROR' && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle size={15} className="shrink-0 text-amber-700" />
            <span className="truncate">{error || 'Não foi possível confirmar o envio. Tente novamente.'}</span>
          </div>
          <button
            type="button"
            aria-label="Tentar enviar novamente"
            onClick={onRetry}
            disabled={isSubmitting}
            className="inline-flex shrink-0 items-center gap-1 font-bold text-brand-700 hover:text-brand-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={isSubmitting ? 'animate-spin' : ''} />
            <span>Tentar novamente</span>
          </button>
        </div>
      )}

      {/* Alerta de rejeição definitiva (400, 403, 409, 423) */}
      {status === 'REJECTED' && error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-danger"
        >
          <AlertCircle size={15} className="shrink-0 text-danger" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Caixa de Composição */}
      <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-slate-50/80 p-1.5 focus-within:border-brand-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/20 transition-all">
        {/* Botão de Anexo */}
        {onFilesSelected && (
          <div className="shrink-0 pb-1 pl-1">
            <ChatAttachmentPicker
              onFilesSelected={onFilesSelected}
              disabled={isSubmitting}
              canAddMore={canAddMoreAttachments}
            />
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          disabled={isSubmitting}
          onChange={(e) => onChangeText(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Mensagem do chat"
          placeholder={
            hasAttachments
              ? 'Adicione uma mensagem (opcional) ou envie os anexos...'
              : 'Digite sua mensagem...'
          }
          className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text placeholder:text-muted focus:outline-hidden disabled:opacity-50 min-h-[44px]"
        />

        {/* Botão de Envio */}
        <button
          type="button"
          aria-label="Enviar mensagem"
          disabled={isSendDisabled}
          onClick={onSend}
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-700 text-white shadow-2xs hover:bg-brand-800 active:scale-95 transition-all disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
        >
          {isSubmitting ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>

      {/* Rodapé com Contador de Caracteres e Dica de Teclado */}
      <div className="flex items-center justify-between px-1 text-[11px] text-muted select-none">
        <span className="hidden sm:inline">
          {hasPendingUploads ? (
            <span className="text-brand-700 font-medium">
              Aguardando conclusão do envio dos anexos...
            </span>
          ) : hasErrors ? (
            <span className="text-danger font-medium">
              Corrija ou remova os anexos com erro antes de enviar.
            </span>
          ) : (
            <>
              Pressione <kbd className="font-semibold text-text">Enter</kbd> para enviar,{' '}
              <kbd className="font-semibold text-text">Shift + Enter</kbd> para quebrar linha
            </>
          )}
        </span>
        <span
          className={`ml-auto font-medium ${
            isTooLong ? 'text-danger font-bold' : rawLength > 9000 ? 'text-amber-700' : ''
          }`}
        >
          {rawLength > 0 ? `${rawLength.toLocaleString('pt-BR')} / 10.000` : ''}
        </span>
      </div>
    </footer>
  );
}

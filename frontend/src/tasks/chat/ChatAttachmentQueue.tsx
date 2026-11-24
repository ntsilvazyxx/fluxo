import { AlertCircle, Trash2, X } from 'lucide-react';
import {
  CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE,
  CHAT_ATTACHMENT_MAX_MESSAGE_BYTES,
} from './chat-attachment.constants.ts';
import type { LocalAttachment } from './chat-attachment.types.ts';
import { formatBytes } from './chat-attachment.utils.ts';
import { ChatAttachmentQueueItem } from './ChatAttachmentQueueItem.tsx';

export interface ChatAttachmentQueueProps {
  attachments: LocalAttachment[];
  batchErrors: string[];
  onClearBatchErrors: () => void;
  onRetry: (localId: string) => void;
  onCancel: (localId: string) => void;
  onRemove: (localId: string) => void;
  onClearAll: () => void;
}

export function ChatAttachmentQueue({
  attachments,
  batchErrors,
  onClearBatchErrors,
  onRetry,
  onCancel,
  onRemove,
  onClearAll,
}: ChatAttachmentQueueProps) {
  if (attachments.length === 0 && batchErrors.length === 0) {
    return null;
  }

  const activeAttachments = attachments.filter((a) => a.localStatus !== 'EXPIRED');
  const count = activeAttachments.length;
  const totalBytes = activeAttachments.reduce((acc, a) => acc + a.sizeBytes, 0);

  return (
    <div
      data-testid="chat-attachment-queue"
      className="space-y-2 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3"
    >
      {/* Alertas de validação de seleção/batch */}
      {batchErrors.length > 0 && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-danger"
        >
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-danger" />
            <div className="space-y-0.5">
              <span className="font-bold">Alguns arquivos não puderam ser adicionados:</span>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-danger/90">
                {batchErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dispensar avisos de validação"
            onClick={onClearBatchErrors}
            className="grid size-6 place-items-center rounded-lg text-danger/70 hover:bg-red-100 hover:text-danger cursor-pointer shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Cabeçalho da fila com contador agregado e ação de limpar tudo */}
      {count > 0 && (
        <div className="flex items-center justify-between text-xs font-medium text-slate-600 px-1">
          <div className="flex items-center gap-1.5">
            <span>
              {count} de {CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE} arquivos
            </span>
            <span>·</span>
            <span>
              {formatBytes(totalBytes)} de {formatBytes(CHAT_ATTACHMENT_MAX_MESSAGE_BYTES)}
            </span>
          </div>

          {count > 1 && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-danger transition-colors cursor-pointer"
            >
              <Trash2 size={12} />
              <span>Limpar todos</span>
            </button>
          )}
        </div>
      )}

      {/* Lista de itens anexados */}
      {count > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
          {activeAttachments.map((attachment) => (
            <ChatAttachmentQueueItem
              key={attachment.localId}
              attachment={attachment}
              onRetry={onRetry}
              onCancel={onCancel}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

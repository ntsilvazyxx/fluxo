import {
  AlertCircle,
  CheckCircle2,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import type { LocalAttachment } from './chat-attachment.types.ts';
import { formatBytes, getFileCategory } from './chat-attachment.utils.ts';

export interface ChatAttachmentQueueItemProps {
  attachment: LocalAttachment;
  onRetry: (localId: string) => void;
  onCancel: (localId: string) => void;
  onRemove: (localId: string) => void;
}

export function ChatAttachmentQueueItem({
  attachment,
  onRetry,
  onCancel,
  onRemove,
}: ChatAttachmentQueueItemProps) {
  const { localId, originalName, sizeBytes, localStatus, progress = 0, errorMessage } = attachment;
  const category = getFileCategory(originalName);

  const renderIcon = () => {
    switch (category) {
      case 'image':
        return <FileImage size={18} className="text-emerald-600" />;
      case 'pdf':
        return <FileText size={18} className="text-rose-600" />;
      case 'word':
        return <FileText size={18} className="text-blue-600" />;
      case 'excel':
        return <FileSpreadsheet size={18} className="text-emerald-700" />;
      case 'text':
        return <FileText size={18} className="text-slate-600" />;
      default:
        return <File size={18} className="text-slate-500" />;
    }
  };

  const isUploading = localStatus === 'UPLOADING';
  const isAwaitingServer = localStatus === 'AWAITING_SERVER';
  const isReady = localStatus === 'READY';
  const isRetryable = localStatus === 'RETRYABLE_ERROR';
  const isRejected = localStatus === 'REJECTED';

  return (
    <div
      data-testid={`attachment-item-${localId}`}
      className={`relative flex items-center justify-between gap-2.5 rounded-xl border p-2.5 transition-all text-xs ${
        isRejected
          ? 'border-red-200 bg-red-50/70 text-red-950'
          : isRetryable
          ? 'border-amber-200 bg-amber-50/70 text-amber-950'
          : isReady
          ? 'border-emerald-200 bg-emerald-50/40 text-slate-800'
          : 'border-slate-200 bg-white text-slate-800'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100">
          {renderIcon()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold truncate text-text" title={originalName}>
              {originalName}
            </span>
            <span className="shrink-0 text-[10px] text-muted">
              ({formatBytes(sizeBytes)})
            </span>
          </div>

          {/* Barra de progresso para upload em andamento */}
          {isUploading && (
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-brand-600 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-brand-700 shrink-0">
                {progress}%
              </span>
            </div>
          )}

          {/* Aguardando resposta do backend (antivírus e staging) */}
          {isAwaitingServer && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-brand-700">
              <LoaderCircle size={12} className="animate-spin shrink-0" />
              <span>Processando no servidor…</span>
            </div>
          )}

          {/* Sucesso / Pronto */}
          {isReady && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
              <CheckCircle2 size={12} className="shrink-0" />
              <span>Pronto</span>
            </div>
          )}

          {/* Erro com mensagem */}
          {(isRetryable || isRejected) && errorMessage && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-danger truncate">
              <AlertCircle size={12} className="shrink-0" />
              <span className="truncate" title={errorMessage}>
                {errorMessage}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Ações do item */}
      <div className="flex items-center gap-1 shrink-0">
        {isUploading && (
          <button
            type="button"
            aria-label="Cancelar upload"
            title="Cancelar upload"
            onClick={() => onCancel(localId)}
            className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-200/80 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        )}

        {isRetryable && (
          <button
            type="button"
            aria-label="Tentar upload novamente"
            title="Tentar novamente"
            onClick={() => onRetry(localId)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={12} />
            <span className="text-[11px]">Reenviar</span>
          </button>
        )}

        {!isUploading && (
          <button
            type="button"
            aria-label="Remover anexo"
            title="Remover anexo"
            onClick={() => onRemove(localId)}
            className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-danger transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

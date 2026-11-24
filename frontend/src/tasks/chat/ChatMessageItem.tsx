import { AlertCircle, Clock, LoaderCircle } from 'lucide-react';
import { getRoleLabel } from '../../auth/roles.ts';
import { ChatAttachmentMetaItem } from './ChatAttachmentMeta.tsx';
import type { ChatMessage, PendingChatMessage } from './chat.types.ts';

function formatMessageTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ChatMessageItem({
  message,
  taskId,
  isOwn = false,
}: {
  message: ChatMessage | PendingChatMessage;
  taskId?: string;
  isOwn?: boolean;
}) {
  const timeStr = formatMessageTime(message.createdAt);
  const authorName = isOwn ? 'Você' : (message.author?.name || 'Participante');
  const roleLabel = !isOwn ? getRoleLabel(message.author?.role) : '';
  const seq = message.sequenceNumber && message.sequenceNumber !== '…' ? `#${message.sequenceNumber}` : null;
  const isSending = (message.status as string) === 'SENDING';
  const isRetryable = (message.status as string) === 'RETRYABLE_ERROR';
  const isPending = message.status === 'PENDING';
  const isFailed = message.status === 'FAILED' || (message.status as string) === 'REJECTED';
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  return (
    <article
      aria-label={`Mensagem de ${authorName} às ${timeStr}`}
      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} my-2 text-xs sm:text-sm`}
    >
      <div className={`flex items-baseline gap-2 mb-1 px-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
        <span className="font-bold text-text text-xs">
          {authorName}
        </span>
        {roleLabel && (
          <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 px-1.5 py-0.2 rounded border border-brand-200">
            {roleLabel}
          </span>
        )}
        <span className="text-[11px] text-muted">
          {timeStr}
        </span>
        {seq && (
          <span className="text-[10px] text-muted/60 font-mono" title={`Sequência oficial: ${message.sequenceNumber}`}>
            {seq}
          </span>
        )}
      </div>

      <div
        className={`relative max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-2xs space-y-2 ${
          isOwn
            ? isSending
              ? 'bg-brand-50/50 border border-brand-200/60 text-brand-900/80 rounded-tr-none'
              : 'bg-brand-50/80 border border-brand-200/90 text-brand-950 rounded-tr-none'
            : 'bg-white border border-border/80 text-text rounded-tl-none'
        }`}
      >
        {/* Conteúdo textual seguro */}
        {message.content && (
          <p className="whitespace-pre-wrap break-words leading-relaxed text-xs sm:text-sm font-normal">
            {message.content}
          </p>
        )}

        {/* Metadados de anexos */}
        {attachments.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {attachments.map((att) => (
              <ChatAttachmentMetaItem
                key={att.id}
                attachment={att}
                taskId={taskId}
                messageId={message.id}
                canDownload={message.status === 'PUBLISHED'}
              />
            ))}
          </div>
        )}

        {/* Indicadores de status assíncrono */}
        {isSending && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-brand-700 pt-0.5">
            <LoaderCircle size={12} className="animate-spin" />
            <span>Enviando…</span>
          </div>
        )}
        {isRetryable && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 pt-0.5">
            <AlertCircle size={12} />
            <span>Não confirmado · Tente novamente</span>
          </div>
        )}
        {isPending && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 pt-0.5">
            <Clock size={12} className="animate-spin" />
            <span>Processando publicação…</span>
          </div>
        )}
        {isFailed && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-danger pt-0.5">
            <AlertCircle size={12} />
            <span>Falha no envio da mensagem</span>
          </div>
        )}
      </div>
    </article>
  );
}


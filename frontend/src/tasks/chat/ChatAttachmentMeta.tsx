import { useState } from 'react';
import {
  AlertCircle,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.tsx';
import { downloadTaskAttachment } from './chat.api.ts';
import type { ChatAttachmentMeta } from './chat.types.ts';

export function formatFileSize(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined) return '0 B';
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n <= 0) return '0 B';

  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function getAttachmentIcon(mimeType: string, filename: string) {
  const lower = filename.toLowerCase();
  if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(lower)) {
    return <ImageIcon size={16} className="text-blue-600 shrink-0" />;
  }
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    return <FileText size={16} className="text-red-600 shrink-0" />;
  }
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    lower.endsWith('.xlsx')
  ) {
    return <FileSpreadsheet size={16} className="text-emerald-700 shrink-0" />;
  }
  if (
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('word') ||
    lower.endsWith('.docx')
  ) {
    return <FileText size={16} className="text-sky-700 shrink-0" />;
  }
  if (mimeType === 'text/plain' || lower.endsWith('.txt')) {
    return <FileCode size={16} className="text-slate-700 shrink-0" />;
  }
  return <Paperclip size={16} className="text-muted shrink-0" />;
}

function getExtensionLabel(filename: string, mimeType: string): string {
  const match = filename.match(/\.([0-9a-z]+)$/i);
  if (match) return match[1].toUpperCase();
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('png')) return 'PNG';
  if (mimeType.includes('jpeg')) return 'JPG';
  return 'ARQUIVO';
}

export interface ChatAttachmentMetaItemProps {
  attachment: ChatAttachmentMeta;
  taskId?: string;
  messageId?: string;
  canDownload?: boolean;
}

export function ChatAttachmentMetaItem({
  attachment,
  taskId,
  messageId,
  canDownload = true,
}: ChatAttachmentMetaItemProps) {
  const { request } = useAuth();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const icon = getAttachmentIcon(attachment.mimeType, attachment.originalName);
  const ext = getExtensionLabel(attachment.originalName, attachment.mimeType);
  const sizeFormatted = formatFileSize(attachment.sizeBytes);

  const isEligibleForDownload =
    canDownload &&
    Boolean(taskId) &&
    Boolean(messageId) &&
    Boolean(attachment.id) &&
    !messageId?.startsWith('temp-');

  const handleDownload = async () => {
    if (!isEligibleForDownload || isDownloading || !request || !taskId || !messageId) {
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      await downloadTaskAttachment(
        request,
        taskId,
        messageId,
        attachment.id,
        attachment.originalName,
      );
    } catch (err: any) {
      setDownloadError(err.message || 'Falha ao baixar anexo.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      aria-label={`Anexo: ${attachment.originalName} (${sizeFormatted})`}
      className="flex flex-col gap-1 rounded-xl border border-border/70 bg-white/95 px-3 py-2 text-xs shadow-2xs transition-colors"
      title={attachment.originalName}
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {icon}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text truncate max-w-[180px] sm:max-w-[240px]">
              {attachment.originalName}
            </p>
            <p className="text-[10px] text-muted font-medium">
              {ext} · {sizeFormatted}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isEligibleForDownload ? (
            <button
              type="button"
              aria-label={`Baixar anexo ${attachment.originalName}`}
              title={`Baixar ${attachment.originalName}`}
              disabled={isDownloading}
              onClick={handleDownload}
              className="grid size-8 place-items-center rounded-lg text-brand-700 hover:bg-brand-50 hover:text-brand-900 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isDownloading ? (
                <LoaderCircle size={15} className="animate-spin text-brand-700" />
              ) : (
                <Download size={15} />
              )}
            </button>
          ) : (
            <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
              Publicado
            </span>
          )}
        </div>
      </div>

      {downloadError && (
        <div
          role="alert"
          className="flex items-center gap-1 text-[11px] font-medium text-danger truncate pt-0.5 border-t border-red-100"
        >
          <AlertCircle size={12} className="shrink-0" />
          <span className="truncate">{downloadError}</span>
        </div>
      )}
    </div>
  );
}

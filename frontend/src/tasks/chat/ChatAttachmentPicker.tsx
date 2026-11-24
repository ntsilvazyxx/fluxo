import React, { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { ACCEPT_ATTRIBUTE } from './chat-attachment.constants.ts';

export interface ChatAttachmentPickerProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  canAddMore?: boolean;
  title?: string;
}

export function ChatAttachmentPicker({
  onFilesSelected,
  disabled = false,
  canAddMore = true,
  title = 'Anexar arquivos (máximo 5 arquivos, 20 MB cada, 50 MB total)',
}: ChatAttachmentPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = () => {
    if (disabled || !canAddMore) return;
    fileInputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFilesSelected(Array.from(files));
    }
    // Limpa o valor do input para permitir selecionar o mesmo arquivo novamente se desejado
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isDisabled = disabled || !canAddMore;

  return (
    <div className="relative inline-flex items-center">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        disabled={isDisabled}
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="chat-attachment-file-input"
      />
      <button
        type="button"
        aria-label="Anexar arquivo"
        title={title}
        disabled={isDisabled}
        onClick={handleClick}
        className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-200/80 hover:text-slate-800 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
      >
        <Paperclip size={18} />
      </button>
    </div>
  );
}

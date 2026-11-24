/**
 * Utilitários visuais e de formatação para anexos do Chat.
 */

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb.toFixed(1).replace('.', ',')} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

export function getFileCategory(filename: string): 'image' | 'pdf' | 'word' | 'excel' | 'text' | 'file' {
  const dot = filename.lastIndexOf('.');
  const ext = dot !== -1 ? filename.slice(dot).toLowerCase() : '';

  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'word';
  if (ext === '.xlsx') return 'excel';
  if (ext === '.txt') return 'text';
  return 'file';
}

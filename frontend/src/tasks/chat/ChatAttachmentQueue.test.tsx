import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalAttachment } from './chat-attachment.types.ts';
import { ChatAttachmentQueue } from './ChatAttachmentQueue.tsx';

describe('FASE 5.1.7.3 — ChatAttachmentQueue', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const sampleAttachments: LocalAttachment[] = [
    {
      localId: 'loc-1',
      clientUploadId: 'up-1',
      originalName: 'relatorio.pdf',
      sizeBytes: 1024 * 1024 * 2, // 2 MB
      localStatus: 'READY',
      uploadId: 'staged-1',
      progress: 100,
    },
    {
      localId: 'loc-2',
      clientUploadId: 'up-2',
      originalName: 'foto.jpg',
      sizeBytes: 1024 * 500, // 500 KB
      localStatus: 'UPLOADING',
      progress: 45,
    },
  ];

  it('1. Não renderiza nada quando não há anexos nem erros', () => {
    const { container } = render(
      <ChatAttachmentQueue
        attachments={[]}
        batchErrors={[]}
        onClearBatchErrors={vi.fn()}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('2. Renderiza cabeçalho com contagem, total em bytes e itens da fila', () => {
    render(
      <ChatAttachmentQueue
        attachments={sampleAttachments}
        batchErrors={[]}
        onClearBatchErrors={vi.fn()}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 de 5 arquivos/i)).toBeInTheDocument();
    expect(screen.getByText('relatorio.pdf')).toBeInTheDocument();
    expect(screen.getByText('foto.jpg')).toBeInTheDocument();
    expect(screen.getByText('Pronto')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('3. Não exibe aviso temporário de publicação desabilitada (Fase 5.1.7.4)', () => {
    render(
      <ChatAttachmentQueue
        attachments={sampleAttachments}
        batchErrors={[]}
        onClearBatchErrors={vi.fn()}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(
      screen.queryByText(
        /A publicação de mensagens com anexos será habilitada na próxima etapa/i,
      ),
    ).not.toBeInTheDocument();
  });

  it('4. Permite acionar remoção de anexo', () => {
    const onRemove = vi.fn();
    render(
      <ChatAttachmentQueue
        attachments={sampleAttachments}
        batchErrors={[]}
        onClearBatchErrors={vi.fn()}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
        onRemove={onRemove}
        onClearAll={vi.fn()}
      />,
    );

    const removeBtn = screen.getByRole('button', { name: 'Remover anexo' });
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('loc-1');
  });

  it('5. Exibe erros de validação em lote e permite dispensá-los', () => {
    const onClearBatchErrors = vi.fn();
    render(
      <ChatAttachmentQueue
        attachments={[]}
        batchErrors={['arquivo.exe: Formato não suportado.']}
        onClearBatchErrors={onClearBatchErrors}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('arquivo.exe: Formato não suportado.')).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: 'Dispensar avisos de validação' });
    fireEvent.click(dismissBtn);
    expect(onClearBatchErrors).toHaveBeenCalledTimes(1);
  });
});

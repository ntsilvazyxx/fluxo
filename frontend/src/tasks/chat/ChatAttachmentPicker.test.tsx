import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatAttachmentPicker } from './ChatAttachmentPicker.tsx';

describe('FASE 5.1.7.3 — ChatAttachmentPicker', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('1. Renderiza o botão de anexo com ícone de clipe e atributos corretos', () => {
    render(<ChatAttachmentPicker onFilesSelected={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Anexar arquivo' });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();

    const input = screen.getByTestId('chat-attachment-file-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain('.pdf');
    expect(input.accept).toContain('.jpg');
  });

  it('2. Fica desabilitado quando disabled=true ou canAddMore=false', () => {
    const { rerender } = render(
      <ChatAttachmentPicker onFilesSelected={vi.fn()} disabled={true} />,
    );
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeDisabled();

    rerender(
      <ChatAttachmentPicker onFilesSelected={vi.fn()} canAddMore={false} />,
    );
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeDisabled();
  });

  it('3. Dispara onFilesSelected ao selecionar arquivos no input nativo', () => {
    const onFilesSelected = vi.fn();
    render(<ChatAttachmentPicker onFilesSelected={onFilesSelected} />);

    const input = screen.getByTestId('chat-attachment-file-input');
    const testFile = new File(['conteudo'], 'teste.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [testFile] } });

    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    expect(onFilesSelected).toHaveBeenCalledWith([testFile]);
  });
});

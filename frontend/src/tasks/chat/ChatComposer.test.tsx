import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatComposer } from './ChatComposer.tsx';

describe('FASE 5.1.7.2 — ChatComposer (Compositor de Mensagens)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const defaultProps = {
    text: '',
    onChangeText: vi.fn(),
    onSend: vi.fn(),
    onRetry: vi.fn(),
    status: 'IDLE' as const,
    error: null,
    isSubmitting: false,
    canSend: true,
    isLocked: false,
    lockReason: null,
  };

  it('1. Renderiza o compositor vazio com botão de envio desabilitado', () => {
    render(<ChatComposer {...defaultProps} />);
    const textarea = screen.getByLabelText('Mensagem do chat');
    const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });

    expect(textarea).toBeInTheDocument();
    expect(sendBtn).toBeDisabled();
    expect(screen.getByText(/Pressione/i)).toBeInTheDocument();
  });

  it('2. Desabilita o botão de envio quando o texto contém apenas espaços em branco', () => {
    render(<ChatComposer {...defaultProps} text={'   \n\t   '} />);
    const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });
    expect(sendBtn).toBeDisabled();
  });

  it('3. Habilita o botão de envio quando há texto válido não vazio', () => {
    render(<ChatComposer {...defaultProps} text="Relatório técnico preenchido com sucesso." />);
    const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });
    expect(sendBtn).not.toBeDisabled();
  });

  it('4. Exibe e atualiza dinamicamente o contador de caracteres', () => {
    const { rerender } = render(<ChatComposer {...defaultProps} text="Olá" />);
    expect(screen.getByText('3 / 10.000')).toBeInTheDocument();

    rerender(<ChatComposer {...defaultProps} text="Texto com 20 carac.." />);
    expect(screen.getByText('20 / 10.000')).toBeInTheDocument();
  });

  it('5. Bloqueia envio e destaca em vermelho quando o texto excede 10.000 caracteres', () => {
    const hugeText = 'a'.repeat(10001);
    render(<ChatComposer {...defaultProps} text={hugeText} />);
    const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });

    expect(sendBtn).toBeDisabled();
    const counter = screen.getByText('10.001 / 10.000');
    expect(counter).toHaveClass('text-danger');
  });

  it('6. Chama onChangeText ao digitar no textarea', () => {
    const onChangeText = vi.fn();
    render(<ChatComposer {...defaultProps} onChangeText={onChangeText} />);
    const textarea = screen.getByLabelText('Mensagem do chat');

    fireEvent.change(textarea, { target: { value: 'Nova mensagem' } });
    expect(onChangeText).toHaveBeenCalledWith('Nova mensagem');
  });

  it('7. Dispara onSend ao pressionar Enter simples quando o texto é válido', () => {
    const onSend = vi.fn();
    render(<ChatComposer {...defaultProps} text="Mensagem de teste" onSend={onSend} />);
    const textarea = screen.getByLabelText('Mensagem do chat');

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('8. Não dispara onSend ao pressionar Shift + Enter (permite quebra de linha)', () => {
    const onSend = vi.fn();
    render(<ChatComposer {...defaultProps} text="Linha 1" onSend={onSend} />);
    const textarea = screen.getByLabelText('Mensagem do chat');

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('9. Dispara onSend ao pressionar Ctrl + Enter ou Cmd + Enter', () => {
    const onSend = vi.fn();
    render(<ChatComposer {...defaultProps} text="Texto confirmado" onSend={onSend} />);
    const textarea = screen.getByLabelText('Mensagem do chat');

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(onSend).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it('10. Não dispara onSend durante composição IME (teclado japonês/chinês/acentos)', () => {
    const onSend = vi.fn();
    render(<ChatComposer {...defaultProps} text="Compondo" onSend={onSend} />);
    const textarea = screen.getByLabelText('Mensagem do chat');

    fireEvent.keyDown(textarea, {
      key: 'Enter',
      isComposing: true,
      nativeEvent: { isComposing: true } as any,
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('11. Bloqueia textarea e exibe spinner no botão quando isSubmitting é true', () => {
    render(<ChatComposer {...defaultProps} text="Enviando texto" isSubmitting={true} />);
    const textarea = screen.getByLabelText('Mensagem do chat');
    const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });

    expect(textarea).toBeDisabled();
    expect(sendBtn).toBeDisabled();
  });

  it('12. Exibe rodapé bloqueado quando isLocked é true com razão CYCLE_CLOSED', () => {
    render(<ChatComposer {...defaultProps} isLocked={true} lockReason="CYCLE_CLOSED" />);
    expect(screen.queryByLabelText('Mensagem do chat')).not.toBeInTheDocument();
    expect(screen.getByText(/Tarefa encerrada · O envio de novas mensagens está desabilitado/i)).toBeInTheDocument();
  });

  it('13. Exibe rodapé bloqueado quando isLocked é true com razão REQUEST_PENDING', () => {
    render(<ChatComposer {...defaultProps} isLocked={true} lockReason="REQUEST_PENDING" />);
    expect(screen.getByText(/Solicitação pendente · Mensagens temporariamente suspensas/i)).toBeInTheDocument();
  });

  it('14. Exibe rodapé bloqueado com ADMIN_MAINTENANCE', () => {
    render(<ChatComposer {...defaultProps} isLocked={true} lockReason="ADMIN_MAINTENANCE" />);
    expect(screen.getByText(/Chat em manutenção administrativa · Envio de mensagens bloqueado/i)).toBeInTheDocument();
  });

  it('15. Exibe aviso de modo somente leitura quando canSend é false', () => {
    render(<ChatComposer {...defaultProps} canSend={false} />);
    expect(screen.queryByLabelText('Mensagem do chat')).not.toBeInTheDocument();
    expect(screen.getByText(/Modo somente leitura · Você não possui participação ativa/i)).toBeInTheDocument();
  });

  it('16. Exibe alerta de erro recuperável com botão de nova tentativa acionando onRetry', () => {
    const onRetry = vi.fn();
    render(
      <ChatComposer
        {...defaultProps}
        text="Mensagem que falhou"
        status="RETRYABLE_ERROR"
        error="Falha de conexão com o servidor. Tente novamente."
        onRetry={onRetry}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Falha de conexão com o servidor/i);

    const retryBtn = screen.getByRole('button', { name: 'Tentar enviar novamente' });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('17. Exibe alerta de erro de rejeição definitiva (ex.: 400 ou 403)', () => {
    render(
      <ChatComposer
        {...defaultProps}
        text="Mensagem inválida"
        status="REJECTED"
        error="A mensagem deve conter texto ou pelo menos um anexo."
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('A mensagem deve conter texto ou pelo menos um anexo.');
  });

  it('18. Não dispara onSend repetido se isSubmitting estiver ativo ao pressionar Enter', () => {
    const onSend = vi.fn();
    render(
      <ChatComposer
        {...defaultProps}
        text="Mensagem em voo"
        isSubmitting={true}
        onSend={onSend}
      />
    );
    const textarea = screen.getByLabelText('Mensagem do chat');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('19. Habilita envio de mensagem exclusivamente com anexos quando prontos (Fase 5.1.7.4)', () => {
    const onSend = vi.fn();
    const mockAttachment = {
      localId: 'loc-1',
      clientUploadId: 'up-1',
      originalName: 'arquivo.pdf',
      sizeBytes: 1024,
      localStatus: 'READY' as const,
    };

    render(
      <ChatComposer
        {...defaultProps}
        text=""
        attachments={[mockAttachment]}
        onSend={onSend}
      />,
    );

    const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });
    expect(sendBtn).not.toBeDisabled();

    const textarea = screen.getByLabelText('Mensagem do chat');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('19.1 Bloqueia o envio quando há anexos em upload ativo', () => {
    const onSend = vi.fn();
    const mockUploadingAttachment = {
      localId: 'loc-1',
      clientUploadId: 'up-1',
      originalName: 'arquivo.pdf',
      sizeBytes: 1024,
      localStatus: 'UPLOADING' as const,
      progress: 50,
    };

    render(
      <ChatComposer
        {...defaultProps}
        text="Texto da mensagem"
        attachments={[mockUploadingAttachment]}
        onSend={onSend}
      />,
    );

    const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });
    expect(sendBtn).toBeDisabled();
    expect(
      screen.getByText(/Aguardando conclusão do envio dos anexos/i),
    ).toBeInTheDocument();
  });

  it('20. Renderiza botão de anexo e dispara onFilesSelected ao selecionar arquivo', () => {
    const onFilesSelected = vi.fn();
    render(
      <ChatComposer
        {...defaultProps}
        onFilesSelected={onFilesSelected}
      />,
    );

    const attachBtn = screen.getByRole('button', { name: 'Anexar arquivo' });
    expect(attachBtn).toBeInTheDocument();

    const input = screen.getByTestId('chat-attachment-file-input');
    const file = new File(['dados'], 'nota.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('21. Suporte a drag-and-drop: aciona onFilesSelected ao soltar arquivos no compositor', () => {
    const onFilesSelected = vi.fn();
    const { container } = render(
      <ChatComposer
        {...defaultProps}
        onFilesSelected={onFilesSelected}
      />,
    );

    const footer = container.querySelector('footer')!;
    const file = new File(['pdf-data'], 'doc.pdf', { type: 'application/pdf' });

    // Drag over ativa o drop zone
    fireEvent.dragOver(footer);
    expect(screen.getByTestId('chat-composer-drop-overlay')).toBeInTheDocument();

    // Drop transfere os arquivos e fecha o overlay
    fireEvent.drop(footer, {
      dataTransfer: {
        files: [file],
      },
    });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
    expect(screen.queryByTestId('chat-composer-drop-overlay')).not.toBeInTheDocument();
  });
});

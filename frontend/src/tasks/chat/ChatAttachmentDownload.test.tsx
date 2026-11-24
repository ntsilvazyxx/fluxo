import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTaskAttachment } from './chat.api.ts';
import { ChatAttachmentMetaItem } from './ChatAttachmentMeta.tsx';

const authMock = vi.hoisted(() => ({
  request: vi.fn(),
  user: { id: 'usr-tech-1', name: 'Técnico' } as any,
}));

vi.mock('../../auth/AuthContext.tsx', () => ({
  useAuth: () => authMock,
}));

describe('FASE 5.1.7.5 — Download Seguro de Anexos do Chat', () => {
  let createObjectURLSpy: any;
  let revokeObjectURLSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    createObjectURLSpy = vi.fn().mockReturnValue('blob:http://localhost:5173/mock-blob-uuid');
    revokeObjectURLSpy = vi.fn();
    window.URL.createObjectURL = createObjectURLSpy;
    window.URL.revokeObjectURL = revokeObjectURLSpy;
  });

  afterEach(() => {
    cleanup();
  });

  it('1. downloadTaskAttachment dispara GET com headers seguros e dispara download no navegador', async () => {
    const mockBlob = new Blob(['conteudo binario pdf'], { type: 'application/pdf' });
    const mockHeaders = new Headers();
    mockHeaders.set('content-disposition', 'attachment; filename="laudo_fundiario.pdf"');

    authMock.request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: mockHeaders,
      blob: async () => mockBlob,
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadTaskAttachment(
      authMock.request,
      'task-100',
      'msg-200',
      'att-300',
      'laudo_fundiario.pdf',
    );

    expect(authMock.request).toHaveBeenCalledWith(
      '/tasks/task-100/chat/messages/msg-200/attachments/att-300/download',
    );
    expect(createObjectURLSpy).toHaveBeenCalledWith(mockBlob);
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it('2. downloadTaskAttachment extrai nome seguro UTF-8 do header Content-Disposition', async () => {
    const mockBlob = new Blob(['dados'], { type: 'application/pdf' });
    const mockHeaders = new Headers();
    mockHeaders.set(
      'content-disposition',
      "attachment; filename*=UTF-8''relat%C3%B3rio%20de%20vistoria.pdf",
    );

    authMock.request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: mockHeaders,
      blob: async () => mockBlob,
    });

    let downloadedFilename = '';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download;
    });

    await downloadTaskAttachment(
      authMock.request,
      'task-100',
      'msg-200',
      'att-300',
    );

    expect(downloadedFilename).toBe('relatório de vistoria.pdf');
    clickSpy.mockRestore();
  });

  it('3. Rejeita com ChatApiError e NÃO cria blob se backend retornar 403 ou 404', async () => {
    authMock.request.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: { code: 'FORBIDDEN', message: 'Acesso negado a anexo privado.' },
      }),
    });

    await expect(
      downloadTaskAttachment(authMock.request, 'task-100', 'msg-200', 'att-300'),
    ).rejects.toThrow('Acesso negado a anexo privado.');

    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it('4. ChatAttachmentMetaItem renderiza botão de download para anexo publicado', async () => {
    const attachment = {
      id: 'att-50',
      originalName: 'memorial.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024 * 1024,
      createdAt: '2026-11-20T10:00:00.000Z',
    };

    render(
      <ChatAttachmentMetaItem
        attachment={attachment}
        taskId="task-100"
        messageId="msg-200"
        canDownload={true}
      />,
    );

    const downloadBtn = screen.getByRole('button', { name: /Baixar anexo memorial.pdf/i });
    expect(downloadBtn).toBeInTheDocument();
    expect(downloadBtn).not.toBeDisabled();
  });

  it('5. Previne múltiplos cliques exibindo feedback de carregamento durante download', async () => {
    const attachment = {
      id: 'att-50',
      originalName: 'memorial.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      createdAt: '2026-11-20T10:00:00.000Z',
    };

    let resolveDownload: any;
    authMock.request.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }),
    );

    render(
      <ChatAttachmentMetaItem
        attachment={attachment}
        taskId="task-100"
        messageId="msg-200"
        canDownload={true}
      />,
    );

    const downloadBtn = screen.getByRole('button', { name: /Baixar anexo memorial.pdf/i });
    fireEvent.click(downloadBtn);

    // Botão desabilitado enquanto estiver baixando
    expect(downloadBtn).toBeDisabled();

    // Finaliza a requisição
    resolveDownload({
      ok: true,
      status: 200,
      headers: new Headers(),
      blob: async () => new Blob(['x']),
    });

    await waitFor(() => {
      expect(downloadBtn).not.toBeDisabled();
    });
  });

  it('6. Exibe mensagem de erro caso o download falhe no backend', async () => {
    const attachment = {
      id: 'att-50',
      originalName: 'arquivo_falha.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      createdAt: '2026-11-20T10:00:00.000Z',
    };

    authMock.request.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 'CHAT_ATTACHMENT_NOT_FOUND', message: 'Anexo indisponível.' },
      }),
    });

    render(
      <ChatAttachmentMetaItem
        attachment={attachment}
        taskId="task-100"
        messageId="msg-200"
        canDownload={true}
      />,
    );

    const downloadBtn = screen.getByRole('button', { name: /Baixar anexo arquivo_falha.pdf/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Anexo indisponível.');
    });
  });

  it('7. Omite botão de download para mensagens temporárias/pendentes de publicação', () => {
    const attachment = {
      id: 'att-50',
      originalName: 'memorial.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      createdAt: '2026-11-20T10:00:00.000Z',
    };

    render(
      <ChatAttachmentMetaItem
        attachment={attachment}
        taskId="task-100"
        messageId="temp-msg-123"
        canDownload={false}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Baixar anexo memorial.pdf/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
  });
});

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatAttachments } from './useChatAttachments.ts';

const authMock = vi.hoisted(() => ({
  request: vi.fn(),
  upload: vi.fn(),
  user: { id: 'user-test-1', name: 'Tester' } as any,
}));

vi.mock('../../auth/AuthContext.tsx', () => ({
  useAuth: () => authMock,
}));

describe('FASE 5.1.7.3 — useChatAttachments (Hook de Gerenciamento e Upload Sequencial)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Inicia com fila vazia e métricas zeradas', () => {
    const { result } = renderHook(() =>
      useChatAttachments({
        taskId: 'task-1',
        isOpen: true,
        canSend: true,
        isLocked: false,
      }),
    );

    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.totalBytes).toBe(0);
    expect(result.current.hasPendingUploads).toBe(false);
    expect(result.current.canAddMore).toBe(true);
  });

  it('2. Adiciona arquivos válidos e inicia o upload sequencial com sucesso', async () => {
    authMock.upload.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 'staged-123',
          originalName: 'laudo.pdf',
          sizeBytes: 1024,
          status: 'READY',
          expiresAt: '2026-11-25T10:00:00.000Z',
        },
      }),
    });

    const { result } = renderHook(() =>
      useChatAttachments({
        taskId: 'task-1',
        isOpen: true,
        canSend: true,
        isLocked: false,
      }),
    );

    const testFile = new File(['conteudo'], 'laudo.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.addFiles([testFile]);
    });

    expect(result.current.totalCount).toBe(1);

    await waitFor(() => {
      expect(authMock.upload).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.attachments[0].localStatus).toBe('READY');
      expect(result.current.attachments[0].uploadId).toBe('staged-123');
      expect(result.current.readyAttachmentIds).toEqual(['staged-123']);
    });
  });

  it('3. Trata erro 429 (quota excedida) como RETRYABLE_ERROR e permite reenvio', async () => {
    authMock.upload.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: 'CHAT_ATTACHMENT_QUOTA_EXCEEDED',
          message: 'Quota de upload excedida.',
        },
      }),
    });

    const { result } = renderHook(() =>
      useChatAttachments({
        taskId: 'task-1',
        isOpen: true,
        canSend: true,
        isLocked: false,
      }),
    );

    const testFile = new File(['conteudo'], 'relatorio.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.addFiles([testFile]);
    });

    await waitFor(() => {
      expect(result.current.attachments[0]?.localStatus).toBe('RETRYABLE_ERROR');
    });

    expect(result.current.attachments[0].errorMessage).toBe('Quota de upload excedida.');

    // Agora simula sucesso na nova tentativa
    authMock.upload.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 'staged-retry-ok',
          originalName: 'relatorio.pdf',
          sizeBytes: 1024,
          status: 'READY',
          expiresAt: '2026-11-25T10:00:00.000Z',
        },
      }),
    });

    act(() => {
      result.current.retryAttachment(result.current.attachments[0].localId);
    });

    await waitFor(() => {
      expect(result.current.attachments[0]?.localStatus).toBe('READY');
      expect(result.current.attachments[0]?.uploadId).toBe('staged-retry-ok');
    });
  });

  it('4. Permite remover anexo e invoca cancelamento no backend quando já staged', async () => {
    authMock.request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'staged-del', status: 'EXPIRED' } }),
    });

    authMock.upload.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 'staged-del',
          originalName: 'doc.pdf',
          sizeBytes: 500,
          status: 'READY',
          expiresAt: '2026-11-25T10:00:00.000Z',
        },
      }),
    });

    const { result } = renderHook(() =>
      useChatAttachments({
        taskId: 'task-1',
        isOpen: true,
        canSend: true,
        isLocked: false,
      }),
    );

    const testFile = new File(['conteudo'], 'doc.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.addFiles([testFile]);
    });

    await waitFor(() => {
      expect(result.current.attachments[0]?.localStatus).toBe('READY');
    });

    const localId = result.current.attachments[0].localId;

    await act(async () => {
      await result.current.removeAttachment(localId);
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(authMock.request).toHaveBeenCalledWith(
      '/tasks/task-1/chat/attachments/staged/staged-del',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('5. Isolamento de contexto: limpa anexos se taskId for alterado', async () => {
    const { result, rerender } = renderHook(
      ({ taskId }) =>
        useChatAttachments({
          taskId,
          isOpen: true,
          canSend: true,
          isLocked: false,
        }),
      { initialProps: { taskId: 'task-10' } },
    );

    const testFile = new File(['conteudo'], 'teste.pdf', { type: 'application/pdf' });

    act(() => {
      result.current.addFiles([testFile]);
    });

    expect(result.current.attachments).toHaveLength(1);

    // Troca o taskId para isolamento
    rerender({ taskId: 'task-20' });

    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.totalCount).toBe(0);
  });
});

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatMessageSender } from './useChatMessageSender.ts';

const authMock = vi.hoisted(() => ({
  request: vi.fn(),
  user: { id: 'usr-1', name: 'Tester', role: { code: 'TECHNICIAN' } } as any,
}));

vi.mock('../../auth/AuthContext.tsx', () => ({
  useAuth: () => authMock,
}));

describe('FASE 5.1.7.4 — useChatMessageSender (Publicação com Anexos e Idempotência)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Envia mensagem textual padrão sem anexos', async () => {
    let capturedPayload: any = null;
    authMock.request.mockImplementation(async (url: string, opts: any) => {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'msg-1',
            clientMessageId: capturedPayload.clientMessageId,
            content: capturedPayload.content,
            status: 'PUBLISHED',
          },
        }),
      };
    });

    const onMessageSent = vi.fn();
    const { result } = renderHook(() =>
      useChatMessageSender({
        taskId: 'task-1',
        canSend: true,
        isLocked: false,
        onMessageSent,
      }),
    );

    act(() => {
      result.current.setText('Mensagem textual');
    });

    await act(async () => {
      await result.current.send();
    });

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.content).toBe('Mensagem textual');
    expect(capturedPayload.stagedAttachmentIds).toBeUndefined();
    expect(onMessageSent).toHaveBeenCalledTimes(1);
    expect(result.current.text).toBe('');
    expect(result.current.status).toBe('IDLE');
  });

  it('2. Envia mensagem exclusivamente com anexos (texto vazio)', async () => {
    let capturedPayload: any = null;
    const onAttachmentsConsumed = vi.fn();
    authMock.request.mockImplementation(async (url: string, opts: any) => {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'msg-2',
            clientMessageId: capturedPayload.clientMessageId,
            content: null,
            status: 'PUBLISHED',
            attachments: [{ id: 'att-1' }],
          },
        }),
      };
    });

    const { result } = renderHook(() =>
      useChatMessageSender({
        taskId: 'task-1',
        canSend: true,
        isLocked: false,
        readyAttachmentIds: ['upload-staged-1', 'upload-staged-2'],
        hasPendingUploads: false,
        onAttachmentsConsumed,
      }),
    );

    await act(async () => {
      await result.current.send();
    });

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.content).toBeUndefined(); // null omitido ou null
    expect(capturedPayload.stagedAttachmentIds).toEqual(['upload-staged-1', 'upload-staged-2']);
    expect(onAttachmentsConsumed).toHaveBeenCalledWith(['upload-staged-1', 'upload-staged-2']);
  });

  it('3. Envia mensagem combinada com texto e múltiplos anexos', async () => {
    let capturedPayload: any = null;
    const onAttachmentsConsumed = vi.fn();
    authMock.request.mockImplementation(async (url: string, opts: any) => {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'msg-3',
            clientMessageId: capturedPayload.clientMessageId,
            content: capturedPayload.content,
            status: 'PUBLISHED',
          },
        }),
      };
    });

    const { result } = renderHook(() =>
      useChatMessageSender({
        taskId: 'task-1',
        canSend: true,
        isLocked: false,
        readyAttachmentIds: ['upload-1'],
        hasPendingUploads: false,
        onAttachmentsConsumed,
      }),
    );

    act(() => {
      result.current.setText('Segue documento em anexo');
    });

    await act(async () => {
      await result.current.send();
    });

    expect(capturedPayload.content).toBe('Segue documento em anexo');
    expect(capturedPayload.stagedAttachmentIds).toEqual(['upload-1']);
    expect(onAttachmentsConsumed).toHaveBeenCalledWith(['upload-1']);
  });

  it('4. Bloqueia envio quando há uploads em andamento (hasPendingUploads=true)', async () => {
    const { result } = renderHook(() =>
      useChatMessageSender({
        taskId: 'task-1',
        canSend: true,
        isLocked: false,
        readyAttachmentIds: ['upload-1'],
        hasPendingUploads: true,
      }),
    );

    act(() => {
      result.current.setText('Tentativa de envio prematuro');
    });

    await act(async () => {
      await result.current.send();
    });

    expect(authMock.request).not.toHaveBeenCalled();
    expect(result.current.error).toContain('Aguarde a conclusão do upload');
  });

  it('5. Reenvio idempotente preserva clientMessageId e lista de stagedAttachmentIds', async () => {
    const capturedIds: string[] = [];
    let attempts = 0;

    authMock.request.mockImplementation(async (url: string, opts: any) => {
      attempts++;
      const payload = JSON.parse(opts.body);
      capturedIds.push(payload.clientMessageId);

      if (attempts === 1) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { message: 'Serviço temporariamente indisponível' } }),
        };
      }

      return {
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'msg-retry',
            clientMessageId: payload.clientMessageId,
            content: payload.content,
            status: 'PUBLISHED',
          },
        }),
      };
    });

    const { result } = renderHook(() =>
      useChatMessageSender({
        taskId: 'task-1',
        canSend: true,
        isLocked: false,
        readyAttachmentIds: ['att-retry-1'],
        hasPendingUploads: false,
      }),
    );

    act(() => {
      result.current.setText('Tentativa com retry');
    });

    await act(async () => {
      await result.current.send();
    });

    expect(result.current.status).toBe('RETRYABLE_ERROR');
    expect(result.current.canRetry).toBe(true);

    // Executa nova tentativa
    await act(async () => {
      await result.current.handleRetry();
    });

    expect(attempts).toBe(2);
    expect(capturedIds[0]).toBe(capturedIds[1]); // Mesmo UUID preservado
    expect(result.current.status).toBe('IDLE');
  });

  it('6. Trata resposta HTTP 202 (Accepted) com status PENDING', async () => {
    let capturedPayload: any = null;
    const onAttachmentsConsumed = vi.fn();
    const onMessageSent = vi.fn();

    authMock.request.mockImplementation(async (url: string, opts: any) => {
      capturedPayload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 202,
        json: async () => ({
          data: {
            id: 'msg-pending',
            clientMessageId: capturedPayload.clientMessageId,
            content: capturedPayload.content,
            status: 'PENDING',
            attachments: [{ id: 'att-pending', status: 'PENDING' }],
          },
        }),
      };
    });

    const { result } = renderHook(() =>
      useChatMessageSender({
        taskId: 'task-1',
        canSend: true,
        isLocked: false,
        readyAttachmentIds: ['upload-staged-1'],
        hasPendingUploads: false,
        onAttachmentsConsumed,
        onMessageSent,
      }),
    );

    act(() => {
      result.current.setText('Mensagem com anexo em processamento assíncrono');
    });

    await act(async () => {
      await result.current.send();
    });

    expect(capturedPayload.stagedAttachmentIds).toEqual(['upload-staged-1']);
    expect(onAttachmentsConsumed).toHaveBeenCalledWith(['upload-staged-1']);
    expect(onMessageSent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'msg-pending',
        status: 'PENDING',
      }),
    );
    expect(result.current.text).toBe('');
    expect(result.current.status).toBe('IDLE');
  });
});

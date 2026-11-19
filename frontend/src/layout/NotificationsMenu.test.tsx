import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsMenu } from './NotificationsMenu.tsx';
import * as AuthContextModule from '../auth/AuthContext.tsx';

describe('NotificationsMenu', () => {
  const mockRequest = vi.fn();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', name: 'Servidor Teste', role: 'TECHNICIAN' },
      request: mockRequest,
      login: vi.fn(),
      logout: vi.fn(),
    } as any);
  });

  it('carrega notificações na montagem e exibe o badge de não lidas', async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          notifications: [
            {
              id: 'notif-1',
              title: 'Nova atribuição',
              body: 'Você recebeu a tarefa #12',
              entityId: 'task-12',
              readAt: null,
            },
          ],
          meta: { unread: 1 },
        },
      }),
    });

    render(
      <MemoryRouter>
        <NotificationsMenu />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/notifications?page=1&pageSize=5&unread=false');
    });

    const badge = await screen.findByText('1');
    expect(badge).toBeInTheDocument();
  });

  it('abre o menu ao clicar no botão e exibe as notificações', async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          notifications: [
            {
              id: 'notif-1',
              title: 'Tarefa concluída',
              body: 'A tarefa #44 foi finalizada',
              entityId: 'task-44',
              readAt: null,
            },
          ],
          meta: { unread: 1 },
        },
      }),
    });

    render(
      <MemoryRouter>
        <NotificationsMenu />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /notificações/i });
    fireEvent.click(button);

    const title = await screen.findByText('Tarefa concluída');
    expect(title).toBeInTheDocument();
    expect(screen.getByText('A tarefa #44 foi finalizada')).toBeInTheDocument();
  });

  it('permite marcar uma notificação como lida', async () => {
    mockRequest.mockImplementation(async (url: string) => {
      if (url.includes('/read')) {
        return {
          ok: true,
          json: async () => ({ data: { id: 'notif-1', readAt: new Date().toISOString() } }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            notifications: [
              {
                id: 'notif-1',
                title: 'Aceite registrado',
                body: 'O técnico aceitou a tarefa',
                entityId: 'task-99',
                readAt: null,
              },
            ],
            meta: { unread: 1 },
          },
        }),
      };
    });

    render(
      <MemoryRouter>
        <NotificationsMenu />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /notificações/i });
    fireEvent.click(button);

    const markBtn = await screen.findByRole('button', { name: /marcar como lida/i });
    fireEvent.click(markBtn);

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith('/notifications/notif-1/read', { method: 'PATCH' });
    });
  });
});

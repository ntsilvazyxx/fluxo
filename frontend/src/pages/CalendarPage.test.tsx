import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CalendarPage } from './CalendarPage.tsx';
import * as AuthContextModule from '../auth/AuthContext.tsx';

describe('CalendarPage', () => {
  const mockRequest = vi.fn();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', name: 'Gestor Teste', role: { code: 'MANAGER' } },
      request: mockRequest,
    } as any);
  });

  it('renderiza o cabeçalho, controles e busca as tarefas do mês', async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          period: { start: '2026-11-01', end: '2026-11-30' },
          tasks: [
            {
              id: 'task-1',
              publicNumber: '42',
              team: { id: 't1', name: 'Equipe Alpha' },
              cycle: {
                id: 'c1',
                title: 'Parecer técnico ambiental',
                status: 'IN_PROGRESS',
                priority: 'HIGH',
                deadlineAt: '2026-11-15T18:00:00.000Z',
                openedAt: '2026-11-01T08:00:00.000Z',
              },
            },
          ],
          exceptions: [
            {
              id: 'exc-1',
              date: '2026-11-20',
              type: 'HOLIDAY',
              description: 'Consciência Negra',
            },
          ],
        },
      }),
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Calendário de Tarefas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mês' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana' })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalled();
    });

    // Confirma que a tarefa e o feriado aparecem
    const taskBadge = await screen.findByText(/#42/);
    expect(taskBadge).toBeInTheDocument();
    expect(screen.getByText('Consciência Negra')).toBeInTheDocument();
  });

  it('alterna para a visão semanal ao clicar em Semana', async () => {
    mockRequest.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          tasks: [],
          exceptions: [],
        },
      }),
    });

    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );

    const weekBtn = screen.getByRole('button', { name: 'Semana' });
    fireEvent.click(weekBtn);

    // Na visão semanal, os cartões de dias da semana aparecem
    expect(screen.getByText('Dom')).toBeInTheDocument();
    expect(screen.getByText('Seg')).toBeInTheDocument();
  });
});

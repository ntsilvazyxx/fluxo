import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskActivitiesTimeline } from './TaskActivitiesTimeline.tsx';

const auth = vi.hoisted(() => ({
  request: vi.fn(),
  user: { id: 'user-1', name: 'Usuário Logado', role: { code: 'TECHNICIAN' } } as any,
}));

vi.mock('../auth/AuthContext.tsx', () => ({
  useAuth: () => auth,
}));

describe('TaskActivitiesTimeline — Chat Funcional da Fase 5', () => {
  afterEach(cleanup);

  const sampleActiveTask = {
    id: 'task-uuid-1',
    publicNumber: '101',
    cycle: {
      id: 'cycle-1',
      status: 'IN_PROGRESS',
      closedAt: null,
    },
    comments: [
      {
        id: 'c1',
        content: 'Primeira mensagem do chat.',
        createdAt: '2026-11-16T10:00:00.000Z',
        author: { id: 'u1', name: 'Gestor Alpha', role: { code: 'MANAGER' } },
      },
    ],
    history: [
      {
        id: 'h1',
        action: 'TASK_CREATED_AND_ASSIGNED',
        actor: { name: 'Gestor Alpha' },
        createdAt: '2026-11-16T09:00:00.000Z',
        reason: null,
      },
    ],
  };

  const sampleCompletedTask = {
    ...sampleActiveTask,
    cycle: {
      id: 'cycle-1',
      status: 'COMPLETED',
      closedAt: '2026-11-16T18:00:00.000Z',
    },
  };

  beforeEach(() => {
    auth.request.mockReset();
  });

  it('1. renderiza comentários reais e eventos de auditoria na timeline ordenados por timestamp', () => {
    render(<TaskActivitiesTimeline task={sampleActiveTask} />);

    expect(screen.getByText('Comentários e Atividades')).toBeInTheDocument();
    expect(screen.getByText('Tarefa criada e atribuída')).toBeInTheDocument();
    expect(screen.getByText('Primeira mensagem do chat.')).toBeInTheDocument();
    expect(screen.getByText('Comentário')).toBeInTheDocument();
    expect(screen.getByText('Evento do sistema')).toBeInTheDocument();
  });

  it('2. permite escrever e enviar um comentário com sucesso, limpando o campo e atualizando a timeline', async () => {
    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          comment: {
            id: 'c2',
            taskId: 'task-uuid-1',
            content: 'Novo comentário enviado no teste.',
            createdAt: '2026-11-16T11:00:00.000Z',
            author: { id: 'user-1', name: 'Usuário Logado', role: { code: 'TECHNICIAN' } },
          },
        },
      }),
    });

    render(<TaskActivitiesTimeline task={sampleActiveTask} />);

    const textarea = screen.getByLabelText('Escreva seu comentário');
    fireEvent.change(textarea, { target: { value: 'Novo comentário enviado no teste.' } });

    const submitBtn = screen.getByRole('button', { name: 'Enviar' });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Novo comentário enviado no teste.')).toBeInTheDocument();
    });

    // Campo foi limpo após o sucesso
    expect(textarea).toHaveValue('');
    expect(auth.request).toHaveBeenCalledWith(
      '/tasks/task-uuid-1/comments',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('3. impede envio de comentário vazio ou somente com espaços em branco', () => {
    render(<TaskActivitiesTimeline task={sampleActiveTask} />);

    const textarea = screen.getByLabelText('Escreva seu comentário');
    const submitBtn = screen.getByRole('button', { name: 'Enviar' });

    // Inicialmente vazio
    expect(submitBtn).toBeDisabled();

    // Com apenas espaços em branco
    fireEvent.change(textarea, { target: { value: '   ' } });
    expect(submitBtn).toBeDisabled();
  });

  it('4. desabilita o envio e exibe alerta amigável quando a tarefa está concluída ou cancelada', () => {
    render(<TaskActivitiesTimeline task={sampleCompletedTask} />);

    expect(
      screen.getByText(/Esta tarefa foi concluída\. O envio de novos comentários está desabilitado/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Escreva seu comentário')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument();

    // Mas comentários anteriores continuam visíveis
    expect(screen.getByText('Primeira mensagem do chat.')).toBeInTheDocument();
  });

  it('5. em caso de erro na API, preserva o texto digitado e exibe opção de tentar novamente', async () => {
    auth.request.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { message: 'Erro interno ao salvar mensagem.' },
      }),
    });

    render(<TaskActivitiesTimeline task={sampleActiveTask} />);

    const textarea = screen.getByLabelText('Escreva seu comentário');
    fireEvent.change(textarea, { target: { value: 'Texto que não pode ser perdido.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Erro interno ao salvar mensagem.')).toBeInTheDocument();
    });

    // O texto digitado permanece no campo para não prejudicar o usuário
    expect(textarea).toHaveValue('Texto que não pode ser perdido.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('6. envia o comentário ao pressionar Enter sem Shift', async () => {
    auth.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          comment: {
            id: 'c-enter',
            taskId: 'task-uuid-1',
            content: 'Enviado via teclado Enter.',
            createdAt: '2026-11-16T12:00:00.000Z',
            author: { id: 'user-1', name: 'Usuário Logado', role: { code: 'TECHNICIAN' } },
          },
        },
      }),
    });

    render(<TaskActivitiesTimeline task={sampleActiveTask} />);

    const textarea = screen.getByLabelText('Escreva seu comentário');
    fireEvent.change(textarea, { target: { value: 'Enviado via teclado Enter.' } });

    // Enter sem shift
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('Enviado via teclado Enter.')).toBeInTheDocument();
    });
  });

  it('7. realiza polling periódico de comentários enquanto o componente estiver ativo', async () => {
    vi.useFakeTimers();

    auth.request.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          comments: [
            ...sampleActiveTask.comments,
            {
              id: 'c-polled',
              content: 'Comentário recebido via polling de outro usuário.',
              createdAt: '2026-11-16T13:00:00.000Z',
              author: { id: 'other', name: 'Outro Colega' },
            },
          ],
        },
      }),
    });

    render(<TaskActivitiesTimeline task={sampleActiveTask} />);

    // Avança 10 segundos no timer simulado
    await vi.advanceTimersByTimeAsync(10500);

    expect(auth.request).toHaveBeenCalledWith('/tasks/task-uuid-1/comments');

    vi.useRealTimers();
  });
});


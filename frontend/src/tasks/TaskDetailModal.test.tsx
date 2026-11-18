import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailModal } from './TaskDetailModal.tsx';

const auth = vi.hoisted(() => ({
  request: vi.fn(),
  upload: vi.fn(),
  user: { id: 'user-tech', role: { code: 'TECHNICIAN' } } as any,
}));

vi.mock('../auth/AuthContext.tsx', () => ({
  useAuth: () => auth,
}));

// Mock dos subpainéis com upload de arquivos/imagens para testes focados no modal
vi.mock('./ImageGalleryPanel.tsx', () => ({
  ImageGalleryPanel: ({ taskId }: { taskId: string }) => (
    <div data-testid="image-gallery-panel">Galeria de Imagens #{taskId}</div>
  ),
}));

afterEach(cleanup);

const mockTaskData = (status = 'AWAITING_ACCEPTANCE', assignedUserId = 'user-tech') => ({
  id: 'task-modal-1',
  publicNumber: '101',
  team: { id: 'team-1', name: 'Equipe de Infraestrutura' },
  createdBy: { id: 'admin-1', name: 'Administrador SEAF' },
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
  cycle: {
    id: 'cycle-1',
    cycleNumber: 1,
    title: 'Migração de Servidores e Banco de Dados',
    description: 'Realizar backup completo e migração para nova máquina.\nLinha 2 com detalhes adicionais.',
    priority: 'HIGH',
    status,
    deadlinePolicy: 'RUNNING_CLOCK',
    acceptanceDurationMinutes: 120,
    executionDurationMinutes: 1440,
    acceptanceDeadlineAt: '2026-11-10T11:00:00.000Z',
    executionDeadlineAt: '2026-11-11T11:00:00.000Z',
    deadlineAt: '2026-11-11T11:00:00.000Z',
    version: 1,
    openedAt: '2026-11-10T09:00:00.000Z',
    closedAt: status === 'COMPLETED' ? '2026-11-11T10:30:00.000Z' : null,
    completionText: status === 'COMPLETED' ? 'Migração realizada com 100% de sucesso e sem perdas.' : null,
    overdue: false,
    assignment: {
      id: 'assign-1',
      userId: assignedUserId,
      user: { id: assignedUserId, name: 'Técnico Responsável' },
    },
  },
  cycles: [
    {
      id: 'cycle-1',
      cycleNumber: 1,
      title: 'Migração de Servidores e Banco de Dados',
      description: 'Realizar backup completo e migração para nova máquina.',
      status,
      priority: 'HIGH',
      deadlinePolicy: 'RUNNING_CLOCK',
      version: 1,
      assignments: [
        {
          id: 'assign-1',
          userId: assignedUserId,
          user: { id: assignedUserId, name: 'Técnico Responsável' },
          assignedAt: '2026-11-10T09:00:00.000Z',
          acceptedAt: status !== 'AWAITING_ACCEPTANCE' ? '2026-11-10T09:30:00.000Z' : null,
          endedAt: null,
          pauseIntervals: [],
        },
      ],
      requests: [],
      deadlineChanges: [],
      notes: [
        {
          id: 'note-1',
          author: { name: 'Técnico Responsável' },
          content: 'Iniciando o checklist inicial de conectividade.',
          createdAt: '2026-11-10T09:35:00.000Z',
        },
      ],
    },
  ],
  subtasks: [],
  comments: [
    {
      id: 'comment-1',
      author: { name: 'Técnico Responsável' },
      content: 'Comentário sobre o andamento da migração.',
      createdAt: '2026-11-10T09:35:00.000Z',
    },
  ],
  history: [
    {
      id: 'event-1',
      action: 'TASK_CREATED_AND_ASSIGNED',
      actor: { name: 'Administrador SEAF' },
      createdAt: '2026-11-10T09:00:00.000Z',
      reason: 'Criação inicial da demanda',
    },
    {
      id: 'event-2',
      action: 'ASSIGNMENT_ACCEPTED',
      actor: { name: 'Técnico Responsável' },
      createdAt: '2026-11-10T09:30:00.000Z',
      reason: null,
    },
  ],
});

describe('Modal de Detalhes da Tarefa (TaskDetailModal)', () => {
  beforeEach(() => {
    auth.user = { id: 'user-tech', role: { code: 'TECHNICIAN' } };
    auth.request.mockReset().mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return {
          ok: true,
          json: async () => ({ data: { task: mockTaskData() } }),
        };
      }
      if (path.startsWith('/task-uploads/tasks/')) {
        return {
          ok: true,
          json: async () => ({ data: { attachments: [] } }),
        };
      }
      if (path === '/users') {
        return {
          ok: true,
          json: async () => ({ data: { users: [] } }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });
  });

  it('renderiza o cabeçalho completo, informações gerais e descrição da tarefa', async () => {
    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    // A. Cabeçalho
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Migração de Servidores e Banco de Dados' })).toBeInTheDocument();
    expect(screen.getByText(/Tarefa #101 · Ciclo 1/)).toBeInTheDocument();
    expect(screen.getAllByText('Aguardando aceite').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar modal de detalhes' })).toBeInTheDocument();

    // B. Informações gerais
    expect(screen.getAllByText('Técnico Responsável').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Equipe de Infraestrutura')).toBeInTheDocument();
    expect(screen.getAllByText('Administrador SEAF').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Prazos corridos')).toBeInTheDocument();

    // C. Descrição completa
    expect(screen.getByText(/Realizar backup completo e migração para nova máquina/)).toBeInTheDocument();
    expect(screen.getByText(/Linha 2 com detalhes adicionais/)).toBeInTheDocument();
  });

  it('apresenta a seção Comentários e Atividades estruturada com linha do tempo e área de input', async () => {
    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    await screen.findByRole('heading', { name: 'Migração de Servidores e Banco de Dados' });

    // Seção Comentários e Atividades
    expect(screen.getByRole('region', { name: 'Comentários e Atividades' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Comentários e Atividades' })).toBeInTheDocument();

    // Comentário diferenciado de evento automático do sistema e notas de execução
    expect(screen.getByText('Comentário')).toBeInTheDocument();
    expect(screen.getByText('Comentário sobre o andamento da migração.')).toBeInTheDocument();

    expect(screen.getByText('Nota de execução')).toBeInTheDocument();
    expect(screen.getByText('Iniciando o checklist inicial de conectividade.')).toBeInTheDocument();

    expect(screen.getAllByText('Evento do sistema').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Tarefa criada e atribuída/)).toBeInTheDocument();

    // Área funcional para envio de comentários na Fase 5
    const commentInput = screen.getByPlaceholderText('Escreva seu comentário...');
    expect(commentInput).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Enviar/i })).toBeDisabled(); // Desabilitado enquanto vazio
    expect(screen.getByText(/caracteres restantes/i)).toBeInTheDocument();
  });

  it('exibe resultado da execução em destaque quando a tarefa está concluída', async () => {
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return {
          ok: true,
          json: async () => ({ data: { task: mockTaskData('COMPLETED') } }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    await screen.findByText('Resultado da execução');
    expect(screen.getByText('Migração realizada com 100% de sucesso e sem perdas.')).toBeInTheDocument();
  });

  it('exibe ações conforme perfil e estado: responsável pode aceitar ou rejeitar atribuição', async () => {
    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    await screen.findByRole('heading', { name: 'Migração de Servidores e Banco de Dados' });

    // Ações para o responsável em AGUARDANDO_ACEITE
    expect(screen.getByRole('button', { name: 'Aceitar tarefa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeitar atribuição' })).toBeInTheDocument();
  });

  it('permite fechar o modal pelo botão X, tecla Escape e clique no backdrop', async () => {
    const onClose = vi.fn();
    const { container } = render(<TaskDetailModal taskId="task-modal-1" onClose={onClose} />);

    await screen.findByRole('dialog');

    // 1. Fechamento pelo botão X
    const closeBtn = screen.getByRole('button', { name: 'Fechar modal de detalhes' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // 2. Fechamento pela tecla Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    // 3. Fechamento por clique fora no backdrop
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('bloqueia o scroll do body enquanto o modal estiver aberto e restaura ao desmontar', async () => {
    const { unmount } = render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);
    await screen.findByRole('dialog');

    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('dispara onTaskUpdated quando uma ação bem-sucedida é executada', async () => {
    const onTaskUpdated = vi.fn();
    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} onTaskUpdated={onTaskUpdated} />);

    await screen.findByRole('button', { name: 'Aceitar tarefa' });

    auth.request.mockImplementation(async (path: string) => {
      if (path.includes('/accept')) {
        return { ok: true, json: async () => ({ data: {} }) };
      }
      if (path === '/tasks/task-modal-1') {
        return {
          ok: true,
          json: async () => ({ data: { task: mockTaskData('IN_PROGRESS') } }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aceitar tarefa' }));

    await waitFor(() => {
      expect(onTaskUpdated).toHaveBeenCalledTimes(1);
    });
  });
});

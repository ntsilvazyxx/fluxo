import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanPage } from './KanbanPage.tsx';
import { TaskDetailPage } from './TaskDetailPage.tsx';

const auth = vi.hoisted(() => ({
  request: vi.fn(),
  user: { id: 'self', role: { code: 'MANAGER' } } as any,
  features: { adminTaskCreation: false },
}));

vi.mock('../auth/AuthContext.tsx', () => ({
  useAuth: () => auth,
}));

vi.mock('../tasks/ImageGalleryPanel.tsx', () => ({
  ImageGalleryPanel: ({ taskId }: { taskId: string }) => (
    <div data-testid="image-gallery-mock">Galeria #{taskId}</div>
  ),
}));

afterEach(cleanup);

const mockKanbanTask = (id: string, title: string, status = 'AWAITING_ACCEPTANCE', userId = 'self') => ({
  id,
  publicNumber: id,
  team: { id: 'team-1', name: 'Equipe de Operações' },
  cycle: {
    id: `cycle-${id}`,
    cycleNumber: 1,
    title,
    status,
    priority: 'HIGH',
    deadlineAt: '2027-01-04T12:00:00Z',
    assignment: { userId, user: { id: userId, name: 'Usuário Responsável' } },
  },
});

const mockTaskDetail = (id: string, title: string, status = 'AWAITING_ACCEPTANCE') => ({
  id,
  publicNumber: id,
  team: { id: 'team-1', name: 'Equipe de Operações' },
  createdBy: { id: 'creator-1', name: 'Gestor Criador' },
  createdAt: '2026-11-10T09:00:00.000Z',
  updatedAt: '2026-11-10T09:00:00.000Z',
  cycle: {
    id: `cycle-${id}`,
    cycleNumber: 1,
    title,
    description: `Descrição detalhada da tarefa ${title}.`,
    priority: 'HIGH',
    status,
    deadlinePolicy: 'RUNNING_CLOCK',
    acceptanceDurationMinutes: 60,
    executionDurationMinutes: 1440,
    acceptanceDeadlineAt: '2026-11-10T10:00:00.000Z',
    executionDeadlineAt: '2026-11-11T10:00:00.000Z',
    deadlineAt: '2026-11-11T10:00:00.000Z',
    version: 1,
    openedAt: '2026-11-10T09:00:00.000Z',
    closedAt: null,
    completionText: null,
    overdue: false,
    assignment: {
      id: `assign-${id}`,
      userId: 'self',
      user: { id: 'self', name: 'Usuário Responsável' },
    },
  },
  cycles: [
    {
      id: `cycle-${id}`,
      cycleNumber: 1,
      title,
      description: `Descrição detalhada da tarefa ${title}.`,
      status,
      priority: 'HIGH',
      deadlinePolicy: 'RUNNING_CLOCK',
      version: 1,
      assignments: [
        {
          id: `assign-${id}`,
          userId: 'self',
          user: { id: 'self', name: 'Usuário Responsável' },
          assignedAt: '2026-11-10T09:00:00.000Z',
          acceptedAt: null,
          endedAt: null,
          pauseIntervals: [],
        },
      ],
      requests: [],
      deadlineChanges: [],
      notes: [],
    },
  ],
  subtasks: [],
  history: [
    {
      id: `hist-${id}`,
      action: 'TASK_CREATED_AND_ASSIGNED',
      actor: { name: 'Gestor Criador' },
      createdAt: '2026-11-10T09:00:00.000Z',
      reason: null,
    },
  ],
});

const listResponse = (tasks: any[]) => ({
  ok: true,
  json: async () => ({
    data: { tasks },
    meta: { page: 1, pageSize: 100, total: tasks.length, totalPages: 1 },
  }),
});

describe('Integração do Modal de Detalhes no Kanban (Fase 4)', () => {
  beforeEach(() => {
    auth.user = { id: 'self', role: { code: 'MANAGER' } };
    auth.features = { adminTaskCreation: false };

    auth.request.mockReset().mockImplementation(async (path: string) => {
      if (path.startsWith('/my-tasks')) {
        return listResponse([
          mockKanbanTask('1', 'Entrega Pessoal 1', 'AWAITING_ACCEPTANCE', 'self'),
          mockKanbanTask('2', 'Entrega em Andamento', 'IN_PROGRESS', 'self'),
        ]);
      }
      if (path.startsWith('/kanban')) {
        return listResponse([
          mockKanbanTask('1', 'Entrega Pessoal 1', 'AWAITING_ACCEPTANCE', 'self'),
          mockKanbanTask('2', 'Entrega em Andamento', 'IN_PROGRESS', 'self'),
          mockKanbanTask('3', 'Entrega Equipe', 'COMPLETED', 'other'),
        ]);
      }
      if (path.startsWith('/task-history')) {
        return listResponse([mockKanbanTask('3', 'Entrega Equipe', 'COMPLETED', 'other')]);
      }
      if (path.startsWith('/user-preferences/kanban-colors')) {
        return {
          ok: true,
          json: async () => ({
            data: { colors: { '1': 'blue' } },
          }),
        };
      }
      if (path.startsWith('/tasks/1')) {
        return {
          ok: true,
          json: async () => ({ data: { task: mockTaskDetail('1', 'Entrega Pessoal 1') } }),
        };
      }
      if (path.startsWith('/tasks/2')) {
        return {
          ok: true,
          json: async () => ({ data: { task: mockTaskDetail('2', 'Entrega em Andamento', 'IN_PROGRESS') } }),
        };
      }
      if (path.startsWith('/task-uploads/tasks/')) {
        return {
          ok: true,
          json: async () => ({ data: { attachments: [] } }),
        };
      }
      if (path === '/teams' || path === '/users') {
        return {
          ok: true,
          json: async () => ({ data: { teams: [], users: [] } }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });
  });

  it('1 e 2. Clique no cartão abre o modal centralizado mantendo o Kanban visível ao fundo', async () => {
    render(
      <MemoryRouter initialEntries={['/kanban']}>
        <KanbanPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Entrega Pessoal 1' });

    // Kanban está visível com suas 3 colunas
    expect(screen.getByRole('heading', { name: 'Aguardando aceite' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Em andamento' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finalizado' })).toBeInTheDocument();

    // Modal ainda não está no DOM
    expect(screen.queryByRole('dialog', { name: /Entrega Pessoal 1/i })).not.toBeInTheDocument();

    // 1. Clica no cartão da tarefa #1
    const cardLink = screen.getByRole('link', { name: 'Abrir tarefa #1: Entrega Pessoal 1' });
    fireEvent.click(cardLink);

    // 2. Modal abre centralizado
    const modal = await screen.findByRole('dialog');
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByRole('heading', { name: 'Entrega Pessoal 1' })).toBeInTheDocument();

    // Kanban permanece ao fundo no DOM
    expect(screen.getByRole('region', { name: 'Colunas do Kanban' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aguardando aceite' })).toBeInTheDocument();
  });

  it('3. Botão de paleta de cores não abre o modal', async () => {
    render(
      <MemoryRouter initialEntries={['/kanban']}>
        <KanbanPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Entrega Pessoal 1' });

    // Clica no botão de paleta de cores do cartão
    const paletteBtn = screen.getByRole('button', { name: 'Personalizar cor da tarefa #1' });
    fireEvent.click(paletteBtn);

    // Deve abrir o diálogo da paleta de cores, NÃO o modal de detalhes
    expect(screen.getByRole('dialog', { name: 'Paleta de cores do cartão' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Detalhes da tarefa/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Descrição detalhada da tarefa')).not.toBeInTheDocument();
  });

  it('4. Fechamento pelo botão X e pela tecla Escape', async () => {
    render(
      <MemoryRouter initialEntries={['/kanban']}>
        <KanbanPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Entrega Pessoal 1' });

    // Abre o modal
    fireEvent.click(screen.getByRole('link', { name: 'Abrir tarefa #1: Entrega Pessoal 1' }));
    await screen.findByRole('dialog');

    // Fecha pelo botão X
    const closeBtn = screen.getByRole('button', { name: 'Fechar modal de detalhes' });
    fireEvent.click(closeBtn);

    // Modal fechado
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Abre novamente
    fireEvent.click(screen.getByRole('link', { name: 'Abrir tarefa #1: Entrega Pessoal 1' }));
    await screen.findByRole('dialog');

    // Fecha pela tecla Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('5. Foco e acessibilidade: atributos semânticos corretos', async () => {
    render(
      <MemoryRouter initialEntries={['/kanban']}>
        <KanbanPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Entrega Pessoal 1' });
    fireEvent.click(screen.getByRole('link', { name: 'Abrir tarefa #1: Entrega Pessoal 1' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'task-detail-modal-title');
    expect(screen.getByRole('button', { name: 'Fechar modal de detalhes' })).toBeInTheDocument();
  });

  it('6 e 7. Visualização completa das informações e permissões das ações', async () => {
    render(
      <MemoryRouter initialEntries={['/kanban']}>
        <KanbanPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Entrega Pessoal 1' });
    fireEvent.click(screen.getByRole('link', { name: 'Abrir tarefa #1: Entrega Pessoal 1' }));

    const modal = await screen.findByRole('dialog');

    // Informações da tarefa
    expect(within(modal).getAllByText('Descrição detalhada da tarefa Entrega Pessoal 1.').length).toBeGreaterThanOrEqual(1);
    expect(within(modal).getByText('Equipe de Operações')).toBeInTheDocument();
    expect(within(modal).getAllByText('Gestor Criador').length).toBeGreaterThanOrEqual(1);
    expect(within(modal).getByText('Prazos corridos')).toBeInTheDocument();

    // Ações para o responsável em AGUARDANDO_ACEITE
    expect(within(modal).getByRole('button', { name: 'Aceitar tarefa' })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Rejeitar atribuição' })).toBeInTheDocument();
  });

  it('8. Atualização do Kanban após alterações sem recarregar a página', async () => {
    render(
      <MemoryRouter initialEntries={['/kanban']}>
        <KanbanPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Entrega Pessoal 1' });
    fireEvent.click(screen.getByRole('link', { name: 'Abrir tarefa #1: Entrega Pessoal 1' }));

    await screen.findByRole('button', { name: 'Aceitar tarefa' });

    const initialRequestCount = auth.request.mock.calls.length;

    auth.request.mockImplementation(async (path: string) => {
      if (path.includes('/accept')) {
        return { ok: true, json: async () => ({ data: {} }) };
      }
      if (path.startsWith('/tasks/1')) {
        return {
          ok: true,
          json: async () => ({ data: { task: mockTaskDetail('1', 'Entrega Pessoal 1', 'IN_PROGRESS') } }),
        };
      }
      return { ok: true, json: async () => ({ data: { tasks: [] } }) };
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aceitar tarefa' }));

    // onTaskUpdated chamou reloadAll, fazendo novas requisições para atualizar o Kanban
    await waitFor(() => {
      expect(auth.request.mock.calls.length).toBeGreaterThan(initialRequestCount);
    });
  });

  it('9. Preservação das cores personalizadas dos cartões no Kanban', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/kanban']}>
        <KanbanPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Entrega Pessoal 1' });

    // Cartão 1 com a cor azul carregada
    const cardArticle = container.querySelector('[data-task-id="1"]');
    await waitFor(() => {
      expect(cardArticle).toHaveClass('bg-sky-100/80');
    });

    // Abre e fecha o modal
    fireEvent.click(screen.getByRole('link', { name: 'Abrir tarefa #1: Entrega Pessoal 1' }));
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar modal de detalhes' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Cor azul permanece aplicada no cartão
    expect(cardArticle).toHaveClass('bg-sky-100/80');
  });

  it('10. Funcionamento na visualização Minhas Tarefas (/minhas-tarefas)', async () => {
    auth.user = { id: 'self', role: { code: 'TECHNICIAN' } };

    render(
      <MemoryRouter initialEntries={['/minhas-tarefas']}>
        <KanbanPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Minhas tarefas' });
    await screen.findByRole('heading', { name: 'Entrega Pessoal 1' });

    // Clica no cartão na visualização de Minhas Tarefas
    fireEvent.click(screen.getByRole('link', { name: 'Abrir tarefa #1: Entrega Pessoal 1' }));

    // Modal abre normalmente
    const modal = await screen.findByRole('dialog');
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByRole('heading', { name: 'Entrega Pessoal 1' })).toBeInTheDocument();
  });

  it('12. Acesso direto às rotas antigas de detalhes (/kanban/tarefas/:id) continua funcionando', async () => {
    render(
      <MemoryRouter initialEntries={['/kanban/tarefas/1']}>
        <Routes>
          <Route path="/kanban/tarefas/:id" element={<TaskDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Página de detalhes antiga renderiza normalmente
    expect(await screen.findByText('Voltar ao Kanban')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entrega Pessoal 1' })).toBeInTheDocument();
    expect(screen.getAllByText('Descrição detalhada da tarefa Entrega Pessoal 1.').length).toBeGreaterThanOrEqual(1);
  });
});

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
    expect(screen.getByText(/#101 · Percurso 1/)).toBeInTheDocument();
    expect(screen.getAllByText('Aguardando aceite').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar modal de detalhes' })).toBeInTheDocument();

    // B. Informações principais compactas
    expect(screen.getAllByText('Técnico Responsável').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Equipe de Infraestrutura')).toBeInTheDocument();
    expect(screen.getByText('Prazo de aceite:')).toBeInTheDocument();

    // C. Expande "Mais informações" para ver dados secundários
    fireEvent.click(screen.getByRole('button', { name: 'Mais informações' }));
    expect(screen.getAllByText('Administrador SEAF').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Prazos corridos')).toBeInTheDocument();

    // D. Descrição completa
    expect(screen.getByText(/Realizar backup completo e migração para nova máquina/)).toBeInTheDocument();
    expect(screen.getByText(/Linha 2 com detalhes adicionais/)).toBeInTheDocument();
  });

  it('não renderiza mais a seção legada de Comentários e Atividades, preservando o layout limpo', async () => {
    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    await screen.findByRole('heading', { name: 'Migração de Servidores e Banco de Dados' });

    // Seção Comentários e Atividades foi descontinuada em favor do Chat exclusivo
    expect(screen.queryByRole('region', { name: 'Comentários e Atividades' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Escreva seu comentário...')).not.toBeInTheDocument();
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

  it('criador original visualiza o menu "Mais ações" contendo "Editar tarefa" e "Cancelar tarefa"', async () => {
    auth.user = { id: 'admin-1', role: { code: 'ADMIN_MASTER' } };
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: mockTaskData('IN_PROGRESS') } }) };
      }
      return { ok: true, json: async () => ({ data: { users: [] } }) };
    });

    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    await screen.findByRole('dialog');

    // Menu "Mais ações" exibido para o criador original
    const moreActionsBtn = screen.getByRole('button', { name: 'Mais ações' });
    expect(moreActionsBtn).toBeInTheDocument();

    // Ao clicar em "Mais ações", revela "Editar tarefa" e "Cancelar tarefa"
    fireEvent.click(moreActionsBtn);
    expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar tarefa' })).toBeInTheDocument();
  });

  it('usuário que não criou a tarefa (mesmo gestor) NÃO visualiza os botões de edição e cancelamento nem o menu Mais ações', async () => {
    auth.user = { id: 'other-manager', role: { code: 'MANAGER' } };
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: mockTaskData('IN_PROGRESS') } }) };
      }
      return { ok: true, json: async () => ({ data: { users: [] } }) };
    });

    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    await screen.findByRole('dialog');

    expect(screen.queryByRole('button', { name: 'Mais ações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar tarefa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar tarefa' })).not.toBeInTheDocument();
  });

  it('clique em "Editar tarefa" abre pop-up com campos preenchidos e permite salvar ou fechar via Voltar', async () => {
    auth.user = { id: 'admin-1', role: { code: 'ADMIN_MASTER' } };
    auth.request.mockImplementation(async (path: string, options?: any) => {
      if (options?.method === 'PATCH') {
        return { ok: true, json: async () => ({ data: {} }) };
      }
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: mockTaskData('IN_PROGRESS') } }) };
      }
      return { ok: true, json: async () => ({ data: { users: [] } }) };
    });

    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    const moreActionsBtn = await screen.findByRole('button', { name: 'Mais ações' });
    fireEvent.click(moreActionsBtn);

    const editBtn = await screen.findByRole('button', { name: 'Editar tarefa' });
    fireEvent.click(editBtn);

    // Pop-up de edição abre sobre o modal
    const editModal = screen.getByRole('dialog', { name: 'Editar tarefa' });
    expect(editModal).toBeInTheDocument();

    const titleInput = screen.getByRole('textbox', { name: 'Título' });
    expect(titleInput).toHaveValue('Migração de Servidores e Banco de Dados');

    // 1. Testa botão "Voltar" (fecha sem enviar requisição PATCH)
    const voltarBtn = screen.getByRole('button', { name: 'Voltar' });
    fireEvent.click(voltarBtn);
    expect(screen.queryByRole('dialog', { name: 'Editar tarefa' })).not.toBeInTheDocument();

    // 2. Reabre e submete com justificativa
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar tarefa' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Justificativa da alteração' }), {
      target: { value: 'Alteração necessária do título e escopo' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Editar tarefa' })).not.toBeInTheDocument();
    });

    // Confirma envio via PATCH
    const patchCall = auth.request.mock.calls.find((call: any[]) => call[1]?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(patchCall[0]).toBe('/tasks/task-modal-1');
  });

  it('clique em "Cancelar tarefa" abre confirmação, exige justificativa válida e executa cancelamento', async () => {
    auth.user = { id: 'admin-1', role: { code: 'ADMIN_MASTER' } };
    auth.request.mockImplementation(async (path: string, options?: any) => {
      if (path.includes('/cancel')) {
        return { ok: true, json: async () => ({ data: {} }) };
      }
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: mockTaskData('IN_PROGRESS') } }) };
      }
      return { ok: true, json: async () => ({ data: { users: [] } }) };
    });

    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    const moreActionsBtn = await screen.findByRole('button', { name: 'Mais ações' });
    fireEvent.click(moreActionsBtn);

    const cancelBtn = await screen.findByRole('button', { name: 'Cancelar tarefa' });
    fireEvent.click(cancelBtn);

    // Pop-up de cancelamento abre com mensagem de confirmação
    const cancelModal = screen.getByRole('dialog', { name: 'Cancelar tarefa' });
    expect(cancelModal).toBeInTheDocument();
    expect(cancelModal).toHaveTextContent(/Tem certeza de que deseja cancelar a tarefa #101/);

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar cancelamento' });
    // Desabilitado enquanto a justificativa for menor que 5 caracteres
    expect(confirmBtn).toBeDisabled();

    // 1. Testa botão "Voltar" (fecha sem cancelar)
    const voltarBtn = screen.getByRole('button', { name: 'Voltar' });
    fireEvent.click(voltarBtn);
    expect(screen.queryByRole('dialog', { name: 'Cancelar tarefa' })).not.toBeInTheDocument();
    expect(auth.request).not.toHaveBeenCalledWith(expect.stringContaining('/cancel'), expect.anything());

    // 2. Reabre, digita justificativa válida (>= 5 caracteres) e confirma
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar tarefa' }));
    const reasonInput = screen.getByRole('textbox', { name: 'Justificativa do cancelamento' });
    fireEvent.change(reasonInput, { target: { value: 'Cancelamento formal por encerramento de projeto' } });

    expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Cancelar tarefa' })).not.toBeInTheDocument();
    });

    const cancelCall = auth.request.mock.calls.find((call: any[]) => call[0].includes('/cancel'));
    expect(cancelCall).toBeDefined();
    expect(JSON.parse(cancelCall[1].body).reason).toBe('Cancelamento formal por encerramento de projeto');
  });

  it('tarefa concluída (COMPLETED) não exibe botões de edição ou cancelamento mesmo para o criador', async () => {
    auth.user = { id: 'admin-1', role: { code: 'ADMIN_MASTER' } };
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: mockTaskData('COMPLETED') } }) };
      }
      return { ok: true, json: async () => ({ data: { users: [] } }) };
    });

    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);

    await screen.findByRole('dialog');

    expect(screen.queryByRole('button', { name: 'Editar tarefa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar tarefa' })).not.toBeInTheDocument();
  });

  it('diferencia encaminhamento inicial (sem responsável) de reatribuição (com responsável)', async () => {
    auth.user = { id: 'admin-1', role: { code: 'ADMIN_MASTER' } };
    const taskUnassigned = mockTaskData('PENDING');
    taskUnassigned.cycle.assignment = null as any;
    taskUnassigned.cycles[0].assignments = [];

    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: taskUnassigned } }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            users: [
              { id: 'user-tech', name: 'Técnico Responsável', isActive: true, role: { label: 'Técnico' } },
              { id: 'user-tech-2', name: 'Segundo Técnico', isActive: true, role: { label: 'Técnico' } },
            ],
          },
        }),
      };
    });

    const { rerender } = render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);
    await screen.findByRole('dialog');

    // Modo 1: Encaminhamento inicial (sem responsável ativo)
    const assignBtn = screen.getByRole('button', { name: 'Encaminhar tarefa' });
    expect(assignBtn).toBeInTheDocument();
    fireEvent.click(assignBtn);

    expect(screen.getByRole('heading', { name: 'Encaminhar tarefa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar encaminhamento' })).toBeInTheDocument();
    const reasonUnassigned = screen.getByPlaceholderText('Justificativa (opcional)');
    expect(reasonUnassigned).not.toBeRequired();

    // Modo 2: Reatribuição (com responsável já vinculado)
    const taskAssigned = mockTaskData('IN_PROGRESS', 'user-tech');
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: taskAssigned } }) };
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            users: [
              { id: 'user-tech', name: 'Técnico Responsável', isActive: true, role: { label: 'Técnico' } },
              { id: 'user-tech-2', name: 'Segundo Técnico', isActive: true, role: { label: 'Técnico' } },
            ],
          },
        }),
      };
    });

    cleanup();
    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);
    await screen.findByRole('dialog');

    const reassignBtn = screen.getByRole('button', { name: 'Reatribuir responsável' });
    expect(reassignBtn).toBeInTheDocument();
    fireEvent.click(reassignBtn);

    expect(screen.getByRole('heading', { name: 'Reatribuir responsável' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar reatribuição' })).toBeInTheDocument();
    const reasonAssigned = screen.getByPlaceholderText('Justificativa da reatribuição (obrigatória)');
    expect(reasonAssigned).toBeRequired();
  });

  it('expande e recolhe "Mais informações" mantendo a integridade dos dados', async () => {
    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);
    await screen.findByRole('dialog');

    // Inicialmente recolhido
    const toggleBtn = screen.getByRole('button', { name: 'Mais informações' });
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.queryByText('Duração de aceite')).not.toBeInTheDocument();

    // Expande
    fireEvent.click(toggleBtn);
    expect(screen.getByRole('button', { name: 'Menos informações' })).toBeInTheDocument();
    expect(screen.getByText('Duração de aceite')).toBeInTheDocument();
    expect(screen.getByText('120 minutos')).toBeInTheDocument();

    // Recolhe novamente
    fireEvent.click(screen.getByRole('button', { name: 'Menos informações' }));
    expect(screen.getByRole('button', { name: 'Mais informações' })).toBeInTheDocument();
    expect(screen.queryByText('Duração de aceite')).not.toBeInTheDocument();
  });

  it('exibe alertas compactos discretos de atraso de aceite e de execução', async () => {
    // 1. Atraso de aceite
    const overdueAcceptance = mockTaskData('AWAITING_ACCEPTANCE');
    overdueAcceptance.cycle.overdue = true;

    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: overdueAcceptance } }) };
      }
      return { ok: true, json: async () => ({ data: { users: [] } }) };
    });

    const { rerender } = render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);
    await screen.findByRole('dialog');
    expect(screen.getByText('Prazo de aceite vencido')).toBeInTheDocument();

    // 2. Atraso de execução
    const overdueExecution = mockTaskData('IN_PROGRESS');
    overdueExecution.cycle.overdue = true;

    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: overdueExecution } }) };
      }
      return { ok: true, json: async () => ({ data: { users: [] } }) };
    });

    cleanup();
    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);
    await screen.findByRole('dialog');
    expect(screen.getByText('Prazo de execução vencido')).toBeInTheDocument();
  });

  it('pop-up de encaminhamento inicial fecha por Escape e botão Voltar sem fechar o modal principal', async () => {
    auth.user = { id: 'admin-1', role: { code: 'ADMIN_MASTER' } };
    const taskUnassigned = mockTaskData('PENDING');
    taskUnassigned.cycle.assignment = null as any;
    taskUnassigned.cycles[0].assignments = [];

    const handleClose = vi.fn();

    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: taskUnassigned } }) };
      }
      return { ok: true, json: async () => ({ data: { users: [] } }) };
    });

    render(<TaskDetailModal taskId="task-modal-1" onClose={handleClose} />);
    await screen.findByRole('dialog');

    // Abre pop-up
    fireEvent.click(screen.getByRole('button', { name: 'Encaminhar tarefa' }));
    expect(screen.getByRole('heading', { name: 'Encaminhar tarefa' })).toBeInTheDocument();

    // Pressiona Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Encaminhar tarefa' })).not.toBeInTheDocument();
    // Modal principal NÃO deve ter fechado!
    expect(handleClose).not.toHaveBeenCalled();

    // Reabre e testa o botão Voltar
    fireEvent.click(screen.getByRole('button', { name: 'Encaminhar tarefa' }));
    expect(screen.getByRole('heading', { name: 'Encaminhar tarefa' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByRole('heading', { name: 'Encaminhar tarefa' })).not.toBeInTheDocument();
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('permite expandir e recolher descrição longa com "Ver mais" e "Ver menos"', async () => {
    const longDescTask = mockTaskData('IN_PROGRESS');
    longDescTask.cycle.description =
      'Esta é uma descrição intencionalmente longa para testar o recurso de visualização resumida com opção Ver mais e Ver menos.\n'.repeat(5);

    auth.request.mockImplementation(async (path: string) => {
      if (path === '/tasks/task-modal-1') {
        return { ok: true, json: async () => ({ data: { task: longDescTask } }) };
      }
      return { ok: true, json: async () => ({ data: { users: [] } }) };
    });

    render(<TaskDetailModal taskId="task-modal-1" onClose={() => {}} />);
    await screen.findByRole('dialog');

    const verMaisBtn = screen.getByRole('button', { name: 'Ver mais' });
    expect(verMaisBtn).toBeInTheDocument();

    fireEvent.click(verMaisBtn);
    expect(screen.getByRole('button', { name: 'Ver menos' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
    expect(screen.getByRole('button', { name: 'Ver mais' })).toBeInTheDocument();
  });
});

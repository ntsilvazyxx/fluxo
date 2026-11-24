import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KanbanPage } from './KanbanPage.tsx';

const auth = vi.hoisted(() => ({ request: vi.fn(), user: null as any, features: { adminTaskCreation: false } }));
vi.mock('../auth/AuthContext.tsx', () => ({ useAuth: () => auth }));

const task = (id: string, title: string, status = 'AWAITING_ACCEPTANCE', userId = 'self') => ({
  id,
  publicNumber: id,
  team: { name: 'Equipe autorizada' },
  cycle: {
    title,
    status,
    priority: 'NORMAL',
    deadlineAt: '2027-01-04T12:00:00Z',
    assignment: { userId, user: { name: 'Responsável de teste' } },
  },
});

const response = (tasks: any[], page = 1, total = tasks.length) => ({
  ok: true,
  json: async () => ({
    data: { tasks },
    meta: { page, pageSize: 100, total, totalPages: Math.ceil(total / 100) },
  }),
});

const open = (entry = '/kanban') => render(
  <MemoryRouter initialEntries={[entry]}>
    <KanbanPage />
  </MemoryRouter>,
);

afterEach(cleanup);

beforeEach(() => {
  auth.user = { id: 'self', role: { code: 'MANAGER' } };
  auth.features = { adminTaskCreation: false };
  auth.request.mockReset().mockImplementation(async (path: string) => {
    if (path.startsWith('/my-tasks')) {
      return response([
        task('1', 'Entrega pessoal', 'AWAITING_ACCEPTANCE', 'self'),
        task('2', 'Entrega concluída', 'COMPLETED', 'self'),
      ]);
    }
    if (path.startsWith('/kanban')) {
      return response([
        task('1', 'Entrega pessoal', 'AWAITING_ACCEPTANCE', 'self'),
        task('3', 'Entrega da equipe', 'IN_PROGRESS', 'other'),
      ]);
    }
    if (path.startsWith('/task-history')) {
      return response([
        task('2', 'Entrega concluída', 'COMPLETED', 'self'),
      ]);
    }
    return {
      ok: true,
      json: async () => ({
        data: {
          teams: [{ id: 'team', name: 'Equipe autorizada' }],
          users: [{ id: 'self', name: 'Responsável de teste' }],
        },
      }),
    };
  });
});

describe('Kanban Padronizado (Fase 2)', () => {
  it('Gestor visualiza exatamente as 3 colunas oficiais lado a lado, sem área de Pendentes de atribuição', async () => {
    open();
    await screen.findByRole('heading', { name: 'Entrega pessoal' });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual([
      'Aguardando aceite',
      'Em andamento',
      'Finalizado',
    ]);

    // Três colunas oficiais lado a lado
    expect(screen.getByRole('region', { name: 'Colunas do Kanban' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aguardando aceite' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Em andamento' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finalizado' })).toBeInTheDocument();

    // Sem área ou indicador de Pendentes de atribuição
    expect(screen.queryByRole('region', { name: 'Tarefas pendentes de atribuição' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pendentes de atribuição/i)).not.toBeInTheDocument();

    // Deduplicação: tarefa pessoal #1 aparece uma única vez
    const taskLinks = screen.getAllByRole('link', { name: 'Abrir tarefa #1: Entrega pessoal' });
    expect(taskLinks).toHaveLength(1);
  });

  it('TECHNICIAN consulta suas tarefas nas 3 colunas oficiais e não recebe controles gerenciais', async () => {
    auth.user = { id: 'self', role: { code: 'TECHNICIAN' } };
    open('/kanban');

    await screen.findByRole('heading', { name: 'Entrega pessoal' });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual([
      'Aguardando aceite',
      'Em andamento',
      'Finalizado',
    ]);

    // Não deve exibir área de Pendentes de atribuição para técnico
    expect(screen.queryByRole('region', { name: 'Tarefas pendentes de atribuição' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pendentes de atribuição/i)).not.toBeInTheDocument();

    // Controles gerenciais ausentes
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(screen.queryByRole('combobox', { name: 'Equipe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Responsável' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova tarefa' })).not.toBeInTheDocument();

    // Técnico consome tarefas exclusivamente de /my-tasks (sem acessar endpoints gerenciais como /kanban)
    expect(auth.request.mock.calls.some(([path]) => path.startsWith('/kanban'))).toBe(false);
    expect(auth.request.mock.calls.some(([path]) => path.startsWith('/teams'))).toBe(false);
    expect(auth.request.mock.calls.some(([path]) => path.startsWith('/users'))).toBe(false);
    expect(
      auth.request.mock.calls
        .filter(([path]) => !path.startsWith('/user-preferences'))
        .every(([path]) => path.startsWith('/my-tasks?')),
    ).toBe(true);
  });

  it('TECHNICIAN no Kanban visualiza título padronizado e escopo de responsabilidade direta', async () => {
    auth.user = { id: 'self', role: { code: 'TECHNICIAN' } };
    open('/kanban');

    await screen.findByRole('heading', { name: 'Kanban de tarefas' });
    expect(screen.getByText('Tarefas e entregas autorizadas organizadas por fluxo de execução.')).toBeInTheDocument();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual([
      'Aguardando aceite',
      'Em andamento',
      'Finalizado',
    ]);
  });

  it('ADMIN_MASTER possui visão gerencial, 3 colunas e não cria tarefa por padrão', async () => {
    auth.user = { id: 'self', role: { code: 'ADMIN_MASTER' } };
    open();

    await screen.findByRole('heading', { name: 'Entrega pessoal' });

    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual([
      'Aguardando aceite',
      'Em andamento',
      'Finalizado',
    ]);

    expect(screen.queryByText(/Pendentes de atribuição/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(screen.getByRole('combobox', { name: 'Equipe' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova tarefa' })).not.toBeInTheDocument();
    expect(auth.request.mock.calls.some(([path]) => path.startsWith('/kanban?'))).toBe(true);
  });

  it('ADMIN_MASTER acessa a criação de tarefa somente com o recurso não produtivo habilitado', async () => {
    auth.user = { id: 'self', role: { code: 'ADMIN_MASTER' } };
    auth.features = { adminTaskCreation: true };
    open();

    await screen.findByRole('heading', { name: 'Entrega pessoal' });
    expect(screen.getByRole('link', { name: 'Nova tarefa' })).toBeInTheDocument();
  });

  it('filtros avançados são recolhidos, controlados e limpos nas consultas', async () => {
    open();
    await screen.findByRole('heading', { name: 'Entrega pessoal' });

    expect(screen.queryByRole('combobox', { name: 'Prioridade' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    await screen.findByRole('option', { name: 'Equipe autorizada' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Equipe' }), { target: { value: 'team' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Prioridade' }), { target: { value: 'HIGH' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar tarefas' }), { target: { value: 'Entrega' } });

    await waitFor(() => {
      expect(
        auth.request.mock.calls.some(
          ([path]) => path.startsWith('/kanban?') && path.includes('teamId=team') && path.includes('priority=HIGH') && path.includes('search=Entrega'),
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByRole('textbox', { name: 'Buscar tarefas' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Equipe' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Prioridade' })).toHaveValue('');
  });

  it('paginação e links preservam filtros', async () => {
    auth.request.mockImplementation(async (path: string) => {
      const page = Number(new URLSearchParams(path.split('?')[1]).get('page') ?? '1');
      return response([task('1', 'Entrega paginada')], page, 201);
    });

    open('/kanban?priority=HIGH');
    await screen.findAllByRole('heading', { name: 'Entrega paginada' });
    expect(screen.getAllByRole('link', { name: 'Abrir tarefa #1: Entrega paginada' })[0]).toHaveAttribute('href', '/kanban/tarefas/1?priority=HIGH');

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página: Fluxo das equipes' }));
    await waitFor(() => {
      expect(
        within(screen.getByRole('navigation', { name: 'Paginação: Fluxo das equipes' })).getByText(/página 2 de 3/),
      ).toBeInTheDocument();
    });
  });

  it('resposta lenta de busca anterior não substitui o resultado atual', async () => {
    let finish: any;
    auth.user = { id: 'self', role: { code: 'TECHNICIAN' } };
    auth.request.mockImplementation(async (path: string) => {
      if (path.includes('search=antiga')) {
        return new Promise((resolve) => { finish = resolve; });
      }
      return response([task('9', path.includes('search=nova') ? 'Resultado novo' : 'Inicial')]);
    });

    open('/kanban');
    await screen.findByRole('heading', { name: 'Inicial' });

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar tarefas' }), { target: { value: 'antiga' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar tarefas' }), { target: { value: 'nova' } });

    await screen.findByRole('heading', { name: 'Resultado novo' });
    finish(response([task('8', 'Resultado obsoleto')]));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Resultado obsoleto' })).not.toBeInTheDocument();
    });
  });

  it('Gestor com busca ativa localiza tarefa PENDING de forma discreta com link para detalhes e 3 colunas preservadas', async () => {
    auth.user = { id: 'self', role: { code: 'MANAGER' } };
    auth.request.mockImplementation(async (path: string) => {
      if (path.startsWith('/kanban') && path.includes('search=Rejeitada')) {
        return response([
          task('10', 'Tarefa rejeitada aguardando novo técnico', 'PENDING'),
          task('11', 'Tarefa em execução', 'IN_PROGRESS'),
        ]);
      }
      return response([]);
    });

    open('/kanban?search=Rejeitada');
    await screen.findByRole('heading', { name: 'Tarefa em execução' });

    // Seção discreta de busca para PENDING é renderizada
    const pendingSection = screen.getByRole('region', { name: 'Tarefas pendentes encontradas na busca' });
    expect(pendingSection).toBeInTheDocument();
    expect(within(pendingSection).getByText(/1 tarefa pendente de atribuição encontrada nesta busca:/i)).toBeInTheDocument();

    // Link clicável para abrir detalhes e reatribuir
    const pendingLink = within(pendingSection).getByRole('link', {
      name: 'Abrir tarefa pendente #10: Tarefa rejeitada aguardando novo técnico',
    });
    expect(pendingLink).toBeInTheDocument();
    expect(pendingLink).toHaveAttribute('href', '/kanban/tarefas/10?search=Rejeitada');

    // Preservação estrita das 3 colunas
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual([
      'Aguardando aceite',
      'Em andamento',
      'Finalizado',
    ]);
  });

  it('sem busca ativa, tarefas PENDING não são exibidas e seção discreta não é renderizada', async () => {
    auth.user = { id: 'self', role: { code: 'MANAGER' } };
    auth.request.mockImplementation(async (path: string) => {
      if (path.startsWith('/kanban')) {
        return response([
          task('10', 'Tarefa rejeitada', 'PENDING'),
          task('11', 'Tarefa em execução', 'IN_PROGRESS'),
        ]);
      }
      return response([]);
    });

    open('/kanban');
    await screen.findByRole('heading', { name: 'Tarefa em execução' });

    // Sem busca ativa, não deve haver área ou seção para tarefas pendentes
    expect(screen.queryByRole('region', { name: 'Tarefas pendentes encontradas na busca' })).not.toBeInTheDocument();
    expect(screen.queryByText(/pendente de atribuição encontrada nesta busca/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tarefa rejeitada/i })).not.toBeInTheDocument();

    // As 3 colunas continuam normais
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual([
      'Aguardando aceite',
      'Em andamento',
      'Finalizado',
    ]);
  });

  it('TECHNICIAN não visualiza tarefas PENDING na busca e não recebe seção gerencial', async () => {
    auth.user = { id: 'self', role: { code: 'TECHNICIAN' } };
    auth.request.mockImplementation(async (path: string) => {
      if (path.startsWith('/my-tasks')) {
        return response([
          task('1', 'Minha tarefa técnica', 'IN_PROGRESS', 'self'),
        ]);
      }
      return response([]);
    });

    open('/kanban?search=Minha');
    await screen.findByRole('heading', { name: 'Minha tarefa técnica' });

    // Técnico nunca recebe seção de tarefas pendentes na busca
    expect(screen.queryByRole('region', { name: 'Tarefas pendentes encontradas na busca' })).not.toBeInTheDocument();
    expect(screen.queryByText(/pendente de atribuição/i)).not.toBeInTheDocument();
  });

  it('busca com resultados paginados preserva paginação e parâmetros de URL', async () => {
    auth.user = { id: 'self', role: { code: 'SECRETARY' } };
    auth.request.mockImplementation(async (path: string) => {
      const page = Number(new URLSearchParams(path.split('?')[1]).get('page') ?? '1');
      if (path.startsWith('/kanban')) {
        return response([
          task('20', 'Tarefa pendente na busca', 'PENDING'),
          task('21', 'Tarefa ativa página 1', 'IN_PROGRESS'),
        ], page, 250);
      }
      return response([]);
    });

    open('/kanban?search=Tarefa&priority=HIGH');
    await screen.findByRole('heading', { name: 'Tarefa ativa página 1' });

    // Link da tarefa pendente preserva todos os filtros da URL
    const pendingLink = screen.getByRole('link', {
      name: 'Abrir tarefa pendente #20: Tarefa pendente na busca',
    });
    expect(pendingLink).toHaveAttribute('href', '/kanban/tarefas/20?search=Tarefa&priority=HIGH');

    // Paginação presente e operacional
    expect(screen.getByRole('navigation', { name: 'Paginação: Fluxo das equipes' })).toBeInTheDocument();
  });
});

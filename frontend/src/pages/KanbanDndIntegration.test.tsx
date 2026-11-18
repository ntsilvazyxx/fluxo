import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { KanbanPage } from './KanbanPage.tsx';

let capturedOnDragEnd: any = null;

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<any>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ children, onDragEnd, ...props }: any) => {
      capturedOnDragEnd = onDragEnd;
      const ActualDndContext = actual.DndContext;
      return (
        <ActualDndContext onDragEnd={onDragEnd} {...props}>
          {children}
        </ActualDndContext>
      );
    },
  };
});

const auth = vi.hoisted(() => ({
  request: vi.fn(),
  user: null as any,
  features: { adminTaskCreation: false },
}));
vi.mock('../auth/AuthContext.tsx', () => ({ useAuth: () => auth }));

vi.mock('../tasks/TaskDetailModal.tsx', () => ({
  TaskDetailModal: ({ taskId, onClose }: any) => (
    <div role="dialog" aria-label="Modal de Detalhes Mock">
      <span>Detalhes da tarefa {taskId}</span>
      <button onClick={onClose}>Fechar</button>
    </div>
  ),
}));

const makeTask = (
  id: string,
  publicNumber: number,
  title: string,
  status = 'AWAITING_ACCEPTANCE',
  userId = 'user-1',
  userName = 'Maria Souza',
) => ({
  id,
  publicNumber,
  team: { id: 'team-1', name: 'Equipe de Gestão' },
  cycle: {
    id: `cycle-${id}`,
    version: 1,
    title,
    status,
    priority: 'NORMAL',
    deadlineAt: '2026-11-20T12:00:00Z',
    assignment: { id: `assign-${id}`, userId, user: { id: userId, name: userName } },
  },
});

const mockApiResponse = (tasks: any[]) => ({
  ok: true,
  json: async () => ({
    data: { tasks },
    meta: { page: 1, pageSize: 100, total: tasks.length, totalPages: 1 },
  }),
});

const renderKanban = (route = '/kanban') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <KanbanPage />
    </MemoryRouter>,
  );

describe('Kanban Drag and Drop - Integração Completa', () => {
  afterEach(cleanup);

  beforeEach(() => {
    capturedOnDragEnd = null;
    auth.user = { id: 'user-1', name: 'Maria Souza', role: { code: 'MANAGER' } };
    auth.features = { adminTaskCreation: false };
    auth.request.mockReset().mockImplementation(async (path: string) => {
      if (path.startsWith('/my-tasks') || path.startsWith('/kanban') || path.startsWith('/task-history')) {
        return mockApiResponse([
          makeTask('task-1', 101, 'Tarefa Aguardando Aceite', 'AWAITING_ACCEPTANCE', 'user-1', 'Maria Souza'),
          makeTask('task-2', 102, 'Tarefa Em Andamento', 'IN_PROGRESS', 'user-1', 'Maria Souza'),
          makeTask('task-3', 103, 'Tarefa Concluída', 'COMPLETED', 'user-1', 'Maria Souza'),
          makeTask('task-4', 104, 'Tarefa de Outro Usuário', 'AWAITING_ACCEPTANCE', 'user-other', 'João Silva'),
        ]);
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            teams: [{ id: 'team-1', name: 'Equipe de Gestão' }],
            users: [
              { id: 'user-1', name: 'Maria Souza' },
              { id: 'user-other', name: 'João Silva' },
            ],
          },
        }),
      };
    });
  });

  describe('1. Interface e Preservação de Cliques', () => {
    it('renderiza alça de arraste (drag handle GripVertical) acessível em cada cartão', async () => {
      renderKanban();

      const handle1 = await screen.findByRole('button', { name: 'Arrastar tarefa #101' });
      const handle2 = screen.getByRole('button', { name: 'Arrastar tarefa #102' });
      const handle3 = screen.getByRole('button', { name: 'Arrastar tarefa #103' });

      expect(handle1).toBeInTheDocument();
      expect(handle2).toBeInTheDocument();
      expect(handle3).toBeInTheDocument();
      expect(handle1).toHaveClass('cursor-grab');
      expect(handle1).toHaveClass('touch-none');
    });

    it('clique no corpo do cartão continua abrindo o modal de detalhes', async () => {
      renderKanban();

      const cardLink = await screen.findByRole('link', { name: /Abrir tarefa #101/i });
      fireEvent.click(cardLink);

      expect(await screen.findByRole('dialog', { name: 'Modal de Detalhes Mock' })).toBeInTheDocument();
      expect(screen.getByText('Detalhes da tarefa task-1')).toBeInTheDocument();
    });

    it('clique no botão de paleta de cores abre a paleta sem abrir modal ou acionar arraste', async () => {
      renderKanban();

      const paletteBtn = await screen.findByRole('button', {
        name: 'Personalizar cor da tarefa #101',
      });
      fireEvent.click(paletteBtn);

      expect(screen.getByRole('button', { name: 'Selecionar cor Azul' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Modal de Detalhes Mock' })).not.toBeInTheDocument();
    });

    it('clique no menu de 3 pontinhos abre o resumo compacto sem abrir o modal completo', async () => {
      renderKanban();

      const summaryToggle = await screen.findByLabelText('Ações da tarefa #101');
      fireEvent.click(summaryToggle);

      const summaryBtns = await screen.findAllByRole('button', { name: 'Resumo da tarefa' });
      expect(summaryBtns.length).toBeGreaterThan(0);
      expect(summaryBtns[0]).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Modal de Detalhes Mock' })).not.toBeInTheDocument();
    });
  });

  describe('2. Transição: Aguardando aceite -> Em andamento (Aceite Oficial)', () => {
    it('executa POST /assignments/:id/accept quando o usuário autenticado é o responsável', async () => {
      let acceptCalled = false;
      auth.request.mockImplementation(async (path: string, options?: any) => {
        if (path === '/assignments/assign-task-1/accept' && options?.method === 'POST') {
          acceptCalled = true;
          return { ok: true, json: async () => ({ data: { success: true } }) };
        }
        if (path.startsWith('/my-tasks') || path.startsWith('/kanban') || path.startsWith('/task-history')) {
          return mockApiResponse([
            makeTask('task-1', 101, 'Tarefa Aguardando Aceite', 'AWAITING_ACCEPTANCE', 'user-1', 'Maria Souza'),
          ]);
        }
        return { ok: true, json: async () => ({}) };
      });

      renderKanban();
      await screen.findByRole('button', { name: 'Arrastar tarefa #101' });

      expect(capturedOnDragEnd).not.toBeNull();
      await act(async () => {
        await capturedOnDragEnd({
          active: { id: 'task-1' },
          over: { id: 'IN_PROGRESS' },
        });
      });

      expect(acceptCalled).toBe(true);
      expect(await screen.findByText(/Tarefa #101 aceita com sucesso!/i)).toBeInTheDocument();
    });

    it('bloqueia o aceite via drag and drop quando o usuário NÃO é o responsável', async () => {
      let acceptCalled = false;
      auth.request.mockImplementation(async (path: string, options?: any) => {
        if (path.includes('/accept')) {
          acceptCalled = true;
        }
        if (path.startsWith('/my-tasks') || path.startsWith('/kanban') || path.startsWith('/task-history')) {
          return mockApiResponse([
            makeTask('task-4', 104, 'Tarefa de Outro Usuário', 'AWAITING_ACCEPTANCE', 'user-other', 'João Silva'),
          ]);
        }
        return { ok: true, json: async () => ({}) };
      });

      renderKanban();
      await screen.findByRole('button', { name: 'Arrastar tarefa #104' });

      await act(async () => {
        await capturedOnDragEnd({
          active: { id: 'task-4' },
          over: { id: 'IN_PROGRESS' },
        });
      });

      expect(acceptCalled).toBe(false);
      expect(
        await screen.findByText(/Somente o responsável designado \(João Silva\) pode aceitar a tarefa/i),
      ).toBeInTheDocument();
    });
  });

  describe('3. Transição: Em andamento -> Finalizado (Conclusão via Pop-up)', () => {
    it('abre o pop-up de conclusão e NÃO conclui automaticamente no drop', async () => {
      renderKanban();
      await screen.findByRole('button', { name: 'Arrastar tarefa #102' });

      await act(async () => {
        await capturedOnDragEnd({
          active: { id: 'task-2' },
          over: { id: 'COMPLETED' },
        });
      });

      // Abre pop-up de conclusão
      expect(await screen.findByRole('heading', { name: 'Concluir tarefa #102' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Confirmação de execução de todas as etapas/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Resultado da execução/i)).toBeInTheDocument();

      // Botão de confirmação está desabilitado antes de preencher checklist e texto
      const confirmBtn = screen.getByRole('button', { name: /Confirmar conclusão/i });
      expect(confirmBtn).toBeDisabled();
    });

    it('permite cancelar o pop-up de conclusão sem alterar o estado da tarefa', async () => {
      renderKanban();
      await screen.findByRole('button', { name: 'Arrastar tarefa #102' });

      await act(async () => {
        await capturedOnDragEnd({
          active: { id: 'task-2' },
          over: { id: 'COMPLETED' },
        });
      });

      const cancelBtn = await screen.findByRole('button', { name: 'Cancelar' });
      fireEvent.click(cancelBtn);

      expect(screen.queryByRole('heading', { name: 'Concluir tarefa #102' })).not.toBeInTheDocument();
    });

    it('ao preencher checklist e texto de conclusão (mínimo 10 caracteres), executa POST /tasks/:id/complete', async () => {
      let completePayload: any = null;
      auth.request.mockImplementation(async (path: string, options?: any) => {
        if (path === '/tasks/task-2/complete' && options?.method === 'POST') {
          completePayload = JSON.parse(options.body);
          return { ok: true, json: async () => ({ data: { success: true } }) };
        }
        if (path.startsWith('/my-tasks') || path.startsWith('/kanban') || path.startsWith('/task-history')) {
          return mockApiResponse([
            makeTask('task-2', 102, 'Tarefa Em Andamento', 'IN_PROGRESS', 'user-1', 'Maria Souza'),
          ]);
        }
        return { ok: true, json: async () => ({}) };
      });

      renderKanban();
      await screen.findByRole('button', { name: 'Arrastar tarefa #102' });

      await act(async () => {
        await capturedOnDragEnd({
          active: { id: 'task-2' },
          over: { id: 'COMPLETED' },
        });
      });

      await screen.findByRole('heading', { name: 'Concluir tarefa #102' });

      // Marca o checklist
      fireEvent.click(screen.getByRole('checkbox', { name: /Confirmação de execução de todas as etapas/i }));

      // Preenche o resultado com >= 10 caracteres
      fireEvent.change(screen.getByLabelText(/Resultado da execução/i), {
        target: { value: 'Parecer técnico finalizado e protocolado com sucesso.' },
      });

      const confirmBtn = screen.getByRole('button', { name: /Confirmar conclusão/i });
      expect(confirmBtn).not.toBeDisabled();
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(completePayload).not.toBeNull());
      expect(completePayload.completionText).toBe('Parecer técnico finalizado e protocolado com sucesso.');
    });

    it('impede conclusão se o usuário não for o responsável da tarefa', async () => {
      auth.user = { id: 'user-another', name: 'Outro Usuário', role: { code: 'MANAGER' } };
      renderKanban();
      await screen.findByRole('button', { name: 'Arrastar tarefa #102' });

      await act(async () => {
        await capturedOnDragEnd({
          active: { id: 'task-2' },
          over: { id: 'COMPLETED' },
        });
      });

      expect(screen.queryByRole('heading', { name: 'Concluir tarefa #102' })).not.toBeInTheDocument();
      expect(await screen.findByText(/Somente o responsável atual pode concluir a tarefa/i)).toBeInTheDocument();
    });
  });

  describe('4. Transição: Finalizado -> Em andamento (Reabertura Formal)', () => {
    it('gestor abre pop-up de reabertura com justificativa obrigatória e executa POST /tasks/:id/reopen', async () => {
      let reopenPayload: any = null;
      auth.request.mockImplementation(async (path: string, options?: any) => {
        if (path === '/tasks/task-3/reopen' && options?.method === 'POST') {
          reopenPayload = JSON.parse(options.body);
          return { ok: true, json: async () => ({ data: { success: true } }) };
        }
        if (path.startsWith('/my-tasks') || path.startsWith('/kanban') || path.startsWith('/task-history')) {
          return mockApiResponse([
            makeTask('task-3', 103, 'Tarefa Concluída', 'COMPLETED', 'user-1', 'Maria Souza'),
          ]);
        }
        return { ok: true, json: async () => ({}) };
      });

      renderKanban();
      await screen.findByRole('button', { name: 'Arrastar tarefa #103' });

      await act(async () => {
        await capturedOnDragEnd({
          active: { id: 'task-3' },
          over: { id: 'IN_PROGRESS' },
        });
      });

      expect(await screen.findByRole('heading', { name: 'Reabrir tarefa #103' })).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /Confirmar reabertura/i });
      expect(confirmBtn).toBeDisabled();

      fireEvent.change(screen.getByLabelText(/Justificativa da reabertura/i), {
        target: { value: 'Necessário complementar informações com novo ofício' },
      });

      expect(confirmBtn).not.toBeDisabled();
      fireEvent.click(confirmBtn);

      await waitFor(() => expect(reopenPayload).not.toBeNull());
      expect(reopenPayload.reason).toBe('Necessário complementar informações com novo ofício');
      expect(reopenPayload.expectedVersion).toBe(1);
    });

    it('técnico é impedido de reabrir tarefas finalizadas via drag and drop', async () => {
      auth.user = { id: 'user-tech', name: 'Técnico Operacional', role: { code: 'TECHNICIAN' } };
      renderKanban();
      await screen.findByRole('button', { name: 'Arrastar tarefa #103' });

      await act(async () => {
        await capturedOnDragEnd({
          active: { id: 'task-3' },
          over: { id: 'IN_PROGRESS' },
        });
      });

      expect(screen.queryByRole('heading', { name: 'Reabrir tarefa #103' })).not.toBeInTheDocument();
      expect(
        await screen.findByText(/Somente gestores ou secretários podem solicitar reabertura de tarefas concluídas/i),
      ).toBeInTheDocument();
    });
  });

  describe('5. Transições Inválidas', () => {
    it('bloqueia transições não autorizadas com toast de alerta discreto', async () => {
      renderKanban();
      await screen.findByRole('button', { name: 'Arrastar tarefa #101' });

      // Tenta arrastar direto de Aguardando Aceite para Finalizado
      await act(async () => {
        await capturedOnDragEnd({
          active: { id: 'task-1' },
          over: { id: 'COMPLETED' },
        });
      });

      expect(
        await screen.findByText(/Esta movimentação não é permitida no fluxo do Kanban/i),
      ).toBeInTheDocument();
    });
  });
});

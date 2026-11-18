import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCreateModal } from './TaskCreateModal.tsx';
import { TaskDetailModal } from './TaskDetailModal.tsx';

const auth = vi.hoisted(() => ({
  request: vi.fn(),
  upload: vi.fn(),
  user: { id: 'user-1', name: 'Maria Souza', role: { code: 'MANAGER' } } as any,
  features: { adminTaskCreation: true },
}));

vi.mock('../auth/AuthContext.tsx', () => ({
  useAuth: () => auth,
}));

vi.mock('./ImageGalleryPanel.tsx', () => ({
  ImageGalleryPanel: () => <div data-testid="image-gallery-mock">Galeria Mock</div>,
}));

describe('SIGADOC - Integração no Frontend', () => {
  afterEach(cleanup);

  beforeEach(() => {
    auth.request.mockReset();
    auth.upload.mockReset();
    auth.request.mockImplementation(async (url: string) => {
      if (url === '/teams') {
        return {
          ok: true,
          json: async () => ({
            data: { teams: [{ id: 'team-1', name: 'Equipe de Gestão', isActive: true }] },
          }),
        };
      }
      if (url === '/users') {
        return {
          ok: true,
          json: async () => ({
            data: {
              users: [
                {
                  id: 'user-1',
                  name: 'Maria Souza',
                  isActive: true,
                  role: { code: 'MANAGER', label: 'Gestor' },
                },
              ],
            },
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  describe('Criação de tarefa com SIGADOC', () => {
    it('1. checkbox inicia desmarcado e campos do SIGADOC permanecem ocultos', async () => {
      render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);

      const checkbox = await screen.findByRole('checkbox', { name: /Vincular processo do SIGADOC/i });
      expect(checkbox).not.toBeChecked();
      expect(screen.queryByLabelText(/Número do processo SIGADOC/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Link do processo SIGADOC/i)).not.toBeInTheDocument();
    });

    it('2. ao marcar o checkbox, exibe campos e exige preenchimento obrigatório', async () => {
      render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);

      const checkbox = await screen.findByRole('checkbox', { name: /Vincular processo do SIGADOC/i });
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      const numInput = screen.getByLabelText(/Número do processo SIGADOC/i);
      const linkInput = screen.getByLabelText(/Link do processo SIGADOC/i);

      expect(numInput).toBeInTheDocument();
      expect(linkInput).toBeInTheDocument();
      expect(numInput).toHaveAttribute('required');
      expect(linkInput).toHaveAttribute('required');
    });

    it('3. envia dados do SIGADOC no payload quando marcado e preenchido', async () => {
      let sentBody: any = null;
      auth.request.mockImplementation(async (url: string, options?: any) => {
        if (url === '/teams') {
          return {
            ok: true,
            json: async () => ({
              data: { teams: [{ id: 'team-1', name: 'Equipe de Gestão', isActive: true }] },
            }),
          };
        }
        if (url === '/users') {
          return {
            ok: true,
            json: async () => ({
              data: {
                users: [{ id: 'user-1', name: 'Maria Souza', isActive: true, role: { code: 'MANAGER', label: 'Gestor' } }],
              },
            }),
          };
        }
        if (url === '/tasks' && options?.method === 'POST') {
          sentBody = JSON.parse(options.body);
          return {
            ok: true,
            json: async () => ({
              data: { task: { id: 'task-new', publicNumber: 501 } },
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);

      await screen.findByRole('option', { name: 'Equipe de Gestão' });

      fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Elaborar parecer' } });
      fireEvent.change(screen.getByLabelText('Descrição'), {
        target: { value: 'Parecer técnico para o processo' },
      });
      fireEvent.change(screen.getByLabelText('Equipe'), { target: { value: 'team-1' } });
      fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: 'user-1' } });

      // Marca o SIGADOC
      fireEvent.click(screen.getByRole('checkbox', { name: /Vincular processo do SIGADOC/i }));
      fireEvent.change(screen.getByLabelText(/Número do processo SIGADOC/i), {
        target: { value: '123456/2026' },
      });
      fireEvent.change(screen.getByLabelText(/Link do processo SIGADOC/i), {
        target: { value: 'https://sigadoc.mt.gov.br/processo/123456' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

      await waitFor(() => expect(sentBody).not.toBeNull());
      expect(sentBody.sigadocProcessNumber).toBe('123456/2026');
      expect(sentBody.sigadocProcessLink).toBe('https://sigadoc.mt.gov.br/processo/123456');
    });

    it('4. rejeita link sem protocolo HTTP ou HTTPS no frontend', async () => {
      render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);

      await screen.findByRole('option', { name: 'Equipe de Gestão' });
      fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Tarefa Teste' } });
      fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Descrição teste' } });
      fireEvent.change(screen.getByLabelText('Equipe'), { target: { value: 'team-1' } });
      fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: 'user-1' } });

      fireEvent.click(screen.getByRole('checkbox', { name: /Vincular processo do SIGADOC/i }));
      fireEvent.change(screen.getByLabelText(/Número do processo SIGADOC/i), {
        target: { value: '123456/2026' },
      });
      fireEvent.change(screen.getByLabelText(/Link do processo SIGADOC/i), {
        target: { value: 'javascript:alert(1)' },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

      expect(
        await screen.findByText(/O link do processo SIGADOC deve ser uma URL válida com protocolo HTTP ou HTTPS/i),
      ).toBeInTheDocument();
    });
  });

  describe('Visualização e Edição nos Detalhes da Tarefa', () => {
    const mockTask = (hasSigadoc = true) => ({
      id: 'task-100',
      publicNumber: 100,
      createdById: 'user-1',
      createdBy: { id: 'user-1', name: 'Maria Souza' },
      team: { id: 'team-1', name: 'Equipe de Gestão' },
      sigadocProcessNumber: hasSigadoc ? '987654/2026' : null,
      sigadocProcessLink: hasSigadoc ? 'https://sigadoc.mt.gov.br/proc/987654' : null,
      createdAt: '2026-11-18T10:00:00Z',
      cycle: {
        id: 'cycle-100',
        cycleNumber: 1,
        title: 'Tarefa com processo',
        description: 'Descrição da tarefa vinculada',
        priority: 'NORMAL',
        status: 'IN_PROGRESS',
        deadlinePolicy: 'RUNNING_CLOCK',
        acceptanceDurationMinutes: 120,
        executionDurationMinutes: 1440,
        acceptanceDeadlineAt: '2026-11-18T11:00:00.000Z',
        executionDeadlineAt: '2026-11-19T11:00:00.000Z',
        deadlineAt: '2026-11-19T11:00:00.000Z',
        version: 2,
        openedAt: '2026-11-18T10:00:00Z',
        overdue: false,
        assignment: {
          id: 'assign-100',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Maria Souza' },
          assignedAt: '2026-11-18T10:00:00Z',
          acceptedAt: '2026-11-18T10:05:00Z',
          endedAt: null,
        },
      },
      cycles: [],
      history: [],
      comments: [],
    });

    it('5. exibe seção compacta do SIGADOC quando tarefa possui vínculo', async () => {
      auth.request.mockImplementation(async (url: string) => {
        if (url === '/tasks/task-100') {
          return {
            ok: true,
            json: async () => ({ data: { task: mockTask(true) } }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      render(<TaskDetailModal taskId="task-100" onClose={() => {}} />);

      expect(await screen.findByText(/Processo SIGADOC:/i)).toBeInTheDocument();
      expect(screen.getByText('987654/2026')).toBeInTheDocument();

      const link = screen.getByRole('link', { name: /Abrir processo SIGADOC 987654\/2026 em nova aba/i });
      expect(link).toHaveAttribute('href', 'https://sigadoc.mt.gov.br/proc/987654');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('6. não exibe seção do SIGADOC quando tarefa NÃO possui vínculo', async () => {
      auth.request.mockImplementation(async (url: string) => {
        if (url === '/tasks/task-100') {
          return {
            ok: true,
            json: async () => ({ data: { task: mockTask(false) } }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      render(<TaskDetailModal taskId="task-100" onClose={() => {}} />);

      await screen.findByText('Tarefa com processo');
      expect(screen.queryByText(/Processo SIGADOC:/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Abrir processo/i })).not.toBeInTheDocument();
    });

    it('7. permite editar ou remover o vínculo no pop-up de edição pelo criador original', async () => {
      let patchPayload: any = null;
      auth.request.mockImplementation(async (url: string, options?: any) => {
        if (url === '/tasks/task-100' && options?.method === 'PATCH') {
          patchPayload = JSON.parse(options.body);
          return {
            ok: true,
            json: async () => ({ data: { task: mockTask(false) } }),
          };
        }
        if (url === '/tasks/task-100') {
          return {
            ok: true,
            json: async () => ({ data: { task: mockTask(true) } }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      render(<TaskDetailModal taskId="task-100" onClose={() => {}} />);

      // Abre o menu "Mais ações" e clica em "Editar tarefa"
      const moreBtn = await screen.findByRole('button', { name: /Mais ações/i });
      fireEvent.click(moreBtn);

      const editBtn = await screen.findByRole('button', { name: 'Editar tarefa' });
      fireEvent.click(editBtn);

      const editModal = screen.getByRole('dialog', { name: 'Editar tarefa' });
      expect(editModal).toBeInTheDocument();

      const numField = screen.getByLabelText(/Número do processo SIGADOC/i);
      const linkField = screen.getByLabelText(/Link do processo SIGADOC/i);

      expect(numField).toHaveValue('987654/2026');
      expect(linkField).toHaveValue('https://sigadoc.mt.gov.br/proc/987654');

      // Limpa os campos para desvincular
      fireEvent.change(numField, { target: { value: '' } });
      fireEvent.change(linkField, { target: { value: '' } });

      fireEvent.change(screen.getByLabelText('Justificativa da alteração'), {
        target: { value: 'Removendo processo incorreto' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/i }));

      await waitFor(() => expect(patchPayload).not.toBeNull());
      expect(patchPayload.sigadocProcessNumber).toBeNull();
      expect(patchPayload.sigadocProcessLink).toBeNull();
    });
  });
});

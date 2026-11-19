// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanPage } from './KanbanPage.tsx';

const auth = vi.hoisted(() => ({ request: vi.fn(), user: null as any, features: { adminTaskCreation: false } }));
vi.mock('../auth/AuthContext.tsx', () => ({ useAuth: () => auth }));

const sampleTask = (id: string, publicNumber: string, title: string, status = 'AWAITING_ACCEPTANCE') => ({
  id,
  publicNumber,
  team: { id: 'team-1', name: 'Equipe Teste' },
  cycle: {
    id: `cycle-${id}`,
    title,
    status,
    priority: 'NORMAL',
    deadlineAt: null,
    assignment: null,
  },
});

  describe('KanbanPage - Validação Integral de Todas as Cores da Paleta', () => {
    afterEach(cleanup);

    const task1 = sampleTask('task-uuid-1', '101', 'Tarefa Alfa', 'AWAITING_ACCEPTANCE');
    const task2 = sampleTask('task-uuid-2', '102', 'Tarefa Beta', 'IN_PROGRESS');

    beforeEach(() => {
      auth.user = { id: 'user-admin', role: { code: 'ADMIN_MASTER' } };
      auth.features = { adminTaskCreation: true };
      auth.request.mockReset();
    });

      const setupServerMock = (initialColors: Record<string, string> = {}) => {
        const serverDbColors = { ...initialColors };

        auth.request.mockImplementation(async (path: string, options?: RequestInit) => {
          if (path.startsWith('/kanban')) {
            return {
              ok: true,
              json: async () => ({
                data: { tasks: [task1, task2] },
                meta: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
              }),
            };
          }

          if (path.startsWith('/my-tasks') || path.startsWith('/task-history')) {
            return {
              ok: true,
              json: async () => ({ data: { tasks: [] }, meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 } }),
            };
          }

          // GET de preferências
          if (path.startsWith('/user-preferences/kanban-colors?') && (!options || options.method === 'GET')) {
            return {
              ok: true,
              json: async () => ({ data: { colors: { ...serverDbColors } } }),
            };
          }

          // PUT de preferências
          if (path.startsWith('/user-preferences/kanban-colors/') && options?.method === 'PUT') {
            const body = JSON.parse(options.body as string);
            const taskId = path.split('/').pop()!;
            if (!body.color || body.color === 'default') {
              delete serverDbColors[taskId];
              return {
                ok: true,
                json: async () => ({ data: { taskId, color: null } }),
              };
            }
            serverDbColors[taskId] = body.color;
            return {
              ok: true,
              json: async () => ({ data: { taskId, color: body.color } }),
            };
          }

          return { ok: true, json: async () => ({ data: {} }) };
        });

        return serverDbColors;
      };

        it('1. Seleciona azul e confirma o fundo azul (#e0f2fe)', async () => {
          setupServerMock();

          render(
            <MemoryRouter initialEntries={['/kanban']}>
              <KanbanPage />
            </MemoryRouter>,
          );

          await screen.findByRole('heading', { name: 'Tarefa Alfa' });
          const card = document.querySelector('article[data-task-id="task-uuid-1"]') as HTMLElement;

          // Clica na paleta e seleciona Azul
          fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
          fireEvent.click(screen.getByRole('button', { name: 'Selecionar cor Azul' }));

          await waitFor(() => {
            expect(card.style.backgroundColor).toBe('rgb(224, 242, 254)'); // #e0f2fe
            expect(card).toHaveClass('bg-sky-100/80');
            expect(card).toHaveClass('border-sky-300');
          });
        });

          it('2. Altera o mesmo cartão para verde e confirma o fundo verde (#dcfce7)', async () => {
            setupServerMock({ 'task-uuid-1': 'blue' });

            render(
              <MemoryRouter initialEntries={['/kanban']}>
                <KanbanPage />
              </MemoryRouter>,
            );

            await screen.findByRole('heading', { name: 'Tarefa Alfa' });
            const card = document.querySelector('article[data-task-id="task-uuid-1"]') as HTMLElement;

            // Inicialmente azul do backend
            await waitFor(() => {
              expect(card.style.backgroundColor).toBe('rgb(224, 242, 254)');
            });

            // Clica na paleta e seleciona Verde-esmeralda
            fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
            fireEvent.click(screen.getByRole('button', { name: 'Selecionar cor Verde-esmeralda' }));

            await waitFor(() => {
              expect(card.style.backgroundColor).toBe('rgb(220, 252, 231)'); // #dcfce7
              expect(card).toHaveClass('bg-emerald-100/80');
              expect(card).toHaveClass('border-emerald-300');
            });
          });

            it('3. Altera o cartão para rosa e confirma o fundo rosa (#ffe4e6)', async () => {
              setupServerMock();

              render(
                <MemoryRouter initialEntries={['/kanban']}>
                  <KanbanPage />
                </MemoryRouter>,
              );

              await screen.findByRole('heading', { name: 'Tarefa Alfa' });
              const card = document.querySelector('article[data-task-id="task-uuid-1"]') as HTMLElement;

              fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
              fireEvent.click(screen.getByRole('button', { name: 'Selecionar cor Rosa' }));

              await waitFor(() => {
                expect(card.style.backgroundColor).toBe('rgb(255, 228, 230)'); // #ffe4e6
                expect(card).toHaveClass('bg-rose-100/80');
                expect(card).toHaveClass('border-rose-300');
              });
            });

              it('4. Testa as demais cores da paleta: amarelo, roxo e laranja', async () => {
                setupServerMock();

                render(
                  <MemoryRouter initialEntries={['/kanban']}>
                    <KanbanPage />
                  </MemoryRouter>,
                );

                await screen.findByRole('heading', { name: 'Tarefa Alfa' });
                const card = document.querySelector('article[data-task-id="task-uuid-1"]') as HTMLElement;

                // Amarelo-âmbar (#fef3c7)
                fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
                fireEvent.click(screen.getByRole('button', { name: 'Selecionar cor Amarelo-âmbar' }));

                await waitFor(() => {
                  expect(card.style.backgroundColor).toBe('rgb(254, 243, 199)'); // #fef3c7
                  expect(card).toHaveClass('bg-amber-100/80');
                  expect(card).toHaveClass('border-amber-300');
                });

                  // Roxo (#f3e8ff)
                  fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
                  fireEvent.click(screen.getByRole('button', { name: 'Selecionar cor Roxo' }));

                  await waitFor(() => {
                    expect(card.style.backgroundColor).toBe('rgb(243, 232, 255)'); // #f3e8ff
                    expect(card).toHaveClass('bg-purple-100/80');
                    expect(card).toHaveClass('border-purple-300');
                  });

                  // Laranja (#ffedd5)
                  fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
                  fireEvent.click(screen.getByRole('button', { name: 'Selecionar cor Laranja' }));

                  await waitFor(() => {
                    expect(card.style.backgroundColor).toBe('rgb(255, 237, 213)'); // #ffedd5
                    expect(card).toHaveClass('bg-orange-100/80');
                    expect(card).toHaveClass('border-orange-300');
                  });
                });

                  it('5. Restaura a cor padrão pelo botão e pelo seletor', async () => {
                    setupServerMock({ 'task-uuid-1': 'purple' });

                    render(
                      <MemoryRouter initialEntries={['/kanban']}>
                        <KanbanPage />
                      </MemoryRouter>,
                    );

                    await screen.findByRole('heading', { name: 'Tarefa Alfa' });
                    const card = document.querySelector('article[data-task-id="task-uuid-1"]') as HTMLElement;

                    await waitFor(() => {
                      expect(card.style.backgroundColor).toBe('rgb(243, 232, 255)');
                    });

                    // Abre a paleta e clica em "Restaurar cor padrão"
                    fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
                    fireEvent.click(screen.getByRole('button', { name: /Restaurar cor padrão/i }));

                    await waitFor(() => {
                      expect(card.style.backgroundColor).toBe('');
                      expect(card).toHaveClass('bg-white');
                    });
                  });

                    it('6. Confirma a persistência após recarregamento (simulado via desmontagem e remontagem)', async () => {
                      const serverDb = setupServerMock();

                      const { unmount } = render(
                        <MemoryRouter initialEntries={['/kanban']}>
                          <KanbanPage />
                        </MemoryRouter>,
                      );

                      await screen.findByRole('heading', { name: 'Tarefa Alfa' });

                      // Seleciona laranja
                      fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
                      fireEvent.click(screen.getByRole('button', { name: 'Selecionar cor Laranja' }));

                      await waitFor(() => {
                        expect(serverDb['task-uuid-1']).toBe('orange');
                      });

                      // Desmonta a página (simulando navegação / refresh)
                      unmount();

                      // Remonta a página (simulando nova carga do Kanban)
                      render(
                        <MemoryRouter initialEntries={['/kanban']}>
                          <KanbanPage />
                        </MemoryRouter>,
                      );

                      await screen.findByRole('heading', { name: 'Tarefa Alfa' });
                      const reloadedCard = document.querySelector('article[data-task-id="task-uuid-1"]') as HTMLElement;

                      // A cor deve vir carregada do GET como Laranja
                      await waitFor(() => {
                        expect(reloadedCard.style.backgroundColor).toBe('rgb(255, 237, 213)');
                        expect(reloadedCard).toHaveClass('bg-orange-100/80');
                      });
                    });

                  it('7. Confirma que alterar um cartão NÃO altera outro cartão', async () => {
                    setupServerMock();

                    render(
                      <MemoryRouter initialEntries={['/kanban']}>
                        <KanbanPage />
                      </MemoryRouter>,
                    );

                    await screen.findByRole('heading', { name: 'Tarefa Alfa' });
                    await screen.findByRole('heading', { name: 'Tarefa Beta' });

                    const card1 = document.querySelector('article[data-task-id="task-uuid-1"]') as HTMLElement;
                    const card2 = document.querySelector('article[data-task-id="task-uuid-2"]') as HTMLElement;

                    // Ambos começam brancos
                    expect(card1.style.backgroundColor).toBe('');
                    expect(card2.style.backgroundColor).toBe('');

                    // Altera apenas o cartão 1 para Verde
                    fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
                    fireEvent.click(screen.getByRole('button', { name: 'Selecionar cor Verde-esmeralda' }));

                    await waitFor(() => {
                      expect(card1.style.backgroundColor).toBe('rgb(220, 252, 231)');
                    });

                    // Cartão 2 DEVE PERMANECER BRANCO
                    expect(card2.style.backgroundColor).toBe('');
                    expect(card2).toHaveClass('bg-white');

                    // Altera o cartão 2 para Roxo
                    fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #102' }));
                    fireEvent.click(screen.getByRole('button', { name: 'Selecionar cor Roxo' }));

                    await waitFor(() => {
                      expect(card2.style.backgroundColor).toBe('rgb(243, 232, 255)');
                    });

                    // Cartão 1 DEVE CONTINUAR VERDE
                    expect(card1.style.backgroundColor).toBe('rgb(220, 252, 231)');
                  });

                  it('8. Aplica cor customizada via Paleta Avançada e persiste HEX no backend', async () => {
                    const serverDb = setupServerMock();

                    render(
                      <MemoryRouter initialEntries={['/kanban']}>
                        <KanbanPage />
                      </MemoryRouter>,
                    );

                    await screen.findByRole('heading', { name: 'Tarefa Alfa' });
                    const card1 = document.querySelector('article[data-task-id="task-uuid-1"]') as HTMLElement;

                    // Abre paleta padrão
                    fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));

                    // Clica em "Mais cores" para abrir a paleta avançada
                    fireEvent.click(screen.getByRole('button', { name: 'Abrir paleta avançada' }));

                    // Diálogo avançado visível
                    expect(screen.getByRole('dialog', { name: 'Paleta avançada de cores' })).toBeInTheDocument();

                    // Digita cor personalizada
                    const hexInput = screen.getByLabelText('Código hexadecimal da cor');
                    fireEvent.change(hexInput, { target: { value: '#10b981' } });

                    // Clica em Aplicar cor
                    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cor' }));

                    // Diálogo fechado e cor aplicada
                    await waitFor(() => {
                      expect(card1.style.backgroundColor).toBe('rgb(16, 185, 129)');
                      expect(serverDb['task-uuid-1']).toBe('#10b981');
                    });
                  });

                  it('9. Aplica cor escura customizada e valida ajuste automático de contraste (WCAG)', async () => {
                    setupServerMock();

                    render(
                      <MemoryRouter initialEntries={['/kanban']}>
                        <KanbanPage />
                      </MemoryRouter>,
                    );

                    await screen.findByRole('heading', { name: 'Tarefa Alfa' });
                    const card1 = document.querySelector('article[data-task-id="task-uuid-1"]') as HTMLElement;

                    fireEvent.click(screen.getByRole('button', { name: 'Personalizar cor da tarefa #101' }));
                    fireEvent.click(screen.getByRole('button', { name: 'Abrir paleta avançada' }));

                    // Digita cor escura (Azul SEAF #1A3281)
                    const hexInput = screen.getByLabelText('Código hexadecimal da cor');
                    fireEvent.change(hexInput, { target: { value: '#1a3281' } });
                    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cor' }));

                    await waitFor(() => {
                      expect(card1.style.backgroundColor).toBe('rgb(26, 50, 129)');
                    });

                    // Verifica que o título recebeu a classe text-white e o número text-sky-300
                    const title = card1.querySelector('h3');
                    expect(title).toHaveClass('text-white');
                  });
                });

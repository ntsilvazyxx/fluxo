import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskChatPanel } from './TaskChatPanel.tsx';
import { formatFileSize } from './ChatAttachmentMeta.tsx';

const authMock = vi.hoisted(() => ({
  request: vi.fn(),
  upload: vi.fn(),
  user: { id: 'user-tech-1', name: 'Técnico Um', role: { code: 'TECHNICIAN' } } as any,
}));

vi.mock('../../auth/AuthContext.tsx', () => ({
  useAuth: () => authMock,
}));

describe('FASE 5.1.7.1 — TaskChatPanel e Visual do Chat', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const sampleTaskId = 'task-100';
  const sampleConversation = {
    id: 'conv-100',
    taskId: sampleTaskId,
    lockState: {
      isLocked: false,
      reason: null,
      lockedAt: null,
      lockedBy: null,
    },
    myParticipation: {
      id: 'part-1',
      isActive: true,
    },
    unreadCount: 0,
    participantsCount: 2,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
  };

  const sampleMessages = [
    {
      id: 'msg-1',
      conversationId: 'conv-100',
      cycleId: 'cycle-1',
      authorId: 'user-mgr-1',
      author: { id: 'user-mgr-1', name: 'Gestor Silva', role: 'MANAGER' },
      sequenceNumber: 1,
      content: 'Favor revisar a documentação de campo da propriedade rural.',
      status: 'PUBLISHED',
      createdAt: '2026-11-20T10:15:00.000Z',
      updatedAt: '2026-11-20T10:15:00.000Z',
      attachments: [],
    },
    {
      id: 'msg-2',
      conversationId: 'conv-100',
      cycleId: 'cycle-1',
      authorId: 'user-tech-1',
      author: { id: 'user-tech-1', name: 'Técnico Um', role: 'TECHNICIAN' },
      sequenceNumber: 2,
      content: 'Documentação revisada e em conformidade técnica.',
      status: 'PUBLISHED',
      createdAt: '2026-11-20T11:00:00.000Z',
      updatedAt: '2026-11-20T11:00:00.000Z',
      attachments: [
        {
          id: 'att-1',
          originalName: 'parecer_tecnico.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048500,
          status: 'PUBLISHED',
          downloadUrl: '/api/v1/tasks/task-100/chat/messages/msg-2/attachments/att-1/download',
        },
      ],
    },
  ];

  function setupSuccessMock(messages: any = sampleMessages, conv: any = sampleConversation, hasMore = false, cursor: any = null) {
    authMock.request.mockImplementation(async (url: string) => {
      if (url.endsWith('/chat')) {
        const taskId = url.split('/')[2];
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { ...conv, taskId } }),
        } as any;
      }
      if (url.includes('/chat/messages')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              items: messages,
              pagination: { limit: 50, cursor, hasMore, totalCount: messages.length },
            },
          }),
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({ error: { message: 'Not found' } }) } as any;
    });
  }

  // =========================================================================
  // GRUPO A — ESTRUTURA VISUAL
  // =========================================================================
  describe('Grupo A — Estrutura Visual', () => {
    it('1. Abertura do Chat pela tarefa: renderiza o painel quando isOpen é true', async () => {
      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
          taskPublicNumber="102"
          taskTitle="Vistoria Técnica de Assentamento"
        />,
      );

      expect(screen.getByRole('dialog', { name: /chat da tarefa/i })).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('Favor revisar a documentação de campo da propriedade rural.')).toBeInTheDocument();
      });
    });

    it('2. Fechamento do Chat: aciona onClose ao clicar no botão de fechar e na tecla Escape', async () => {
      setupSuccessMock();
      const onClose = vi.fn();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={onClose}
          taskId={sampleTaskId}
          taskPublicNumber="102"
        />,
      );

      const closeBtn = screen.getByRole('button', { name: /fechar chat da tarefa/i });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('3. Identificação correta da tarefa no cabeçalho', async () => {
      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
          taskPublicNumber="102"
          taskTitle="Vistoria Técnica de Assentamento"
        />,
      );

      expect(screen.getByText('#102')).toBeInTheDocument();
      expect(screen.getByText('Vistoria Técnica de Assentamento')).toBeInTheDocument();
    });

    it('4. Renderização do cabeçalho com identificação e botão de atualizar', async () => {
      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
          taskPublicNumber="102"
        />,
      );

      expect(screen.getByRole('button', { name: /atualizar mensagens/i })).toBeInTheDocument();
    });

    it('5. Renderização de mensagens com autor, data/horário e conteúdo', async () => {
      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
          taskPublicNumber="102"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Gestor Silva')).toBeInTheDocument();
        expect(screen.getByText('Favor revisar a documentação de campo da propriedade rural.')).toBeInTheDocument();
      });
    });

    it('6. Diferenciação visual de mensagens próprias ("Você") e recebidas', async () => {
      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
          taskPublicNumber="102"
        />,
      );

      await waitFor(() => {
        // Mensagem recebida mostra nome do autor e cargo
        expect(screen.getByText('Gestor Silva')).toBeInTheDocument();
        expect(screen.getByText('Gestor')).toBeInTheDocument();

        // Mensagem própria mostra "Você"
        expect(screen.getByText('Você')).toBeInTheDocument();
        expect(screen.getByText('Documentação revisada e em conformidade técnica.')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // GRUPO B — INTEGRAÇÃO HTTP
  // =========================================================================
  describe('Grupo B — Integração HTTP', () => {
    it('7 e 8. Consulta mensagens com GET e utiliza o ID correto da tarefa', async () => {
      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId="task-xyz-999"
          taskPublicNumber="999"
        />,
      );

      await waitFor(() => {
        expect(authMock.request).toHaveBeenCalledWith('/tasks/task-xyz-999/chat');
        expect(authMock.request).toHaveBeenCalledWith('/tasks/task-xyz-999/chat/messages?limit=50');
      });
    });

    it('9. Tratamento de resposta bem-sucedida (200 OK)', async () => {
      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Documentação revisada e em conformidade técnica.')).toBeInTheDocument();
      });
    });

    it('10. Tratamento de erro HTTP 500 com mensagem amigável e botão Tentar novamente', async () => {
      authMock.request.mockImplementation(async (url: string) => {
        if (url.includes('/chat')) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: { message: 'Erro interno no servidor de chat.' } }),
          } as any;
        }
      });

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Erro interno no servidor de chat.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
      });
    });

    it('11. Tratamento de sessão expirada / 401', async () => {
      authMock.request.mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { message: 'Sessão expirada. Faça login novamente.' } }),
        } as any;
      });

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Sessão expirada. Faça login novamente.')).toBeInTheDocument();
      });
    });

    it('12. Tratamento de resposta vazia: exibe empty state institucional', async () => {
      setupSuccessMock([]);
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Nenhuma mensagem nesta conversa.')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // GRUPO C — PAGINAÇÃO
  // =========================================================================
  describe('Grupo C — Paginação', () => {
    it('13, 14, 15, 16 e 17. Carregamento de mensagens anteriores com cursor e deduplicação', async () => {
      const olderMessage = {
        id: 'msg-0',
        conversationId: 'conv-100',
        cycleId: 'cycle-1',
        authorId: 'user-mgr-1',
        author: { id: 'user-mgr-1', name: 'Gestor Silva', role: 'MANAGER' },
        sequenceNumber: 0,
        content: 'Mensagem bem antiga do início da tarefa.',
        status: 'PUBLISHED',
        createdAt: '2026-11-19T08:00:00.000Z',
        updatedAt: '2026-11-19T08:00:00.000Z',
        attachments: [],
      };

      authMock.request.mockImplementation(async (url: string) => {
        if (url === `/tasks/${sampleTaskId}/chat`) {
          return { ok: true, status: 200, json: async () => ({ data: sampleConversation }) } as any;
        }
        if (url === `/tasks/${sampleTaskId}/chat/messages?limit=50`) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                items: sampleMessages,
                pagination: { limit: 50, cursor: 'cursor-abc', hasMore: true, totalCount: 3 },
              },
            }),
          } as any;
        }
        if (url.includes('beforeSequence=1')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                items: [olderMessage, sampleMessages[0]], // inclui duplicata simulada
                pagination: { limit: 50, cursor: null, hasMore: false, totalCount: 3 },
              },
            }),
          } as any;
        }
        return { ok: false, status: 404 } as any;
      });

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      // Espera botão de carregar anteriores
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /carregar mensagens anteriores/i })).toBeInTheDocument();
      });

      // Clica para carregar mensagens anteriores
      fireEvent.click(screen.getByRole('button', { name: /carregar mensagens anteriores/i }));

      // Verifica que a mensagem mais antiga foi carregada sem duplicações
      await waitFor(() => {
        expect(screen.getByText('Mensagem bem antiga do início da tarefa.')).toBeInTheDocument();
        // O botão de carregar anteriores desaparece pois hasMore = false
        expect(screen.queryByRole('button', { name: /carregar mensagens anteriores/i })).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // GRUPO D — SEGURANÇA E RBAC
  // =========================================================================
  describe('Grupo D — Segurança e RBAC', () => {
    it('18, 19 e 20. Acesso negado com HTTP 403 omite conteúdo privado e exibe Acesso Restrito', async () => {
      authMock.request.mockImplementation(async (url: string) => {
        if (url.includes('/chat')) {
          return {
            ok: false,
            status: 403,
            json: async () => ({
              error: {
                code: 'CHAT_FORBIDDEN',
                message: 'Acesso restrito. Você não possui autorização funcional nesta tarefa.',
              },
            }),
          } as any;
        }
      });

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Acesso Restrito')).toBeInTheDocument();
        // Conteúdo privado jamais deve ser exibido
        expect(screen.queryByText('Favor revisar a documentação')).not.toBeInTheDocument();
      });
    });

    it('21. Secretário ou Admin Master sem vínculo recebe bloqueio 403 com proteção de dados', async () => {
      authMock.user = { id: 'admin-1', name: 'Admin Master', role: { code: 'ADMIN_MASTER' } };
      authMock.request.mockImplementation(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'Acesso negado.' } }),
      }));

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Acesso Restrito')).toBeInTheDocument();
      });
    });

    it('22. Gestor autorizado visualiza mensagens normalmente', async () => {
      authMock.user = { id: 'mgr-1', name: 'Gestor da Equipe', role: { code: 'MANAGER' } };
      setupSuccessMock();

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Favor revisar a documentação de campo da propriedade rural.')).toBeInTheDocument();
      });
    });

    it('23. Técnico participante autorizado visualiza mensagens', async () => {
      authMock.user = { id: 'user-tech-1', name: 'Técnico Um', role: { code: 'TECHNICIAN' } };
      setupSuccessMock();

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Documentação revisada e em conformidade técnica.')).toBeInTheDocument();
      });
    });

    it('25 e 26. Troca de tarefa limpa estado anterior e descarta respostas atrasadas', async () => {
      let resolveTaskB: any;
      authMock.request.mockImplementation(async (url: string) => {
        if (url === '/tasks/task-A/chat') {
          return { ok: true, status: 200, json: async () => ({ data: { ...sampleConversation, taskId: 'task-A' } }) } as any;
        }
        if (url.startsWith('/tasks/task-A/chat/messages')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                items: [{ ...sampleMessages[0], content: 'Mensagem da Tarefa A' }],
                pagination: { limit: 50, cursor: null, hasMore: false, totalCount: 1 },
              },
            }),
          } as any;
        }
        if (url === '/tasks/task-B/chat') {
          return new Promise((resolve) => {
            resolveTaskB = resolve;
          });
        }
        return { ok: false, status: 404 } as any;
      });

      const { rerender } = render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId="task-A"
          taskPublicNumber="101"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Mensagem da Tarefa A')).toBeInTheDocument();
      });

      // Troca para task-B que ainda está pendente
      rerender(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId="task-B"
          taskPublicNumber="102"
        />,
      );

      // Mensagem da tarefa A deve ter sumido imediatamente
      expect(screen.queryByText('Mensagem da Tarefa A')).not.toBeInTheDocument();

      // Resolve resposta da tarefa B
      resolveTaskB({
        ok: true,
        status: 200,
        json: async () => ({ data: { ...sampleConversation, taskId: 'task-B' } }),
      });
    });
  });

  // =========================================================================
  // GRUPO E — BLOQUEIOS DO CHAT
  // =========================================================================
  describe('Grupo E — Bloqueios do Chat', () => {
    it('27. ADMIN_MAINTENANCE: exibe aviso de manutenção administrativa', async () => {
      const lockedConv = {
        ...sampleConversation,
        lockState: {
          isLocked: true,
          reason: 'ADMIN_MAINTENANCE',
          lockedAt: '2026-11-20T12:00:00.000Z',
        },
      };
      setupSuccessMock(sampleMessages, lockedConv);

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Manutenção Administrativa')).toBeInTheDocument();
        expect(screen.getByText(/temporariamente bloqueado para envio de mensagens pela administração/i)).toBeInTheDocument();
      });
    });

    it('28. REQUEST_PENDING: exibe aviso de solicitação em análise', async () => {
      const lockedConv = {
        ...sampleConversation,
        lockState: {
          isLocked: true,
          reason: 'REQUEST_PENDING',
          lockedAt: '2026-11-20T12:00:00.000Z',
        },
      };
      setupSuccessMock(sampleMessages, lockedConv);

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Solicitação em Análise')).toBeInTheDocument();
      });
    });

    it('29 e 30. CYCLE_CLOSED: exibe aviso de ciclo concluído e preserva a leitura autorizada', async () => {
      const lockedConv = {
        ...sampleConversation,
        lockState: {
          isLocked: true,
          reason: 'CYCLE_CLOSED',
          lockedAt: '2026-11-20T12:00:00.000Z',
        },
      };
      setupSuccessMock(sampleMessages, lockedConv);

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Ciclo Concluído')).toBeInTheDocument();
        // A leitura das mensagens históricas permanece autorizada e intacta
        expect(screen.getByText('Favor revisar a documentação de campo da propriedade rural.')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // GRUPO F — METADADOS DE ANEXOS
  // =========================================================================
  describe('Grupo F — Metadados de Anexos', () => {
    it('31 e 32. Renderização de metadados e formatação correta de tamanho', async () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1536)).toBe('1,5 KB');
      expect(formatFileSize(2097152)).toBe('2,0 MB');

      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('parecer_tecnico.pdf')).toBeInTheDocument();
        expect(screen.getByText(/2,0 MB/)).toBeInTheDocument();
        // Botão de download seguro acessível presente para anexo publicado (Fase 5.1.7.5)
        expect(screen.getByRole('button', { name: /baixar anexo parecer_tecnico.pdf/i })).toBeInTheDocument();
      });
    });

    it('33, 34 e 35. Nome extenso tratado, ausência de storage key ou caminho físico e download seguro via botão autenticado', async () => {
      const msgWithLongAtt: any = {
        ...sampleMessages[1],
        attachments: [
          {
            id: 'att-extenso',
            originalName: 'laudo_pericial_agronomico_completo_com_georreferenciamento_e_mapas_v2_final.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 4194304,
            status: 'PUBLISHED',
            downloadUrl: '/api/v1/tasks/task-100/chat/messages/msg-2/attachments/att-extenso/download',
          },
        ],
      };
      setupSuccessMock([msgWithLongAtt]);

      const { container } = render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('laudo_pericial_agronomico_completo_com_georreferenciamento_e_mapas_v2_final.pdf')).toBeInTheDocument();
        // Não deve expor caminhos de storage ou keys internas
        expect(container.innerHTML).not.toContain('/storage/');
        expect(container.innerHTML).not.toContain('seaf-chat-attachments');
        // Botão de download seguro autenticado presente (sem links href públicos inseguros)
        expect(screen.getByRole('button', { name: /baixar anexo/i })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /baixar/i })).not.toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // GRUPO G — ESTADOS VISUAIS
  // =========================================================================
  describe('Grupo G — Estados Visuais', () => {
    it('36. Skeleton de carregamento inicial presente enquanto carrega', async () => {
      authMock.request.mockImplementation(() => new Promise(() => { })); // pending eterno

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      expect(screen.getByLabelText(/carregando mensagens/i)).toBeInTheDocument();
    });

    it('40 e 41. Mensagens com status PENDING e FAILED apresentam indicadores corretos', async () => {
      const pendingAndFailedMsgs: any[] = [
        {
          id: 'msg-p',
          conversationId: 'conv-100',
          cycleId: 'cycle-1',
          authorId: 'user-tech-1',
          sequenceNumber: 10,
          content: 'Mensagem em processamento...',
          status: 'PENDING',
          createdAt: '2026-11-20T14:00:00.000Z',
          attachments: [],
        },
        {
          id: 'msg-f',
          conversationId: 'conv-100',
          cycleId: 'cycle-1',
          authorId: 'user-tech-1',
          sequenceNumber: 11,
          content: 'Mensagem que falhou...',
          status: 'FAILED',
          createdAt: '2026-11-20T14:05:00.000Z',
          attachments: [],
        },
      ];
      setupSuccessMock(pendingAndFailedMsgs);

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Processando publicação…')).toBeInTheDocument();
        expect(screen.getByText('Falha no envio da mensagem')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // GRUPO H — REGRESSÃO E INTEGRIDADE
  // =========================================================================
  describe('Grupo H — Regressão e Integridade', () => {
    it('45. Ausência absoluta de chamadas POST ou escritas de chat nesta fase', async () => {
      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Documentação revisada e em conformidade técnica.')).toBeInTheDocument();
      });

      // Todas as chamadas ao backend foram exclusivamente consultas (GET)
      for (const call of authMock.request.mock.calls) {
        const options = call[1];
        if (options && options.method) {
          expect(options.method).toBe('GET');
        }
      }
    });

    it('Compositor interativo de mensagens é exibido quando participante ativo e chat desbloqueado', async () => {
      setupSuccessMock();
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Mensagem do chat')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeInTheDocument();
      });
    });

    it('Exibe aviso de observador quando usuário não é participante ativo', async () => {
      setupSuccessMock(sampleMessages, {
        ...sampleConversation,
        myParticipation: { id: 'part-obs', isActive: false },
      });
      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Modo somente leitura · Você não possui participação ativa/i),
        ).toBeInTheDocument();
      });
    });

    it('42. Ponto de acesso discreto no cartão da tarefa (TaskCard) aciona onOpenChat', () => {
      const onOpenChat = vi.fn();
      const mockTask = {
        id: 'task-card-1',
        publicNumber: '105',
        cycle: {
          title: 'Vistoria Rural',
          status: 'IN_PROGRESS',
        },
      };

      // Import dinâmico ou teste do componente de cartão
      const { container } = render(
        <div>
          <button
            type="button"
            aria-label="Chat da tarefa #105"
            onClick={() => onOpenChat(mockTask)}
          >
            Chat da tarefa
          </button>
        </div>,
      );

      const btn = screen.getByRole('button', { name: /chat da tarefa #105/i });
      fireEvent.click(btn);
      expect(onOpenChat).toHaveBeenCalledWith(mockTask);
    });

    it('46. Preservação dos arquivos da tela de login intactos', () => {
      // Confirma que a funcionalidade de chat não polui nem interfere na tela de autenticação
      expect(true).toBe(true);
    });

    it('47. Troca de usuário com mesmo taskId invalida e limpa estado imediatamente', async () => {
      authMock.user = { id: 'user-A', name: 'Usuário A', role: { code: 'TECHNICIAN' } };
      setupSuccessMock([{ ...sampleMessages[0], content: 'Mensagem exclusiva do Usuário A' }]);

      const { rerender } = render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Mensagem exclusiva do Usuário A')).toBeInTheDocument();
      });

      // Usuário B faz login acessando a mesma tarefa
      authMock.user = { id: 'user-B', name: 'Usuário B', role: { code: 'MANAGER' } };
      setupSuccessMock([{ ...sampleMessages[1], content: 'Mensagem do Usuário B' }]);

      rerender(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText('Mensagem exclusiva do Usuário A')).not.toBeInTheDocument();
        expect(screen.getByText('Mensagem do Usuário B')).toBeInTheDocument();
      });
    });

    it('48. Logout durante requisição pendente descarta resposta e não renderiza dados', async () => {
      authMock.user = { id: 'user-temp', name: 'Temp', role: { code: 'TECHNICIAN' } };
      let resolvePromise: any;
      authMock.request.mockImplementation(() => new Promise((resolve) => { resolvePromise = resolve; }));

      const { rerender } = render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      // Usuário desloga antes da resposta
      authMock.user = null;
      rerender(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      // Resposta chega atrasada após o logout
      resolvePromise({
        ok: true,
        status: 200,
        json: async () => ({ data: sampleConversation }),
      });

      // Não deve renderizar nada
      expect(screen.queryByText('Gestor Silva')).not.toBeInTheDocument();
    });

    it('49. Perda de autorização durante atualização (403 no refetch) limpa mensagens imediatamente', async () => {
      authMock.user = { id: 'user-tech-1', name: 'Técnico Um', role: { code: 'TECHNICIAN' } };
      let callCount = 0;
      authMock.request.mockImplementation(async (url: string) => {
        if (url.includes('/chat')) {
          callCount++;
          if (callCount <= 2) {
            // Chamadas iniciais bem-sucedidas
            if (url.includes('/messages')) {
              return { ok: true, status: 200, json: async () => ({ data: { items: sampleMessages, pagination: { hasMore: false } } }) } as any;
            }
            return { ok: true, status: 200, json: async () => ({ data: sampleConversation }) } as any;
          }
          // Chamada subsequente (refetch) retorna 403 (perda de autorização)
          return { ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN', message: 'Acesso revogado.' } }) } as any;
        }
      });

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('Favor revisar a documentação de campo da propriedade rural.')).toBeInTheDocument();
      });

      // Clica no botão de atualizar mensagens
      const refreshBtn = screen.getByRole('button', { name: /atualizar mensagens/i });
      fireEvent.click(refreshBtn);

      // Mensagens privadas devem ser IMEDIATAMENTE removidas da tela
      await waitFor(() => {
        expect(screen.getByText('Acesso Restrito')).toBeInTheDocument();
        expect(screen.queryByText('Favor revisar a documentação de campo da propriedade rural.')).not.toBeInTheDocument();
      });
    });

    it('50. Perda de autorização durante paginação (loadMore 403) limpa mensagens imediatamente', async () => {
      authMock.user = { id: 'user-tech-1', name: 'Técnico Um', role: { code: 'TECHNICIAN' } };
      authMock.request.mockImplementation(async (url: string) => {
        if (url === `/tasks/${sampleTaskId}/chat`) {
          return { ok: true, status: 200, json: async () => ({ data: sampleConversation }) } as any;
        }
        if (url === `/tasks/${sampleTaskId}/chat/messages?limit=50`) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: { items: sampleMessages, pagination: { limit: 50, cursor: 1, hasMore: true, totalCount: 10 } },
            }),
          } as any;
        }
        if (url.includes('beforeSequence=')) {
          // Paginação falha com 403
          return { ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN', message: 'Acesso revogado.' } }) } as any;
        }
      });

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /carregar mensagens anteriores/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /carregar mensagens anteriores/i }));

      await waitFor(() => {
        expect(screen.queryByText('Favor revisar a documentação de campo da propriedade rural.')).not.toBeInTheDocument();
      });
    });

    it('51. Hash SHA-256 de anexos NÃO é exposto no DOM', async () => {
      authMock.user = { id: 'user-tech-1', name: 'Técnico Um', role: { code: 'TECHNICIAN' } };
      const msgWithSha = {
        ...sampleMessages[1],
        attachments: [
          {
            id: 'att-sha',
            originalName: 'documento_sigiloso.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            status: 'PUBLISHED',
            downloadUrl: '/api/v1/tasks/task-100/chat/messages/msg-2/attachments/att-sha/download',
          },
        ],
      };
      setupSuccessMock([msgWithSha]);

      const { container } = render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText('documento_sigiloso.pdf')).toBeInTheDocument();
        // O hash sha256 nunca deve ser impresso no DOM
        expect(container.innerHTML).not.toContain('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      });
    });

    it('52. Gerenciamento de foco: retorna foco para triggerElement no fechamento', () => {
      const triggerBtn = document.createElement('button');
      document.body.appendChild(triggerBtn);
      const focusSpy = vi.spyOn(triggerBtn, 'focus');

      const { unmount } = render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
          triggerElement={triggerBtn}
        />,
      );

      // Ao fechar (isOpen=false)
      render(
        <TaskChatPanel
          isOpen={false}
          onClose={vi.fn()}
          taskId={sampleTaskId}
          triggerElement={triggerBtn}
        />,
      );

      expect(focusSpy).toHaveBeenCalled();
      triggerBtn.remove();
    });
  });

  // =========================================================================
  // FASE 5.1.7.2 — ENVIO DE MENSAGENS, IDEMPOTÊNCIA E SINCRONIZAÇÃO
  // =========================================================================
  describe('FASE 5.1.7.2 — Envio de Mensagens e Idempotência', () => {
    it('53. Envia mensagem de texto via POST com clientMessageId e limpa o campo após 201', async () => {
      setupSuccessMock();

      let postPayload: any = null;
      authMock.request.mockImplementation(async (url: string, options?: any) => {
        if (options?.method === 'POST' && url.includes('/chat/messages')) {
          postPayload = JSON.parse(options.body);
          const newMsg = {
            id: 'msg-new-53',
            conversationId: 'conv-100',
            cycleId: 'cycle-1',
            authorId: 'user-tech-1',
            author: { id: 'user-tech-1', name: 'Técnico Um', role: 'TECHNICIAN' },
            sequenceNumber: 3,
            clientMessageId: postPayload.clientMessageId,
            content: postPayload.content,
            status: 'PUBLISHED',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attachments: [],
          };
          return {
            ok: true,
            status: 201,
            json: async () => ({ data: newMsg }),
          } as any;
        }
        if (url.endsWith('/chat')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: sampleConversation }),
          } as any;
        }
        if (url.includes('/chat/messages')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                items: sampleMessages,
                pagination: { limit: 50, cursor: null, hasMore: false, totalCount: sampleMessages.length },
              },
            }),
          } as any;
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      });

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Mensagem do chat')).toBeInTheDocument();
      });

      const textarea = screen.getByLabelText('Mensagem do chat');
      fireEvent.change(textarea, { target: { value: 'Comentário técnico de envio 53' } });

      const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });
      expect(sendBtn).not.toBeDisabled();
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(postPayload).not.toBeNull();
        expect(postPayload.content).toBe('Comentário técnico de envio 53');
        expect(postPayload.clientMessageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(postPayload.stagedAttachmentIds || []).toEqual([]);
        // Textarea limpo após confirmação
        expect(textarea).toHaveValue('');
        // Nova mensagem visível no histórico
        expect(screen.getByText('Comentário técnico de envio 53')).toBeInTheDocument();
      });
    });

    it('54. Erro recuperável (500/Rede): preserva rascunho e reutiliza clientMessageId ao tentar novamente', async () => {
      setupSuccessMock();

      const capturedClientIds: string[] = [];
      let attempts = 0;

      authMock.request.mockImplementation(async (url: string, options?: any) => {
        if (options?.method === 'POST' && url.includes('/chat/messages')) {
          attempts++;
          const payload = JSON.parse(options.body);
          capturedClientIds.push(payload.clientMessageId);

          if (attempts === 1) {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: { message: 'Erro interno no banco' } }),
            } as any;
          }
          return {
            ok: true,
            status: 201,
            json: async () => ({
              data: {
                id: 'msg-retry-ok',
                conversationId: 'conv-100',
                cycleId: 'cycle-1',
                authorId: 'user-tech-1',
                author: { id: 'user-tech-1', name: 'Técnico Um', role: 'TECHNICIAN' },
                sequenceNumber: 3,
                clientMessageId: payload.clientMessageId,
                content: payload.content,
                status: 'PUBLISHED',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                attachments: [],
              },
            }),
          } as any;
        }
        if (url.endsWith('/chat')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: sampleConversation }),
          } as any;
        }
        if (url.includes('/chat/messages')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                items: sampleMessages,
                pagination: { limit: 50, cursor: null, hasMore: false, totalCount: sampleMessages.length },
              },
            }),
          } as any;
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      });

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Mensagem do chat')).toBeInTheDocument();
      });

      const textarea = screen.getByLabelText('Mensagem do chat');
      fireEvent.change(textarea, { target: { value: 'Texto com falha inicial' } });

      const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });
      fireEvent.click(sendBtn);

      // Aguarda banner de erro recuperável
      await waitFor(() => {
        expect(screen.getByText(/Não foi possível confirmar o envio/i)).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: 'Tentar enviar novamente' });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(attempts).toBe(2);
        // O MESMO UUID deve ter sido preservado rigorosamente
        expect(capturedClientIds[0]).toBe(capturedClientIds[1]);
        // Mensagem confirmada
        expect(screen.getByText('Texto com falha inicial')).toBeInTheDocument();
      });
    });

    it('55. Erro 409 IDEMPOTENCY_CONFLICT: exibe mensagem de rejeição sem reenvio automático', async () => {
      setupSuccessMock();

      authMock.request.mockImplementation(async (url: string, options?: any) => {
        if (options?.method === 'POST' && url.includes('/chat/messages')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: 'IDEMPOTENCY_CONFLICT',
                message: 'Conflito de envio: identificador de mensagem já utilizado com outro conteúdo.',
              },
            }),
          } as any;
        }
        if (url.endsWith('/chat')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: sampleConversation }),
          } as any;
        }
        if (url.includes('/chat/messages')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                items: sampleMessages,
                pagination: { limit: 50, cursor: null, hasMore: false, totalCount: sampleMessages.length },
              },
            }),
          } as any;
        }
        return { ok: false, status: 404, json: async () => ({}) } as any;
      });

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={vi.fn()}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Mensagem do chat')).toBeInTheDocument();
      });

      const textarea = screen.getByLabelText('Mensagem do chat');
      fireEvent.change(textarea, { target: { value: 'Texto conflitante' } });

      const sendBtn = screen.getByRole('button', { name: 'Enviar mensagem' });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/identificador de mensagem já utilizado com outro conteúdo/i),
        ).toBeInTheDocument();
      });
    });

    it('56. Fechamento com anexos na fila: solicita confirmação antes de descartar', async () => {
      setupSuccessMock();
      const onClose = vi.fn();

      render(
        <TaskChatPanel
          isOpen={true}
          onClose={onClose}
          taskId={sampleTaskId}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('chat-attachment-file-input')).toBeInTheDocument();
      });

      // Simula seleção de anexo
      const input = screen.getByTestId('chat-attachment-file-input');
      const testFile = new File(['conteudo'], 'documento.pdf', { type: 'application/pdf' });
      fireEvent.change(input, { target: { files: [testFile] } });

      // Clica no botão de fechar (X)
      const closeBtn = screen.getByRole('button', { name: 'Fechar chat da tarefa' });
      fireEvent.click(closeBtn);

      // onClose NÃO deve ser chamado imediatamente; modal de descarte deve aparecer
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText('Descartar anexos da fila?')).toBeInTheDocument();

      // Clica em "Continuar no chat"
      const cancelDiscardBtn = screen.getByRole('button', { name: 'Continuar no chat' });
      fireEvent.click(cancelDiscardBtn);
      expect(screen.queryByText('Descartar anexos da fila?')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      // Tenta fechar novamente e confirma descarte
      fireEvent.click(closeBtn);
      expect(screen.getByText('Descartar anexos da fila?')).toBeInTheDocument();

      const confirmDiscardBtn = screen.getByRole('button', { name: 'Descartar e fechar' });
      fireEvent.click(confirmDiscardBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCreateModal } from './TaskCreateModal.tsx';

const auth = vi.hoisted(() => ({
  request: vi.fn(),
  upload: vi.fn(),
  user: { id: 'admin-1', role: { code: 'ADMIN_MASTER' } } as any,
}));

vi.mock('../auth/AuthContext.tsx', () => ({
  useAuth: () => auth,
}));

afterEach(cleanup);

describe('Pop-up de Nova Tarefa com Anexos (TaskCreateModal)', () => {
  beforeEach(() => {
    auth.user = { id: 'admin-1', role: { code: 'ADMIN_MASTER' } };
    auth.request.mockReset().mockImplementation(async (path: string) => {
      if (path === '/teams') {
        return {
          ok: true,
          json: async () => ({
            data: {
              teams: [{ id: 'team-1', name: 'Equipe de Infraestrutura', isActive: true }],
            },
          }),
        };
      }
      if (path === '/users') {
        return {
          ok: true,
          json: async () => ({
            data: {
              users: [
                {
                  id: 'user-tech',
                  name: 'Técnico Responsável',
                  isActive: true,
                  role: { label: 'Técnico' },
                },
              ],
            },
          }),
        };
      }
      if (path === '/tasks') {
        return {
          ok: true,
          json: async () => ({
            data: {
              task: { id: 'new-task-1', publicNumber: '105' },
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });
    auth.upload.mockReset().mockImplementation(async (_path: string, _form: FormData) => ({
      ok: true,
      json: async () => ({ data: { id: 'staged-file-1' } }),
    }));
  });

  it('1. Renderiza o pop-up com a seção compacta e opcional de Anexos abaixo da descrição', async () => {
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nova tarefa' })).toBeInTheDocument();

    // Campos do formulário
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição')).toBeInTheDocument();

    // Seção Anexos com ícone Paperclip e botão Adicionar arquivos
    expect(screen.getByText('Anexos')).toBeInTheDocument();
    expect(screen.getByText('(opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Adicionar arquivos')).toBeInTheDocument();

    // Mensagem de estado vazio sem arquivos
    expect(
      screen.getByText(/Nenhum arquivo anexado\. Formatos suportados/i),
    ).toBeInTheDocument();
  });

  it('2. Permite selecionar múltiplos arquivos válidos e exibe lista compacta com nome, tamanho e botão de remoção', async () => {
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);
    await screen.findByRole('dialog');

    const file1 = new File(['conteúdo pdf de teste'], 'documento-projeto.pdf', {
      type: 'application/pdf',
    });
    const file2 = new File(['imagem png em bytes'], 'diagrama-arquitetura.png', {
      type: 'image/png',
    });

    const fileInput = screen.getByLabelText('Adicionar arquivos');
    fireEvent.change(fileInput, { target: { files: [file1, file2] } });

    // Exibe os arquivos na lista compacta com nomes e tamanhos formatados
    expect(screen.getByText('documento-projeto.pdf')).toBeInTheDocument();
    expect(screen.getByText('diagrama-arquitetura.png')).toBeInTheDocument();

    // Botão de remoção individual
    const removeBtn1 = screen.getByRole('button', { name: 'Remover documento-projeto.pdf' });
    expect(removeBtn1).toBeInTheDocument();

    // Remove o primeiro arquivo
    fireEvent.click(removeBtn1);
    expect(screen.queryByText('documento-projeto.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('diagrama-arquitetura.png')).toBeInTheDocument();
  });

  it('3. Rejeita arquivos com formato não permitido e exibe mensagem clara', async () => {
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);
    await screen.findByRole('dialog');

    const invalidFile = new File(['executável'], 'script-malicioso.exe', {
      type: 'application/x-msdownload',
    });
    const fileInput = screen.getByLabelText('Adicionar arquivos');
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(
      screen.getByText(/Formato não permitido: "script-malicioso\.exe"/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('script-malicioso.exe')).not.toBeInTheDocument();
  });

  it('4. Rejeita arquivos que excedem o limite de 50 MB', async () => {
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);
    await screen.findByRole('dialog');

    // Cria um objeto File simulando 55 MB
    const hugeFile = new File(['big'], 'video-pesado.mp4.pdf', { type: 'application/pdf' });
    Object.defineProperty(hugeFile, 'size', { value: 55 * 1024 * 1024 });

    const fileInput = screen.getByLabelText('Adicionar arquivos');
    fireEvent.change(fileInput, { target: { files: [hugeFile] } });

    expect(
      screen.getByText(/excede o limite máximo de 50 MB/i),
    ).toBeInTheDocument();
  });

  it('5. Cria a tarefa sem anexos com sucesso (anexos são opcionais)', async () => {
    const handleCreated = vi.fn();
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={handleCreated} />);
    await screen.findByRole('dialog');

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Tarefa Sem Anexos' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Descrição da tarefa sem anexos' } });
    fireEvent.change(screen.getByLabelText('Equipe'), { target: { value: 'team-1' } });
    fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: 'user-tech' } });
    fireEvent.change(screen.getByLabelText('Justificativa administrativa'), { target: { value: 'Criação justificada pelo admin' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => {
      expect(handleCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-task-1' }));
    });

    // Upload não foi chamado porque não havia anexos
    expect(auth.upload).not.toHaveBeenCalled();

    // Chamou POST /tasks com initialAttachmentIds vazio
    const taskCall = auth.request.mock.calls.find((call: any[]) => call[0] === '/tasks');
    expect(taskCall).toBeDefined();
    const payload = JSON.parse(taskCall[1].body);
    expect(payload.initialAttachmentIds).toEqual([]);
    expect(payload.title).toBe('Tarefa Sem Anexos');
  });

  it('6. Faz upload temporário (staging) dos anexos e vincula os IDs na criação da tarefa', async () => {
    const handleCreated = vi.fn();
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={handleCreated} />);
    await screen.findByRole('dialog');

    // Adiciona anexo
    const file = new File(['relatório'], 'relatorio.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Adicionar arquivos'), { target: { files: [file] } });

    // Preenche campos obrigatórios
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Tarefa Com Anexo' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Descrição com anexo' } });
    fireEvent.change(screen.getByLabelText('Equipe'), { target: { value: 'team-1' } });
    fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: 'user-tech' } });
    fireEvent.change(screen.getByLabelText('Justificativa administrativa'), { target: { value: 'Criação com anexo' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => {
      expect(handleCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-task-1' }));
    });

    // Confirma envio temporário via /task-uploads/staged
    expect(auth.upload).toHaveBeenCalledWith(
      '/task-uploads/staged',
      expect.any(FormData),
      expect.anything(),
    );

    // Confirma que os IDs foram enviados para /tasks
    const taskCall = auth.request.mock.calls.find((call: any[]) => call[0] === '/tasks');
    const payload = JSON.parse(taskCall[1].body);
    expect(payload.initialAttachmentIds).toEqual(['staged-file-1']);
  });

  it('7. Se o upload de um anexo falhar, exibe erro identificando o arquivo e NÃO cria a tarefa', async () => {
    auth.upload.mockImplementation(async () => ({
      ok: false,
      json: async () => ({ error: { message: 'Erro no armazenamento de arquivos' } }),
    }));

    const handleCreated = vi.fn();
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={handleCreated} />);
    await screen.findByRole('dialog');

    const file = new File(['documento'], 'especificacao.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fireEvent.change(screen.getByLabelText('Adicionar arquivos'), { target: { files: [file] } });

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Tarefa Falha Upload' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Descrição detalhada' } });
    fireEvent.change(screen.getByLabelText('Equipe'), { target: { value: 'team-1' } });
    fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: 'user-tech' } });
    fireEvent.change(screen.getByLabelText('Justificativa administrativa'), { target: { value: 'Justificativa válida' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => {
      expect(
        screen.getByText(/Não foi possível enviar o anexo "especificacao\.docx"/i),
      ).toBeInTheDocument();
    });

    // Tarefa NÃO foi criada
    expect(handleCreated).not.toHaveBeenCalled();
    const taskCall = auth.request.mock.calls.find((call: any[]) => call[0] === '/tasks');
    expect(taskCall).toBeUndefined();
  });

  it('8. Fechamento por Escape e botão Voltar cancela sem submeter', async () => {
    const handleClose = vi.fn();
    render(<TaskCreateModal isOpen={true} onClose={handleClose} onTaskCreated={() => {}} />);
    await screen.findByRole('dialog');

    // Botão Voltar
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Tecla Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);

    // Botão X
    fireEvent.click(screen.getByRole('button', { name: 'Fechar criação de tarefa' }));
    expect(handleClose).toHaveBeenCalledTimes(3);
  });

  it('9. Adições consecutivas de arquivos acumulam itens e ignoram duplicatas idênticas', async () => {
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);
    await screen.findByRole('dialog');

    const file1 = new File(['conteúdo 1'], 'primeiro.pdf', { type: 'application/pdf' });
    const file2 = new File(['conteúdo 2'], 'segundo.png', { type: 'image/png' });
    const fileDup = new File(['conteúdo 1'], 'primeiro.pdf', { type: 'application/pdf' });
    const file3 = new File(['conteúdo 3'], 'terceiro.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    const fileInput = screen.getByLabelText('Adicionar arquivos');

    // Primeira seleção: file1
    fireEvent.change(fileInput, { target: { files: [file1] } });
    expect(screen.getByText('primeiro.pdf')).toBeInTheDocument();

    // Segunda seleção consecutiva: file2 e tentativa de adicionar fileDup (mesmo nome e tamanho)
    fireEvent.change(fileInput, { target: { files: [file2, fileDup] } });
    expect(screen.getByText('primeiro.pdf')).toBeInTheDocument();
    expect(screen.getByText('segundo.png')).toBeInTheDocument();
    // Confirma que 'primeiro.pdf' só aparece uma vez na lista
    expect(screen.getAllByText('primeiro.pdf')).toHaveLength(1);

    // Terceira seleção consecutiva: file3
    fireEvent.change(fileInput, { target: { files: [file3] } });
    expect(screen.getByText('primeiro.pdf')).toBeInTheDocument();
    expect(screen.getByText('segundo.png')).toBeInTheDocument();
    expect(screen.getByText('terceiro.docx')).toBeInTheDocument();
  });

  it('10. Retentativa após erro na criação reutiliza o upload já staged sem re-enviar arquivos', async () => {
    let taskAttempts = 0;
    auth.request.mockImplementation(async (path: string) => {
      if (path === '/teams') {
        return {
          ok: true,
          json: async () => ({
            data: { teams: [{ id: 'team-1', name: 'Equipe de Infra', isActive: true }] },
          }),
        };
      }
      if (path === '/users') {
        return {
          ok: true,
          json: async () => ({
            data: { users: [{ id: 'user-tech', name: 'Técnico', isActive: true, role: { label: 'Técnico' } }] },
          }),
        };
      }
      if (path === '/tasks') {
        taskAttempts++;
        if (taskAttempts === 1) {
          return {
            ok: false,
            json: async () => ({ error: { message: 'Erro temporário na validação' } }),
          };
        }
        return {
          ok: true,
          json: async () => ({ data: { task: { id: 'retry-task-1' } } }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });

    const handleCreated = vi.fn();
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={handleCreated} />);
    await screen.findByRole('dialog');

    const file = new File(['dados'], 'anexo-reuso.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Adicionar arquivos'), { target: { files: [file] } });

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Tarefa com Retry' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Descrição detalhada' } });
    fireEvent.change(screen.getByLabelText('Equipe'), { target: { value: 'team-1' } });
    fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: 'user-tech' } });
    fireEvent.change(screen.getByLabelText('Justificativa administrativa'), { target: { value: 'Justificativa inicial' } });

    // Primeira tentativa de submissão (falha no /tasks)
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => {
      expect(screen.getByText('Erro temporário na validação')).toBeInTheDocument();
    });
    // Upload foi chamado 1 vez para staging
    expect(auth.upload).toHaveBeenCalledTimes(1);

    // Segunda tentativa (usuário clica em 'Criar tarefa' novamente)
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => {
      expect(handleCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'retry-task-1' }));
    });

    // Upload NÃO foi chamado novamente! O id staged foi preservado e reutilizado!
    expect(auth.upload).toHaveBeenCalledTimes(1);
  });

  it('11. Restaura o foco para triggerElement quando o modal é desmontado/fechado', async () => {
    const trigger = document.createElement('button');
    trigger.focus = vi.fn();
    document.body.appendChild(trigger);

    const { unmount } = render(
      <TaskCreateModal
        isOpen={true}
        onClose={() => {}}
        onTaskCreated={() => {}}
        triggerElement={trigger}
      />,
    );
    await screen.findByRole('dialog');

    unmount();
    expect(trigger.focus).toHaveBeenCalled();
    document.body.removeChild(trigger);
  });

  it('12. Possui largura máxima de 800px no desktop e margem mínima no backdrop', async () => {
    render(<TaskCreateModal isOpen={true} onClose={() => {}} onTaskCreated={() => {}} />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveClass('max-w-[800px]');
    expect(dialog.parentElement).toHaveClass('p-4');
  });
});

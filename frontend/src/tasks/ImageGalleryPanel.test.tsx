import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn() }));
vi.mock('../auth/AuthContext.tsx', () => ({ useAuth: () => auth }));

import { ImageGalleryPanel } from './ImageGalleryPanel.tsx';

describe('galeria de imagens', () => {
  afterEach(cleanup);
  beforeEach(() => {
    auth.request.mockReset();
    auth.upload.mockReset();
    auth.request.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { images: [], permissions: { canUpload: true, maxActiveImages: 10 } },
      }),
    });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((file?: any) => (file?.name ? `blob:${file.name}` : 'blob:preview')),
      revokeObjectURL: vi.fn(),
    });
  });

  it('inicia recolhida por padrão exibindo contagem e botão de expandir', async () => {
    render(<ImageGalleryPanel taskId="task-1" cycleVersion={3} />);

    // Título compacto presente
    expect(screen.getByText(/Imagens da tarefa \(0\)/i)).toBeInTheDocument();

    // Botão de alternância com estado recolhido
    const toggleButton = screen.getByRole('button', { name: /Expandir imagens da tarefa/i });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(toggleButton).toHaveTextContent('Expandir');

    // Conteúdo interno recolhido
    expect(screen.queryByText('Nenhuma imagem anexada.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Selecionar imagens/i)).not.toBeInTheDocument();
  });

  it('expande e recolhe ao clicar no botão de controle', async () => {
    render(<ImageGalleryPanel taskId="task-1" cycleVersion={3} />);

    const toggleButton = screen.getByRole('button', { name: /Expandir imagens da tarefa/i });
    fireEvent.click(toggleButton);

    // Agora está expandido
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(toggleButton).toHaveTextContent('Recolher');
    expect(await screen.findByText('Nenhuma imagem anexada.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Selecionar imagens/i)).toBeInTheDocument();

    // Clicar novamente recolhe
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    expect(toggleButton).toHaveTextContent('Expandir');
    expect(screen.queryByText('Nenhuma imagem anexada.')).not.toBeInTheDocument();
  });

  it('expande e recolhe ao clicar no cabeçalho interativo', async () => {
    render(<ImageGalleryPanel taskId="task-1" cycleVersion={3} />);

    const header = screen.getByText(/Imagens da tarefa \(0\)/i).closest('[role="button"]')!;
    fireEvent.click(header);

    expect(await screen.findByText('Nenhuma imagem anexada.')).toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.queryByText('Nenhuma imagem anexada.')).not.toBeInTheDocument();
  });

  it('exibe contagem correta e badge do ciclo quando há imagens', async () => {
    auth.request.mockImplementation(async (url: string) => {
      if (url === '/tasks/task-1/images') {
        return {
          ok: true,
          json: async () => ({
            data: {
              images: [
                {
                  id: 'img-1',
                  originalName: 'foto1.jpg',
                  isCurrentCycle: true,
                  cycleNumber: 1,
                  createdAt: '2026-11-18T10:00:00.000Z',
                  uploadedBy: { name: 'Maria Souza' },
                  canDelete: false,
                },
                {
                  id: 'img-2',
                  originalName: 'foto2.png',
                  isCurrentCycle: true,
                  cycleNumber: 1,
                  createdAt: '2026-11-18T10:05:00.000Z',
                  uploadedBy: { name: 'Maria Souza' },
                  canDelete: true,
                },
              ],
              permissions: { canUpload: true, maxActiveImages: 10 },
            },
          }),
        };
      }
      if (url.includes('/content')) {
        return {
          ok: true,
          blob: async () => new Blob(['fake image data'], { type: 'image/jpeg' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<ImageGalleryPanel taskId="task-1" cycleVersion={1} />);

    expect(await screen.findByText(/Imagens da tarefa \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('2/10 no ciclo')).toBeInTheDocument();
  });

  it('permite abrir imagem ampliada (lightbox) e fechar com Escape', async () => {
    auth.request.mockImplementation(async (url: string) => {
      if (url === '/tasks/task-1/images') {
        return {
          ok: true,
          json: async () => ({
            data: {
              images: [
                {
                  id: 'img-1',
                  originalName: 'foto1.jpg',
                  isCurrentCycle: true,
                  cycleNumber: 1,
                  createdAt: '2026-11-18T10:00:00.000Z',
                  uploadedBy: { name: 'Maria Souza' },
                  canDelete: false,
                },
              ],
              permissions: { canUpload: true, maxActiveImages: 10 },
            },
          }),
        };
      }
      if (url.includes('/content')) {
        return {
          ok: true,
          blob: async () => new Blob(['fake image data'], { type: 'image/jpeg' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<ImageGalleryPanel taskId="task-1" cycleVersion={1} initialExpanded={true} />);

    const thumbnailBtn = await screen.findByRole('button', { name: /Ampliar imagem/i });
    fireEvent.click(thumbnailBtn);

    const dialog = screen.getByRole('dialog', { name: /Visualização ampliada/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Baixar imagem ampliada/i })).toBeInTheDocument();

    // Fechar com Escape
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Visualização ampliada/i })).not.toBeInTheDocument();
  });

  it('apresenta a área protegida e a pré-visualização antes do envio quando expandida', async () => {
    render(<ImageGalleryPanel taskId="task-1" cycleVersion={3} initialExpanded={true} />);
    await screen.findByText('Nenhuma imagem anexada.');
    const input = screen.getByLabelText(/Selecionar imagens/i);
    fireEvent.change(input, { target: { files: [new File(['png'], 'evidencia.png', { type: 'image/png' })] } });
    expect(screen.getByAltText('Pré-visualização de evidencia.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar 1 imagem/i })).toBeInTheDocument();
  });

  it('informa validação de extensão e tamanho antes do upload', async () => {
    render(<ImageGalleryPanel taskId="task-1" cycleVersion={3} initialExpanded={true} />);
    await screen.findByText('Nenhuma imagem anexada.');
    const input = screen.getByLabelText(/Selecionar imagens/i);
    fireEvent.change(input, { target: { files: [new File(['pdf'], 'documento.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Use somente JPG/i));
    expect(auth.upload).not.toHaveBeenCalled();
  });
});

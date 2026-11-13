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
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('apresenta a área protegida e a pré-visualização antes do envio', async () => {
    render(<ImageGalleryPanel taskId="task-1" cycleVersion={3} />);
    await screen.findByText('Nenhuma imagem anexada.');
    const input = screen.getByLabelText(/Selecionar imagens/i);
    fireEvent.change(input, { target: { files: [new File(['png'], 'evidencia.png', { type: 'image/png' })] } });
    expect(screen.getByAltText('Pré-visualização de evidencia.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar 1 imagem/i })).toBeInTheDocument();
  });

  it('informa validação de extensão e tamanho antes do upload', async () => {
    render(<ImageGalleryPanel taskId="task-1" cycleVersion={3} />);
    await screen.findByText('Nenhuma imagem anexada.');
    const input = screen.getByLabelText(/Selecionar imagens/i);
    fireEvent.change(input, { target: { files: [new File(['pdf'], 'documento.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Use somente JPG/i));
    expect(auth.upload).not.toHaveBeenCalled();
  });
});

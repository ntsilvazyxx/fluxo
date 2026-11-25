import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from './UsersPage.tsx';

const authMock = {
  user: { id: 'admin-1', name: 'Admin', role: { code: 'ADMIN_MASTER', label: 'Admin Master' } },
  request: vi.fn(),
  logout: vi.fn(),
};

vi.mock('../auth/AuthContext.tsx', () => ({
  useAuth: () => authMock,
}));

describe('UsersPage — Padronização de Perfis em Português e RBAC (Prompt 54)', () => {
  const mockUsers = [
    { id: '1', name: 'Carlos Admin', email: 'carlos@seaf.mt.gov.br', isActive: true, role: { code: 'ADMIN_MASTER', label: 'Administrador Master' } },
    { id: '2', name: 'Sofia Secretária', email: 'sofia@seaf.mt.gov.br', isActive: true, role: { code: 'SECRETARY', label: 'Secretaria' } },
    { id: '3', name: 'Tiago Técnico', email: 'tiago@seaf.mt.gov.br', isActive: true, role: { code: 'TECHNICIAN', label: 'Tecnico' } },
    { id: '4', name: 'Marcos Gestor', email: 'marcos@seaf.mt.gov.br', isActive: false, role: { code: 'MANAGER', label: 'Gestor' } },
  ];

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = { id: 'admin-1', name: 'Admin', role: { code: 'ADMIN_MASTER', label: 'Admin Master' } };
    authMock.request.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { users: mockUsers } }),
    });
  });

  it('1. Listagem de usuários exibe os 4 perfis padronizados em português com grafia e acentuação corretas', async () => {
    render(<UsersPage />);

    expect(await screen.findByText('Carlos Admin')).toBeInTheDocument();
    expect(screen.getByText('Sofia Secretária')).toBeInTheDocument();
    expect(screen.getByText('Tiago Técnico')).toBeInTheDocument();
    expect(screen.getByText('Marcos Gestor')).toBeInTheDocument();

    // Badges/informações com a nomenclatura oficial padronizada
    expect(screen.getByText(/Admin Master · Ativo/)).toBeInTheDocument();
    expect(screen.getByText(/Secretário · Ativo/)).toBeInTheDocument();
    expect(screen.getByText(/Técnico · Ativo/)).toBeInTheDocument();
    expect(screen.getByText(/Gestor · Inativo/)).toBeInTheDocument();

    // Nenhum identificador técnico em inglês deve ser exibido na listagem
    expect(screen.queryByText(/ADMIN_MASTER/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SECRETARY/)).not.toBeInTheDocument();
    expect(screen.queryByText(/TECHNICIAN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MANAGER/)).not.toBeInTheDocument();
  });

  it('2. ADMIN_MASTER visualiza no seletor todos os 4 perfis na ordem canônica oficial', async () => {
    render(<UsersPage />);
    await screen.findByText('Carlos Admin');

    fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));

    const select = screen.getByLabelText('Perfil') as HTMLSelectElement;
    expect(select).toBeInTheDocument();

    const options = Array.from(select.options);
    expect(options).toHaveLength(4);

    // Ordem canônica exata exigida:
    // 1. Admin Master
    // 2. Secretário
    // 3. Técnico
    // 4. Gestor
    expect(options[0].textContent).toBe('Admin Master');
    expect(options[0].value).toBe('ADMIN_MASTER');

    expect(options[1].textContent).toBe('Secretário');
    expect(options[1].value).toBe('SECRETARY');

    expect(options[2].textContent).toBe('Técnico');
    expect(options[2].value).toBe('TECHNICIAN');

    expect(options[3].textContent).toBe('Gestor');
    expect(options[3].value).toBe('MANAGER');
  });

  it('3. SECRETARY visualiza no seletor somente os perfis autorizados (Técnico e Gestor) na ordem canônica', async () => {
    authMock.user = { id: 'sec-1', name: 'Secretária', role: { code: 'SECRETARY', label: 'Secretário' } };

    render(<UsersPage />);
    await screen.findByText('Carlos Admin');

    fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));

    const select = screen.getByLabelText('Perfil') as HTMLSelectElement;
    const options = Array.from(select.options);

    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe('Técnico');
    expect(options[0].value).toBe('TECHNICIAN');

    expect(options[1].textContent).toBe('Gestor');
    expect(options[1].value).toBe('MANAGER');

    // Não deve conter Admin Master ou Secretário
    expect(options.some((o) => o.value === 'ADMIN_MASTER')).toBe(false);
    expect(options.some((o) => o.value === 'SECRETARY')).toBe(false);
  });

  it('4. Submissão do formulário exibe nomes em português mas envia identificador técnico ao backend', async () => {
    render(<UsersPage />);
    await screen.findByText('Carlos Admin');

    fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo Técnico Teste' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'novo.tecnico@seaf.mt.gov.br' } });
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'SenhaForte#2026' } });
    fireEvent.change(screen.getByLabelText('Perfil'), { target: { value: 'TECHNICIAN' } });

    authMock.request.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          user: {
            id: '5',
            name: 'Novo Técnico Teste',
            email: 'novo.tecnico@seaf.mt.gov.br',
            isActive: true,
            role: { code: 'TECHNICIAN', label: 'Técnico' },
          },
        },
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(authMock.request).toHaveBeenCalledWith(
        '/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'Novo Técnico Teste',
            email: 'novo.tecnico@seaf.mt.gov.br',
            password: 'SenhaForte#2026',
            roleCode: 'TECHNICIAN',
          }),
        }),
      );
    });
  });

  it('inativa com PATCH, envia a justificativa e atualiza a listagem sem recarregá-la', async () => {
    render(<UsersPage />);
    await screen.findByText('Carlos Admin');
    authMock.request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { user: { ...mockUsers[0], isActive: false } } }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Inativar Carlos Admin' }));
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Desligamento confirmado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inativar usuário' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Inativar usuário' })).not.toBeInTheDocument());
    expect(screen.getByText(/Admin Master · Inativo/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Usuário inativado');
    expect(authMock.request).toHaveBeenNthCalledWith(2, '/users/1', {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false, reason: 'Desligamento confirmado' }),
    });
    expect(authMock.request).toHaveBeenCalledTimes(2);
  });

  it('preserva a justificativa e mostra o erro HTTP retornado pelo backend', async () => {
    render(<UsersPage />);
    await screen.findByText('Carlos Admin');
    authMock.request.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'A justificativa precisa ser mais detalhada.' } }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Inativar Carlos Admin' }));
    const reason = screen.getByLabelText('Justificativa') as HTMLTextAreaElement;
    fireEvent.change(reason, { target: { value: 'Motivo teste' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inativar usuário' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A justificativa precisa ser mais detalhada.');
    expect(reason.value).toBe('Motivo teste');
    expect(screen.getByRole('dialog', { name: 'Inativar usuário' })).toBeInTheDocument();
  });

  it('trata falha de rede como resultado incerto e consulta o estado sem repetir o PATCH', async () => {
    render(<UsersPage />);
    await screen.findByText('Carlos Admin');
    authMock.request.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    fireEvent.click(screen.getByRole('button', { name: 'Inativar Carlos Admin' }));
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Motivo de teste isolado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inativar usuário' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('falha de conexão');
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();

    authMock.request.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { user: { ...mockUsers[0], isActive: false } } }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar situação atual' }));

    expect(await screen.findByRole('status')).toHaveTextContent('A consulta confirmou que o usuário foi inativado.');
    expect(screen.getByText(/Admin Master · Inativo/)).toBeInTheDocument();
    expect(authMock.request).toHaveBeenNthCalledWith(3, '/users/1');
    expect(authMock.request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
  });

  it('bloqueia submissão duplicada enquanto a alteração está em andamento', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => { resolveRequest = resolve; });
    render(<UsersPage />);
    await screen.findByText('Carlos Admin');
    authMock.request.mockReturnValueOnce(pending);

    fireEvent.click(screen.getByRole('button', { name: 'Inativar Carlos Admin' }));
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Motivo de teste isolado' } });
    const submit = screen.getByRole('button', { name: 'Inativar usuário' });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);

    expect(authMock.request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
    resolveRequest({ ok: true, status: 200, json: async () => ({ data: { user: { ...mockUsers[0], isActive: false } } }) });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Inativar usuário' })).not.toBeInTheDocument());
  });

  it('não oferece inativação da própria conta na interface', async () => {
    authMock.user = { id: '1', name: 'Carlos Admin', role: { code: 'ADMIN_MASTER', label: 'Admin Master' } };
    render(<UsersPage />);
    await screen.findByText('Carlos Admin');
    expect(screen.queryByRole('button', { name: 'Inativar Carlos Admin' })).not.toBeInTheDocument();
  });
});

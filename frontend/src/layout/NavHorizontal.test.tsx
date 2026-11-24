import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header.tsx';

const auth = vi.hoisted(() => ({
  request: vi.fn(),
  logout: vi.fn(),
  user: null as { id: string; name: string; role: { code: string; label?: string } } | null,
  features: { adminTaskCreation: false },
}));

vi.mock('../auth/AuthContext.tsx', () => ({
  useAuth: () => auth,
}));

afterEach(cleanup);

describe('Navegação Horizontal — Header e NavHorizontal', () => {
  beforeEach(() => {
    auth.user = {
      id: 'user-1',
      name: 'Nathan Silva',
      role: { code: 'ADMIN_MASTER', label: 'Administrador Master' },
    };
    auth.request.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { notifications: [], meta: { unread: 0 } } }),
    });
  });

  const renderNav = (route = '/kanban') =>
    render(
      <MemoryRouter initialEntries={[route]}>
        <Header />
      </MemoryRouter>,
    );

  it('exibe a área superior com identificação do SEAF, logotipo, subtítulo e dados do usuário', () => {
    renderNav();

    expect(screen.getByRole('img', { name: /SEAF/i })).toBeInTheDocument();
    expect(screen.getByText('SEAF')).toBeInTheDocument();
    expect(screen.getByText('Gestão de tarefas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Notificações/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sair/i })).toBeInTheDocument();
    expect(screen.getByText('Nathan Silva')).toBeInTheDocument();
    expect(screen.getByText('Administrador Master')).toBeInTheDocument();
  });

  it('renderiza navegação estritamente horizontal sem sidebar vertical', () => {
    const { container } = renderNav();

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(nav).toBeInTheDocument();
    expect(container.querySelector('aside')).toBeNull();
  });

  it('destaca a rota ativa com aria-current="page"', () => {
    renderNav('/kanban');

    const kanbanLink = screen.getByRole('link', { name: 'Kanban' });
    expect(kanbanLink).toHaveAttribute('aria-current', 'page');

    const arquivadasLink = screen.getByRole('link', { name: 'Arquivadas' });
    expect(arquivadasLink).not.toHaveAttribute('aria-current', 'page');
  });

  it('organiza o cabeçalho em duas barras horizontais com a navegação dedicada e centralizada', () => {
    const { container } = renderNav();

    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();

    // Primeira barra — institucional (identificação e usuário nas extremidades)
    const institutionalBar = header?.firstElementChild;
    expect(institutionalBar).toHaveClass('flex', 'items-center', 'justify-between');

    // Segunda barra — sub-barra dedicada de navegação centralizada
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(nav).toHaveClass('flex', 'justify-center');

    const navList = nav.querySelector('ul');
    expect(navList).toHaveClass('flex', 'items-center', 'justify-center');
  });

  describe('RBAC e opções por perfil', () => {
    it('TECHNICIAN visualiza exclusivamente Kanban, Arquivadas e Equipes (sem Minhas Tarefas, sem Usuários, sem Dashboard e sem Relatórios)', () => {
      auth.user = {
        id: 'tech-1',
        name: 'Técnico Silva',
        role: { code: 'TECHNICIAN', label: 'Técnico' },
      };
      renderNav();

      const links = screen.getAllByRole('link').map((node) => node.textContent?.trim());
      expect(links).toContain('Kanban');
      expect(links).toContain('Arquivadas');
      expect(links).toContain('Equipes');

      expect(links).not.toContain('Minhas Tarefas');
      expect(links).not.toContain('Dashboard');
      expect(links).not.toContain('Relatórios');
      expect(links).not.toContain('Usuários');
      expect(links).not.toContain('Calendário');
    });

    it('MANAGER visualiza Kanban, Arquivadas e Equipes (sem Minhas Tarefas, sem Usuários, sem Dashboard e sem Relatórios)', () => {
      auth.user = {
        id: 'mgr-1',
        name: 'Gestor Silva',
        role: { code: 'MANAGER', label: 'Gestor' },
      };
      renderNav();

      const links = screen.getAllByRole('link').map((node) => node.textContent?.trim());
      expect(links).toContain('Kanban');
      expect(links).toContain('Arquivadas');
      expect(links).toContain('Equipes');

      expect(links).not.toContain('Dashboard');
      expect(links).not.toContain('Relatórios');
      expect(links).not.toContain('Minhas Tarefas');
      expect(links).not.toContain('Usuários');
    });

    it('SECRETARY visualiza Kanban, Arquivadas, Usuários e Equipes (sem Dashboard e sem Relatórios)', () => {
      auth.user = {
        id: 'sec-1',
        name: 'Secretária Silva',
        role: { code: 'SECRETARY', label: 'Secretário' },
      };
      renderNav();

      const links = screen.getAllByRole('link').map((node) => node.textContent?.trim());
      expect(links).toContain('Kanban');
      expect(links).toContain('Arquivadas');
      expect(links).toContain('Usuários');
      expect(links).toContain('Equipes');

      expect(links).not.toContain('Dashboard');
      expect(links).not.toContain('Relatórios');
      expect(links).not.toContain('Minhas Tarefas');
    });

    it('ADMIN_MASTER visualiza Kanban, Arquivadas, Usuários e Equipes (sem Dashboard e sem Relatórios)', () => {
      auth.user = {
        id: 'admin-1',
        name: 'Admin Silva',
        role: { code: 'ADMIN_MASTER', label: 'Administrador Master' },
      };
      renderNav();

      const links = screen.getAllByRole('link').map((node) => node.textContent?.trim());
      expect(links).toContain('Kanban');
      expect(links).toContain('Arquivadas');
      expect(links).toContain('Usuários');
      expect(links).toContain('Equipes');

      expect(links).not.toContain('Dashboard');
      expect(links).not.toContain('Relatórios');
      expect(links).not.toContain('Minhas Tarefas');
    });
  });
});

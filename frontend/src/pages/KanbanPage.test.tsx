import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KanbanPage } from './KanbanPage.tsx';
const auth = vi.hoisted(() => ({ request: vi.fn(), user: null, features: { adminTaskCreation: false } }));
vi.mock('../auth/AuthContext.tsx', () => ({ useAuth: () => auth }));
const task = (id, title, status = 'AWAITING_ACCEPTANCE') => ({ id, publicNumber: id, team: { name: 'Equipe autorizada' }, cycle: { title, status, priority: 'NORMAL', deadlineAt: '2027-01-04T12:00:00Z', assignment: { userId: 'self', user: { name: 'Responsável de teste' } } } });
const response = (tasks, page = 1, total = tasks.length) => ({ ok: true, json: async () => ({ data: { tasks }, meta: { page, pageSize: 100, total, totalPages: Math.ceil(total / 100) } }) });
const open = (entry = '/kanban') => render(<MemoryRouter initialEntries={[entry]}><KanbanPage /></MemoryRouter>);
afterEach(cleanup);
beforeEach(() => {
  auth.user = { id: 'self', role: { code: 'MANAGER' } };
  auth.features = { adminTaskCreation: false };
  auth.request.mockReset().mockImplementation(async (path) => {
    if (path.startsWith('/my-tasks')) return response([task('1', 'Entrega pessoal'), task('2', 'Entrega concluída', 'COMPLETED')]);
    if (path.startsWith('/kanban')) return response([task('1', 'Entrega pessoal'), task('3', 'Entrega da equipe', 'PENDING')]);
    return { ok: true, json: async () => ({ data: { teams: [{ id: 'team', name: 'Equipe autorizada' }], users: [{ id: 'self', name: 'Responsável de teste' }] } }) };
  });
});
describe('Kanban unificado', () => {
  it('Gestor tem quatro colunas e duas referências ao mesmo registro pessoal, sem escrita', async () => {
    open();
    await screen.findByRole('heading', { name: 'Entrega da equipe' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(['Minhas tarefas', 'Pendente', 'Aguardando aceite', 'Em andamento']);
    const copies = screen.getAllByRole('link', { name: 'Abrir tarefa #1: Entrega pessoal' });
    expect(copies).toHaveLength(2); expect(copies[0].getAttribute('href')).toBe(copies[1].getAttribute('href'));
    expect(auth.request.mock.calls.every((call) => call.length === 1)).toBe(true);
    expect(auth.request.mock.calls.some(([path]) => ['/teams', '/users'].includes(path))).toBe(false);
  });
  it('TECHNICIAN consulta somente tarefas pessoais e não recebe controles gerenciais', async () => {
    auth.user.role.code = 'TECHNICIAN'; open();
    await screen.findByRole('heading', { name: 'Entrega concluída' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(['Minhas tarefas']);
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(screen.queryByRole('combobox', { name: 'Equipe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Responsável' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova tarefa' })).not.toBeInTheDocument();
    expect(auth.request.mock.calls.every(([path]) => path.startsWith('/my-tasks?'))).toBe(true);
  });
  it('ADMIN_MASTER possui Kanban global e controles gerenciais sem criar tarefa por padrão', async () => {
    auth.user.role.code = 'ADMIN_MASTER'; open();
    await screen.findByRole('heading', { name: 'Entrega da equipe' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(['Minhas tarefas', 'Pendente', 'Aguardando aceite', 'Em andamento']);
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    expect(screen.getByRole('combobox', { name: 'Equipe' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova tarefa' })).not.toBeInTheDocument();
    expect(auth.request.mock.calls.some(([path]) => path.startsWith('/kanban?'))).toBe(true);
  });
  it('ADMIN_MASTER acessa a criação de tarefa somente com o recurso não produtivo habilitado', async () => {
    auth.user.role.code = 'ADMIN_MASTER';
    auth.features = { adminTaskCreation: true };
    open();
    await screen.findByRole('heading', { name: 'Entrega da equipe' });
    expect(screen.getByRole('link', { name: 'Nova tarefa' })).toBeInTheDocument();
  });
  it('filtros avançados são recolhidos, controlados e limpos nas duas consultas', async () => {
    open(); await screen.findByRole('heading', { name: 'Entrega da equipe' });
    expect(screen.queryByRole('combobox', { name: 'Prioridade' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    await screen.findByRole('option', { name: 'Equipe autorizada' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Equipe' }), { target: { value: 'team' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Prioridade' }), { target: { value: 'HIGH' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar tarefas' }), { target: { value: 'Entrega' } });
    await waitFor(() => expect(auth.request.mock.calls.some(([path]) => path.startsWith('/my-tasks?') && path.includes('teamId=team') && path.includes('priority=HIGH') && path.includes('search=Entrega'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByRole('textbox', { name: 'Buscar tarefas' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Equipe' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Prioridade' })).toHaveValue('');
  });
  it('paginação pessoal independe da página gerencial e links preservam filtros', async () => {
    auth.request.mockImplementation(async (path) => response([task('1', 'Entrega paginada')], Number(new URLSearchParams(path.split('?')[1]).get('page')), 201));
    open('/kanban?priority=HIGH');
    await screen.findAllByRole('heading', { name: 'Entrega paginada' });
    expect(screen.getAllByRole('link', { name: 'Abrir tarefa #1: Entrega paginada' })[0]).toHaveAttribute('href', '/kanban/tarefas/1?priority=HIGH');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página: Tarefas pessoais' }));
    await waitFor(() => expect(within(screen.getByRole('navigation', { name: 'Paginação: Tarefas pessoais' })).getByText(/página 2 de 3/)).toBeInTheDocument());
    expect(within(screen.getByRole('navigation', { name: 'Paginação: Fluxo das equipes' })).getByText(/página 1 de 3/)).toBeInTheDocument();
  });
  it('resposta lenta de busca anterior não substitui o resultado atual', async () => {
    let finish;
    auth.user.role.code = 'TECHNICIAN';
    auth.request.mockImplementation(async (path) => path.includes('search=antiga') ? new Promise((resolve) => { finish = resolve; }) : response([task('9', path.includes('search=nova') ? 'Resultado novo' : 'Inicial')]));
    open(); await screen.findByRole('heading', { name: 'Inicial' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar tarefas' }), { target: { value: 'antiga' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar tarefas' }), { target: { value: 'nova' } });
    await screen.findByRole('heading', { name: 'Resultado novo' });
    finish(response([task('8', 'Resultado obsoleto')]));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Resultado obsoleto' })).not.toBeInTheDocument());
  });
});

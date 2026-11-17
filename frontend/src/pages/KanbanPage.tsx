import { ChevronLeft, ChevronRight, Filter, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { EmptyTasks, TaskCard } from '../tasks/task-ui.tsx';
import { useTasks } from '../tasks/useTasks.ts';
import { kanbanColumns, kanbanFilterKeys, taskQuery } from '../tasks/kanban.ts';

export function KanbanPage() {
  const { request, user, features } = useAuth();
  const location = useLocation();
  const isMyTasksRoute = location.pathname.startsWith('/minhas-tarefas');
  const managerial = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER'].includes(user.role.code);
  const canCreateTask = user.role.code === 'ADMIN_MASTER' ? features?.adminTaskCreation === true : managerial;
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(kanbanFilterKeys.map((key) => [key, params.get(key) ?? '']));
  const [expanded, setExpanded] = useState(false);
  const [options, setOptions] = useState({ teams: [], users: [], error: '' });
  const boardRef = useRef<HTMLDivElement | null>(null);

  const personal = useTasks(taskQuery('/my-tasks', filters, pageNumber(params.get('personalPage'))));
  const operational = useTasks(!isMyTasksRoute && managerial ? taskQuery('/kanban', filters, pageNumber(params.get('teamPage'))) : null);
  const completedOperational = useTasks(!isMyTasksRoute && managerial ? taskQuery('/task-history', { ...filters, status: 'COMPLETED' }, pageNumber(params.get('completedPage'))) : null);

  const active = Object.values(filters).filter(Boolean).length;
  const scrollKey = `seaf-kanban:${user.id}:${params.toString()}`;

  useEffect(() => {
    if (!managerial || !expanded) return;
    let cancelled = false;
    const load = async () => {
      try {
        const responses = await Promise.all([request('/teams'), request('/users')]);
        const [teams, users] = await Promise.all(responses.map((response) => response.json()));
        if (responses.some((response) => !response.ok)) throw new Error('Não foi possível carregar as opções de filtros.');
        if (!cancelled) setOptions({ teams: teams.data.teams, users: users.data.users, error: '' });
      } catch (cause: any) {
        if (!cancelled) setOptions((s) => ({ ...s, error: cause.message }));
      }
    };
    load();
    return () => { cancelled = true; };
  }, [expanded, managerial, request]);

  useEffect(() => {
    try {
      if (boardRef.current) boardRef.current.scrollLeft = Number(sessionStorage.getItem(scrollKey) ?? 0);
    } catch {
      /* Storage can be disabled */
    }
  }, [scrollKey]);

  const change = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, String(value)); else next.delete(name);
      next.delete('personalPage'); next.delete('teamPage'); next.delete('completedPage');
      return next;
    }, { replace: true });
  };

  const pagination = (key: string, page: number) => setParams((current) => {
    const next = new URLSearchParams(current); next.set(key, String(page)); return next;
  });

  const search = params.toString() ? `?${params}` : '';

  // Combina e deduplica as tarefas autorizadas
  const rawTasks = isMyTasksRoute
    ? (personal.tasks || []).filter((task: any) => task.cycle?.assignment?.userId === user.id)
    : managerial
      ? [
          ...(operational.tasks || []),
          ...(completedOperational?.tasks || []),
          ...(personal.tasks || []),
        ]
      : (personal.tasks || []);

  const tasksMap = new Map<string, any>();
  for (const task of rawTasks) {
    if (task?.id && !tasksMap.has(task.id)) {
      tasksMap.set(task.id, task);
    }
  }
  const allTasks = Array.from(tasksMap.values());

  const columns = kanbanColumns.map(([status, label]) => ({
    status,
    label,
    items: allTasks.filter((task) => task.cycle?.status === status),
  }));

  const isSearchActive = Boolean(filters.search && filters.search.trim());
  const pendingSearchResults = isSearchActive && managerial && !isMyTasksRoute
    ? allTasks.filter((task) => task.cycle?.status === 'PENDING')
    : [];

  const isLoading = personal.loading || (managerial && !isMyTasksRoute && (operational.loading || completedOperational?.loading));
  const errorMessage = personal.error || operational.error || completedOperational?.error;
  const reloadAll = () => {
    personal.reload();
    operational.reload();
    completedOperational?.reload();
  };

  const filterStatusOptions = kanbanColumns;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-brand-700">
            {isMyTasksRoute ? 'Execução pessoal' : managerial ? 'Acompanhamento e execução' : 'Acompanhamento e execução pessoal'}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">
            {isMyTasksRoute ? 'Minhas tarefas' : 'Kanban de tarefas'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            {isMyTasksRoute
              ? 'Tarefas sob sua responsabilidade direta atual. Abra um cartão para responder ou executar.'
              : managerial
                ? 'Acompanhamento operacional das tarefas organizadas por fluxo de execução.'
                : 'Tarefas e entregas autorizadas organizadas por fluxo de execução.'}
          </p>
        </div>
        {canCreateTask && (
          <Link to="/tarefas/nova" className="action-primary">
            <Plus size={18} />
            Nova tarefa
          </Link>
        )}
      </div>

      <section aria-label="Filtros do Kanban" className="mt-5 rounded-xl border border-border bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 basis-48 flex-1">
            <Search aria-hidden="true" size={17} className="absolute left-3 top-3.5 text-muted" />
            <input
              aria-label="Buscar tarefas"
              className="field pl-9"
              name="search"
              value={filters.search}
              onChange={change}
              placeholder="ID ou título da tarefa"
            />
          </label>
          <button
            className="action-secondary"
            aria-expanded={expanded}
            aria-controls="kanban-advanced-filters"
            onClick={() => setExpanded(!expanded)}
          >
            <Filter size={17} />
            Filtros
            {active > 0 && (
              <span aria-label={`${active} filtros ativos`} className="rounded-full bg-brand-100 px-2 py-0.5 text-xs">
                {active}
              </span>
            )}
          </button>
          {active > 0 && (
            <button
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted"
              onClick={() => setParams({}, { replace: true })}
            >
              <X size={16} />
              Limpar filtros
            </button>
          )}
        </div>
        {expanded && (
          <div id="kanban-advanced-filters" className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-3">
            {managerial && !isMyTasksRoute && (
              <>
                <FilterSelect label="Equipe" name="teamId" value={filters.teamId} change={change}>
                  <option value="">Todas as equipes autorizadas</option>
                  {options.teams.map((team: any) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </FilterSelect>
                <FilterSelect label="Responsável" name="responsibleId" value={filters.responsibleId} change={change}>
                  <option value="">Todos os responsáveis autorizados</option>
                  {options.users.map((person: any) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </FilterSelect>
              </>
            )}
            <FilterSelect label="Prioridade" name="priority" value={filters.priority} change={change}>
              <option value="">Todas as prioridades</option>
              {[
                ['LOW', 'Baixa'],
                ['NORMAL', 'Normal'],
                ['HIGH', 'Alta'],
                ['URGENT', 'Urgente'],
              ].map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={filters.status} change={change}>
              <option value="">Todos os status</option>
              {filterStatusOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Situação de atraso" name="overdue" value={filters.overdue} change={change}>
              <option value="">Todos os prazos</option>
              <option value="true">Atrasadas</option>
              <option value="false">No prazo</option>
            </FilterSelect>
            <label className="text-xs font-bold text-muted">
              Prazo até
              <input className="field mt-1" name="deadlineTo" type="date" value={filters.deadlineTo} onChange={change} />
            </label>
            {options.error && <p role="alert" className="text-sm text-danger">{options.error}</p>}
          </div>
        )}
      </section>

      {/* Resultados de tarefas PENDING quando houver busca ativa */}
      {pendingSearchResults.length > 0 && (
        <section
          aria-label="Tarefas pendentes encontradas na busca"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 sm:p-4 text-text shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              <h3 className="text-xs sm:text-sm font-bold text-amber-950">
                {pendingSearchResults.length === 1
                  ? '1 tarefa pendente de atribuição encontrada nesta busca:'
                  : `${pendingSearchResults.length} tarefas pendentes de atribuição encontradas nesta busca:`}
              </h3>
            </div>
            <span className="text-xs text-amber-800">
              Acesse para definir responsável e prazo
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {pendingSearchResults.map((task: any) => (
              <Link
                key={task.id}
                to={`/kanban/tarefas/${task.id}${search}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 hover:border-amber-400 focus-visible:outline-2 focus-visible:outline-amber-600"
                aria-label={`Abrir tarefa pendente #${task.publicNumber}: ${task.cycle?.title || task.title}`}
              >
                <span className="font-bold text-amber-700">#{task.publicNumber}</span>
                <span className="max-w-[240px] truncate">{task.cycle?.title || task.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Três colunas oficiais do Kanban */}
      <div
        ref={boardRef}
        role="region"
        aria-label="Colunas do Kanban"
        tabIndex={0}
        className="kanban-board-container mt-5 rounded-xl pb-3 no-scrollbar focus-visible:outline-2 focus-visible:outline-brand-700"
        onScroll={(event) => {
          try {
            sessionStorage.setItem(scrollKey, String(event.currentTarget.scrollLeft));
          } catch {
            /* Optional UI persistence */
          }
        }}
      >
        <div className="kanban-board">
          {columns.map(({ status, label, items }) => (
            <section
              aria-label={label}
              key={status}
              className="flex flex-col min-w-0 rounded-xl border border-border bg-slate-100/80 p-3 sm:p-4"
            >
              <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
                <h2 className="text-sm font-extrabold">{label}</h2>
                <span
                  aria-label={`${items.length} cartões nesta coluna`}
                  className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-brand-900 shadow-xs"
                >
                  {isLoading && allTasks.length === 0 ? '…' : items.length}
                </span>
              </div>
              {errorMessage ? (
                <div role="alert" className="rounded-lg bg-white p-3 text-sm text-danger">
                  <p>{errorMessage}</p>
                  <button className="action-secondary mt-2" onClick={reloadAll}>Tentar novamente</button>
                </div>
              ) : isLoading && allTasks.length === 0 ? (
                <p role="status" className="p-3 text-sm text-muted">Carregando…</p>
              ) : (
                <div className="space-y-3 flex-1">
                  {items.map((task) => (
                    <TaskCard task={task} key={task.id} compact personal={isMyTasksRoute || !managerial} search={search} />
                  ))}
                  {items.length === 0 && <EmptyTasks />}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      <PageControls
        source={managerial && !isMyTasksRoute ? operational : personal}
        label={managerial && !isMyTasksRoute ? 'Fluxo das equipes' : 'Tarefas pessoais'}
        onPage={(page) => pagination(managerial && !isMyTasksRoute ? 'teamPage' : 'personalPage', page)}
      />
      <p className="mt-2 text-xs text-muted">
        Contagens por página. Cartões abrem os detalhes e as ações permitidas.
      </p>
    </div>
  );
}

function pageNumber(value: string | null) {
  return /^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 1;
}

function FilterSelect({ label, name, value, change, children }: any) {
  return (
    <label className="text-xs font-bold text-muted">
      {label}
      <select className="field mt-1" name={name} value={value} onChange={change}>
        {children}
      </select>
    </label>
  );
}

function PageControls({ source, label, onPage }: any) {
  if (!source?.meta || source.meta.totalPages <= 1) return null;
  return (
    <nav aria-label={`Paginação: ${label}`} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <p>{label}: página {source.meta.page} de {source.meta.totalPages} · {source.meta.total} registros</p>
      <div className="flex gap-1">
        <button
          aria-label={`Página anterior: ${label}`}
          className="action-secondary px-2"
          disabled={source.loading || source.meta.page <= 1}
          onClick={() => onPage(source.meta.page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          aria-label={`Próxima página: ${label}`}
          className="action-secondary px-2"
          disabled={source.loading || source.meta.page >= source.meta.totalPages}
          onClick={() => onPage(source.meta.page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </nav>
  );
}

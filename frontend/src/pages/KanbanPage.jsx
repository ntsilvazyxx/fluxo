import { ChevronLeft, ChevronRight, Filter, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { EmptyTasks, TaskCard } from '../tasks/task-ui.jsx';
import { useTasks } from '../tasks/useTasks.js';
import { kanbanFilterKeys, operationalColumns, personalColumns, taskQuery } from '../tasks/kanban.js';

export function KanbanPage() {
  const { request, user } = useAuth();
  const managerial = ['SECRETARY', 'MANAGER'].includes(user.role.code);
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(kanbanFilterKeys.map((key) => [key, params.get(key) ?? '']));
  const [expanded, setExpanded] = useState(false);
  const [options, setOptions] = useState({ teams: [], users: [], error: '' });
  const boardRef = useRef(null);
  const personal = useTasks(taskQuery('/my-tasks', filters, pageNumber(params.get('personalPage'))));
  const operational = useTasks(managerial ? taskQuery('/kanban', filters, pageNumber(params.get('teamPage'))) : null);
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
      } catch (cause) { if (!cancelled) setOptions((s) => ({ ...s, error: cause.message })); }
    };
    load();
    return () => { cancelled = true; };
  }, [expanded, managerial, request]);
  useEffect(() => {
    try { if (boardRef.current) boardRef.current.scrollLeft = Number(sessionStorage.getItem(scrollKey) ?? 0); } catch { /* Storage can be disabled. */ }
  }, [scrollKey]);

  const change = (event) => {
    const { name, value } = event.target;
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value); else next.delete(name);
      next.delete('personalPage'); next.delete('teamPage');
      return next;
    }, { replace: true });
  };
  const pagination = (key, page) => setParams((current) => {
    const next = new URLSearchParams(current); next.set(key, String(page)); return next;
  });
  const columns = managerial ? [['MINE', 'Minhas tarefas'], ...operationalColumns] : personalColumns;
  const search = params.toString() ? `?${params}` : '';

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-bold text-brand-700">{managerial ? 'Acompanhamento e execução' : 'Execução pessoal'}</p><h1 className="mt-1 text-3xl font-extrabold">Kanban de tarefas</h1><p className="mt-2 max-w-3xl text-sm text-muted">{managerial ? 'Suas atribuições e o fluxo das equipes autorizadas, no mesmo lugar.' : 'Somente suas atribuições e entregas. Abra um cartão para executar a tarefa e consultar seu histórico.'}</p></div>
      {managerial && <Link to="/tarefas/nova" className="action-primary"><Plus size={18} />Nova tarefa</Link>}
    </div>

    <section aria-label="Filtros do Kanban" className="mt-5 rounded-xl border border-border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 basis-48 flex-1"><Search aria-hidden="true" size={17} className="absolute left-3 top-3.5 text-muted" /><input aria-label="Buscar tarefas" className="field pl-9" name="search" value={filters.search} onChange={change} placeholder="ID ou título da tarefa" /></label>
        <button className="action-secondary" aria-expanded={expanded} aria-controls="kanban-advanced-filters" onClick={() => setExpanded(!expanded)}><Filter size={17} />Filtros{active > 0 && <span aria-label={`${active} filtros ativos`} className="rounded-full bg-brand-100 px-2 py-0.5 text-xs">{active}</span>}</button>
        {active > 0 && <button className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted" onClick={() => setParams({}, { replace: true })}><X size={16} />Limpar filtros</button>}
      </div>
      {expanded && <div id="kanban-advanced-filters" className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-3">
        {managerial && <>
          <FilterSelect label="Equipe" name="teamId" value={filters.teamId} change={change}><option value="">Todas as equipes autorizadas</option>{options.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</FilterSelect>
          <FilterSelect label="Responsável" name="responsibleId" value={filters.responsibleId} change={change}><option value="">Todos os responsáveis autorizados</option>{options.users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</FilterSelect>
        </>}
        <FilterSelect label="Prioridade" name="priority" value={filters.priority} change={change}><option value="">Todas as prioridades</option>{[['LOW', 'Baixa'], ['NORMAL', 'Normal'], ['HIGH', 'Alta'], ['URGENT', 'Urgente']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</FilterSelect>
        <FilterSelect label="Status" name="status" value={filters.status} change={change}><option value="">Todos os status</option>{[...operationalColumns, ['COMPLETED', 'Concluídas']].filter(([status]) => managerial || status !== 'PENDING').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</FilterSelect>
        <FilterSelect label="Situação de atraso" name="overdue" value={filters.overdue} change={change}><option value="">Todos os prazos</option><option value="true">Atrasadas</option><option value="false">No prazo</option></FilterSelect>
        <label className="text-xs font-bold text-muted">Prazo até<input className="field mt-1" name="deadlineTo" type="date" value={filters.deadlineTo} onChange={change} /></label>
        {options.error && <p role="alert" className="text-sm text-danger">{options.error}</p>}
      </div>}
    </section>

    <div ref={boardRef} role="region" aria-label="Colunas do Kanban" tabIndex="0" className="kanban-board mt-5 rounded-xl pb-3 focus-visible:outline-2 focus-visible:outline-brand-700" onScroll={(event) => { try { sessionStorage.setItem(scrollKey, String(event.currentTarget.scrollLeft)); } catch { /* Optional UI persistence. */ } }}>
      {columns.map(([status, label]) => {
        const mine = status === 'MINE' || !managerial;
        const source = mine ? personal : operational;
        const items = status === 'MINE' ? source.tasks : source.tasks.filter((task) => task.cycle?.status === status);
        return <section aria-label={label} key={status} className="min-w-0 rounded-xl border border-border bg-slate-100/80 p-3">
          <div className="mb-3 flex min-h-9 items-center justify-between gap-2"><h2 className="text-sm font-extrabold">{label}</h2><span aria-label={`${items.length} cartões nesta página`} className="rounded-full bg-white px-2 py-1 text-xs font-bold text-brand-900">{source.loading ? '…' : items.length}</span></div>
          {status === 'MINE' && <p className="mb-3 text-xs text-muted">Suas atribuições e entregas. O mesmo registro pode aparecer também no fluxo da equipe.</p>}
          {source.error ? <div role="alert" className="rounded-lg bg-white p-3 text-sm text-danger"><p>{source.error}</p><button className="action-secondary mt-2" onClick={source.reload}>Tentar novamente</button></div> : source.loading ? <p role="status" className="p-3 text-sm text-muted">Carregando…</p> : <div className="space-y-3">{items.map((task) => <TaskCard task={task} key={task.id} compact personal={mine} search={search} />)}{items.length === 0 && <EmptyTasks />}</div>}
          {status === 'MINE' && <PageControls source={personal} label="Tarefas pessoais" onPage={(page) => pagination('personalPage', page)} />}
        </section>;
      })}
    </div>
    <PageControls source={managerial ? operational : personal} label={managerial ? 'Fluxo das equipes' : 'Tarefas pessoais'} onPage={(page) => pagination(managerial ? 'teamPage' : 'personalPage', page)} />
    <p className="mt-2 text-xs text-muted">Contagens por página. Use as setas para percorrer as colunas em telas menores; cartões abrem os detalhes e as ações permitidas.</p>
  </div>;
}

function pageNumber(value) { return /^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 1; }
function FilterSelect({ label, name, value, change, children }) { return <label className="text-xs font-bold text-muted">{label}<select className="field mt-1" name={name} value={value} onChange={change}>{children}</select></label>; }
function PageControls({ source, label, onPage }) {
  if (!source.meta || source.meta.totalPages <= 1) return null;
  return <nav aria-label={`Paginação: ${label}`} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><p>{label}: página {source.meta.page} de {source.meta.totalPages} · {source.meta.total} registros</p><div className="flex gap-1"><button aria-label={`Página anterior: ${label}`} className="action-secondary px-2" disabled={source.loading || source.meta.page <= 1} onClick={() => onPage(source.meta.page - 1)}><ChevronLeft size={17} /></button><button aria-label={`Próxima página: ${label}`} className="action-secondary px-2" disabled={source.loading || source.meta.page >= source.meta.totalPages} onClick={() => onPage(source.meta.page + 1)}><ChevronRight size={17} /></button></div></nav>;
}

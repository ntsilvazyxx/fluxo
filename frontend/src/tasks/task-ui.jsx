import { AlertTriangle, CalendarClock, Circle, CircleCheck, Clock3, MoreHorizontal, UserRound } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
const statusLabels={PENDING:'Pendente',AWAITING_ACCEPTANCE:'Aguardando aceite',IN_PROGRESS:'Em andamento',COMPLETED:'Concluída',CANCELLED:'Cancelada'};
const priorityLabels={LOW:'Baixa',NORMAL:'Normal',HIGH:'Alta',URGENT:'Urgente'};
export function StatusBadge({status}){return <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-900"><Circle size={10} fill="currentColor"/>{statusLabels[status]}</span>}
export function PriorityBadge({priority}){const danger=priority==='URGENT';return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${danger?'bg-red-50 text-danger':'bg-slate-100 text-muted'}`}>{priorityLabels[priority]}</span>}
export function TaskCard({ task, compact = false, personal = false, search = '' }) {
  const c = task.cycle;
  const menu = useRef(null);
  const target = `/kanban/tarefas/${task.id}${search}`;
  return <article data-task-id={task.id} className="relative min-w-0 rounded-xl border border-border bg-white shadow-sm transition hover:border-brand-700">
    <Link to={target} aria-label={`Abrir tarefa #${task.publicNumber}: ${c.title}`} className={`block rounded-xl ${compact ? 'p-3 pr-10' : 'p-4'}`}>
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-brand-700">#{task.publicNumber}</span><PriorityBadge priority={c.priority} /></div>
      <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-5" title={c.title}>{c.title}</h3>
      <p className="mt-1 truncate text-xs text-muted" title={task.team.name}>{task.team.name}</p>
      <div className="mt-3 space-y-1.5 text-xs text-muted">
        <p className="flex min-w-0 items-center gap-1.5"><UserRound size={13} className="shrink-0" /><span className="truncate">{c.assignment?.user?.name ?? (personal && c.status === 'COMPLETED' ? 'Concluída por você' : 'Sem responsável atual')}</span></p>
        <p className={`flex items-start gap-1.5 ${c.overdue ? 'font-bold text-danger' : ''}`}>{c.overdue ? <AlertTriangle size={13} className="mt-0.5 shrink-0" /> : <CalendarClock size={13} className="mt-0.5 shrink-0" />}<span>{c.deadlineAt ? new Date(c.deadlineAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem prazo'}{c.overdue ? ' · Atrasada' : ''}</span></p>
      </div>
      {personal && <div className="mt-2"><StatusBadge status={c.status} /></div>}
    </Link>
    {compact && <details ref={menu} className="absolute right-1 top-1 z-10" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === 'Escape') { menu.current.open = false; menu.current.querySelector('summary').focus(); } }}>
      <summary aria-label={`Ações da tarefa #${task.publicNumber}`} className="grid size-11 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-brand-100"><MoreHorizontal size={19} /></summary>
      <div className="absolute right-0 top-10 w-52 rounded-xl border border-border bg-white p-1 shadow-card">
        <Link className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-brand-100" to={target}>Detalhes e histórico</Link>
        {personal && ['AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(c.status) && <Link className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-brand-100" to={target}>{c.status === 'AWAITING_ACCEPTANCE' ? 'Responder atribuição' : 'Execução e solicitações'}</Link>}
      </div>
    </details>}
  </article>;
}
export function EmptyTasks({history=false}){return <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-border bg-white p-6 text-center"><div>{history?<CircleCheck className="mx-auto text-success"/>:<Clock3 className="mx-auto text-brand-700"/>}<p className="mt-3 font-bold">Nenhuma tarefa encontrada</p><p className="mt-1 text-sm text-muted">Ajuste os filtros ou aguarde novas movimentações.</p></div></div>}

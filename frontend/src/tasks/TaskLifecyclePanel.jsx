import { AlertTriangle, CornerDownRight, History, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PriorityBadge, StatusBadge } from './task-ui.jsx';

const activeStatuses = ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'];

export function TaskLifecyclePanel({ task, cycle, users, canManage, busy, mutate }) {
  const [showForm, setShowForm] = useState(false);
  const currentSubtasks = (task.subtasks ?? []).filter((item) => item.parentCycleId === cycle.id);
  const openSubtasks = currentSubtasks.filter((item) => activeStatuses.includes(item.cycle.status));
  const terminal = ['COMPLETED', 'CANCELLED'].includes(cycle.status);
  return <div className="mt-6 space-y-5">
    {task.parentTask && <section className="rounded-2xl border border-brand-100 bg-brand-100/50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Subtarefa vinculada</p><Link className="mt-1 inline-flex min-h-11 items-center gap-2 font-extrabold text-brand-900" to={`/tarefas/${task.parentTask.id}`}><CornerDownRight size={18} />Tarefa principal #{task.parentTask.publicNumber} · {task.parentTask.title}</Link></section>}
    {!task.parentCycleId && <section className="rounded-2xl border border-border bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold">Subtarefas do ciclo {cycle.cycleNumber}</h2><p className="mt-1 text-sm text-muted">Cada subtarefa possui responsável, prazo e execução independentes.</p></div>{canManage && activeStatuses.includes(cycle.status) && <button className="action-secondary" onClick={() => setShowForm(!showForm)}><Plus size={18} />Nova subtarefa</button>}</div>
      {openSubtasks.length > 0 && <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-bold text-warning"><AlertTriangle className="shrink-0" size={18} />A conclusão da tarefa principal está bloqueada enquanto houver subtarefas ativas.</p>}
      {showForm && <SubtaskForm users={users} version={cycle.version} busy={busy} onSubmit={async (body) => { if (await mutate(`/tasks/${task.id}/subtasks`, body)) setShowForm(false); }} />}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{currentSubtasks.map((subtask) => <SubtaskCard key={subtask.id} subtask={subtask} />)}{!currentSubtasks.length && <p className="text-sm text-muted">Nenhuma subtarefa neste ciclo.</p>}</div>
    </section>}
    {canManage && terminal && <section className="rounded-2xl border border-border bg-white p-5 shadow-card"><h2 className="text-xl font-extrabold">Novo ciclo de execução</h2><p className="mt-1 text-sm text-muted">O histórico atual será preservado. O novo ciclo começará pendente, sem responsável e sem prazo.</p><RestartForm busy={busy} label={cycle.status === 'COMPLETED' ? 'Reabrir tarefa' : 'Restaurar tarefa'} onSubmit={(reason) => mutate(`/tasks/${task.id}/${cycle.status === 'COMPLETED' ? 'reopen' : 'restore'}`, { expectedVersion: cycle.version, reason })} /></section>}
    <section className="rounded-2xl border border-border bg-white p-5 shadow-card"><div className="flex items-center gap-2"><History className="text-brand-700" size={20} /><h2 className="text-xl font-extrabold">Ciclos de execução</h2></div><div className="mt-4 space-y-3">{task.cycles.map((item) => <CycleCard key={item.id} cycle={item} linked={(task.subtasks ?? []).filter((subtask) => subtask.parentCycleId === item.id).length} />)}</div></section>
  </div>;
}

function CycleCard({ cycle, linked }) {
  const responsible = cycle.assignments.at(-1)?.user?.name ?? 'Sem responsável';
  return <article className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-extrabold">Ciclo {cycle.cycleNumber}</p><p className="text-sm text-muted">{responsible} · aberto em {new Date(cycle.openedAt).toLocaleString('pt-BR')}</p></div><StatusBadge status={cycle.status} /></div><p className="mt-2 text-sm">Prazo: {cycle.deadlineAt ? new Date(cycle.deadlineAt).toLocaleString('pt-BR') : 'sem prazo'}</p>{cycle.closedAt && <p className="mt-1 text-xs text-muted">Encerrado em {new Date(cycle.closedAt).toLocaleString('pt-BR')}</p>}{linked > 0 && <p className="mt-2 text-xs font-bold text-brand-700">{linked} subtarefa(s) preservada(s) neste ciclo</p>}</article>;
}

function SubtaskCard({ subtask }) {
  return <Link to={`/tarefas/${subtask.id}`} className="block rounded-xl border border-border p-4 transition hover:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700"><div className="flex flex-wrap justify-between gap-2"><p className="font-extrabold">#{subtask.publicNumber} · {subtask.cycle.title}</p><StatusBadge status={subtask.cycle.status} /></div><div className="mt-3 flex flex-wrap items-center gap-2"><PriorityBadge priority={subtask.cycle.priority} /><span className="text-xs text-muted">{subtask.cycle.assignment?.user?.name ?? 'Sem responsável'}</span></div><p className="mt-2 text-xs text-muted">Prazo: {subtask.cycle.deadlineAt ? new Date(subtask.cycle.deadlineAt).toLocaleString('pt-BR') : 'sem prazo'}</p></Link>;
}

function SubtaskForm({ users, version, busy, onSubmit }) {
  return <form className="mt-5 grid gap-3 rounded-xl bg-background p-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); onSubmit({ ...data, expectedVersion: version, deadlineAt: new Date(data.deadlineAt).toISOString() }); }}>
    <label className="text-sm font-bold sm:col-span-2">Título<input name="title" minLength="3" required className="field mt-1" /></label><label className="text-sm font-bold sm:col-span-2">Descrição<textarea name="description" minLength="3" required className="field mt-1" /></label><label className="text-sm font-bold">Prioridade<select name="priority" defaultValue="NORMAL" className="field mt-1"><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></label><label className="text-sm font-bold">Responsável<select name="userId" required className="field mt-1"><option value="">Selecione</option>{users.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-bold">Prazo<input name="deadlineAt" type="datetime-local" required className="field mt-1" /></label><label className="text-sm font-bold">Justificativa opcional<textarea name="reason" minLength="5" className="field mt-1" /></label><button disabled={busy} className="action-primary sm:col-span-2"><Plus size={18} />Criar e atribuir subtarefa</button>
  </form>;
}

function RestartForm({ busy, label, onSubmit }) {
  const [reason, setReason] = useState('');
  return <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}><textarea className="field" minLength="5" required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Justificativa obrigatória" /><button disabled={busy} className="action-primary"><RotateCcw size={18} />{label}</button></form>;
}

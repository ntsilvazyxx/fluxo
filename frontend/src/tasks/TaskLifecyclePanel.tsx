import { History, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from './task-ui.tsx';

export function TaskLifecyclePanel({ task, cycle, canManage, busy, mutate }) {
  const terminal = ['COMPLETED', 'CANCELLED'].includes(cycle.status);
  return <div className="mt-6 space-y-5">
    {canManage && terminal && <section className="rounded-2xl border border-border bg-white p-5 shadow-card"><h2 className="text-xl font-extrabold">Novo ciclo de execução</h2><p className="mt-1 text-sm text-muted">O histórico atual será preservado. O novo ciclo começará pendente, sem responsável e sem prazo.</p><RestartForm busy={busy} label={cycle.status === 'COMPLETED' ? 'Reabrir tarefa' : 'Restaurar tarefa'} onSubmit={(reason) => mutate(`/tasks/${task.id}/${cycle.status === 'COMPLETED' ? 'reopen' : 'restore'}`, { expectedVersion: cycle.version, reason })} /></section>}
    <section className="rounded-2xl border border-border bg-white p-5 shadow-card"><div className="flex items-center gap-2"><History className="text-brand-700" size={20} /><h2 className="text-xl font-extrabold">Ciclos de execução</h2></div><div className="mt-4 space-y-3">{task.cycles.map((item) => <CycleCard key={item.id} cycle={item} />)}</div></section>
  </div>;
}

function CycleCard({ cycle }) {
  const responsible = cycle.assignments.at(-1)?.user?.name ?? 'Sem responsável';
  return <article className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-extrabold">Ciclo {cycle.cycleNumber}</p><p className="text-sm text-muted">{responsible} · aberto em {new Date(cycle.openedAt).toLocaleString('pt-BR')}</p></div><StatusBadge status={cycle.status} /></div><p className="mt-2 text-sm">Prazo: {cycle.deadlineAt ? new Date(cycle.deadlineAt).toLocaleString('pt-BR') : 'sem prazo'}</p>{cycle.closedAt && <p className="mt-1 text-xs text-muted">Encerrado em {new Date(cycle.closedAt).toLocaleString('pt-BR')}</p>}</article>;
}

function RestartForm({ busy, label, onSubmit }) {
  const [reason, setReason] = useState('');
  return <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }}><textarea className="field" minLength={5} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Justificativa obrigatória" /><button disabled={busy} className="action-primary"><RotateCcw size={18} />{label}</button></form>;
}

/* eslint-disable react-hooks/set-state-in-effect */
import { ArrowLeft, CalendarClock, Check, Pencil, RotateCcw, Timer, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { TaskLifecyclePanel } from '../tasks/TaskLifecyclePanel.tsx';
import { ImageGalleryPanel } from '../tasks/ImageGalleryPanel.tsx';
import { PriorityBadge, StatusBadge } from '../tasks/task-ui.tsx';

const key = () => crypto.randomUUID();
const duration = (value) => {
  const total = Math.floor((value ?? 0) / 60000);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}min`;
};

export function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const boardUrl = `/kanban${location.search}`;
  const { request, user } = useAuth();
  const [task, setTask] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER'].includes(user.role.code);
  const load = useCallback(async () => {
    const response = await request(`/tasks/${id}`);
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message);
    setTask(json.data.task);
  }, [request, id]);
  useEffect(() => {
    load().catch((cause) => setError(cause.message));
    if (canManage) request('/users').then((response) => response.json()).then((json) => setUsers(json.data?.users ?? []));
  }, [load, request, canManage]);
  const mutate = async (path, data, method = 'POST') => {
    setBusy(true);
    setError('');
    try {
      const body = { ...data };
      if (body.reason === '') delete body.reason;
      const response = await request(path, { method, headers: { 'idempotency-key': key() }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível concluir a operação.');
      if (path.endsWith('/reject')) { navigate(boardUrl); return true; }
      await load();
      return true;
    } catch (cause) {
      setError(cause.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!task) return <p>{error || 'Carregando tarefa…'}</p>;

  const currentCycle = task.cycle;
  const cycle = task.cycles.find((item) => item.id === currentCycle.id);
  const currentAssignment = cycle?.assignments.find((item) => !item.endedAt);
  const own = currentAssignment?.userId === user.id;
  const pending = cycle?.requests.find((item) => item.status === 'PENDING');
  const openSubtasks = (task.subtasks ?? []).filter((item) => item.parentCycleId === currentCycle.id && ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(item.cycle.status));

  return <div className="max-w-5xl">
    <Link to={boardUrl} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-700"><ArrowLeft size={17} />Voltar ao Kanban</Link>
    <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-brand-700">Tarefa #{task.publicNumber} · Ciclo {currentCycle.cycleNumber}</p><h1 className="mt-2 text-3xl font-extrabold">{currentCycle.title}</h1><p className="mt-3 max-w-3xl whitespace-pre-wrap text-muted">{currentCycle.description}</p></div><div className="flex gap-2"><StatusBadge status={currentCycle.status} /><PriorityBadge priority={currentCycle.priority} /></div></div>
      <dl className="mt-6 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-3"><Info icon={UserRound} label="Responsável" value={currentAssignment?.user?.name ?? 'Sem responsável'} /><Info icon={CalendarClock} label="Prazo" value={currentCycle.deadlineAt ? new Date(currentCycle.deadlineAt).toLocaleString('pt-BR') : 'Sem prazo'} /><Info label="Equipe" value={task.team.name} /></dl>
      {currentCycle.overdue && <p className="mt-5 rounded-xl bg-red-50 p-3 font-bold text-danger">Esta tarefa está atrasada.</p>}
    </section>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-danger">{error}</p>}
    {currentAssignment?.metrics && <Metrics metrics={currentAssignment.metrics} />}
    <TaskLifecyclePanel task={task} cycle={currentCycle} users={users} canManage={canManage} busy={busy} mutate={mutate} />
    <ImageGalleryPanel taskId={task.id} cycleVersion={currentCycle.version} />

    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      {own && currentCycle.status === 'AWAITING_ACCEPTANCE' && <Action title="Responder atribuição"><button disabled={busy} onClick={() => mutate(`/assignments/${currentAssignment.id}/accept`, { expectedVersion: currentCycle.version })} className="action-primary"><Check size={18} />Aceitar tarefa</button><ReasonAction label="Rejeitar atribuição" danger busy={busy} onSubmit={(reason) => mutate(`/assignments/${currentAssignment.id}/reject`, { expectedVersion: currentCycle.version, reason })} /></Action>}
      {own && currentCycle.status === 'IN_PROGRESS' && !pending && <Action title="Solicitações"><RequestActions busy={busy} version={currentCycle.version} taskId={id} mutate={mutate} /></Action>}
      {pending && <Action title="Solicitação pendente"><p className="text-sm text-muted">{pending.type === 'RETURN' ? 'Devolução' : 'Prorrogação'} solicitada em {new Date(pending.createdAt).toLocaleString('pt-BR')}.</p><p className="text-sm">{pending.reason}</p>{canManage && <DecisionActions requestItem={pending} version={currentCycle.version} busy={busy} mutate={mutate} requireReason={user.role.code === 'ADMIN_MASTER'} />}</Action>}
      {own && currentCycle.status === 'IN_PROGRESS' && pending?.type !== 'RETURN' && !openSubtasks.length && <Action title="Concluir tarefa"><TextAction label="Descrição dos resultados" button="Concluir tarefa" busy={busy} onSubmit={(completionText) => mutate(`/tasks/${id}/complete`, { expectedVersion: currentCycle.version, completionText })} /></Action>}
      {canManage && ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status) && <Action title={currentAssignment ? 'Reatribuir responsável' : 'Atribuir responsável'}><AssignmentForm users={users} version={currentCycle.version} busy={busy} onSubmit={(data) => mutate(`/tasks/${id}/assignments`, data)} /></Action>}
      {canManage && ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status) && <Action title="Editar tarefa"><EditForm cycle={currentCycle} busy={busy} onSubmit={(data) => mutate(`/tasks/${id}`, data, 'PATCH')} /></Action>}
      {canManage && ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status) && <Action title="Cancelar tarefa"><ReasonAction label="Cancelar definitivamente" danger busy={busy} onSubmit={(reason) => mutate(`/tasks/${id}/cancel`, { expectedVersion: currentCycle.version, reason })} /></Action>}
    </div>
    <RequestHistory cycle={cycle} />
    <section className="mt-7"><h2 className="text-xl font-extrabold">Histórico de alterações</h2><div className="mt-3 space-y-3">{task.history.map((event) => <article className="rounded-xl border border-border bg-white p-4" key={event.id}><p className="font-bold">{event.action}</p><p className="mt-1 text-xs text-muted">{new Date(event.createdAt).toLocaleString('pt-BR')}{event.reason ? ` · ${event.reason}` : ''}</p></article>)}</div></section>
  </div>;
}

function Metrics({ metrics }) {
  return <section className="mt-5 grid gap-3 rounded-2xl border border-border bg-brand-100/40 p-4 sm:grid-cols-4"><Info icon={Timer} label="Espera para aceite" value={duration(metrics.waitingMilliseconds)} /><Info label="Responsabilidade" value={duration(metrics.responsibilityMilliseconds)} /><Info label="Tempo pausado" value={duration(metrics.pausedMilliseconds)} /><Info label="Expediente efetivo" value={duration(metrics.effectiveWorkingMilliseconds)} /></section>;
}

function RequestHistory({ cycle }) {
  return <section className="mt-7"><h2 className="text-xl font-extrabold">Solicitações e prazos</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{cycle?.requests.map((item) => <article className="rounded-xl border border-border bg-white p-4" key={item.id}><div className="flex justify-between gap-3"><p className="font-bold">{item.type === 'RETURN' ? 'Devolução' : 'Prorrogação'}</p><span className="text-xs font-bold text-brand-700">{item.status}</span></div><p className="mt-2 text-sm text-muted">{item.reason}</p>{item.proposedDeadlineAt && <p className="mt-2 text-xs">Proposto: {new Date(item.proposedDeadlineAt).toLocaleString('pt-BR')}</p>}{item.decisionReason && <p className="mt-2 text-xs">Decisão: {item.decisionReason}</p>}</article>)}{cycle?.deadlineChanges.map((change) => <article className="rounded-xl border border-border bg-white p-4" key={change.id}><p className="font-bold">Prazo alterado</p><p className="mt-2 text-xs text-muted">De {change.oldDeadlineAt ? new Date(change.oldDeadlineAt).toLocaleString('pt-BR') : 'sem prazo'} para {new Date(change.newDeadlineAt).toLocaleString('pt-BR')}</p><p className="mt-1 text-xs">{change.reason}</p></article>)}</div></section>;
}

function RequestActions({ taskId, version, mutate, busy }) {
  const [type, setType] = useState('RETURN');
  return <form onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); mutate(`/tasks/${taskId}/requests`, { type, reason: data.reason, expectedVersion: version, ...(type === 'EXTENSION' ? { proposedDeadlineAt: new Date(String(data.proposedDeadlineAt)).toISOString() } : {}) }); }} className="space-y-3"><select className="field" value={type} onChange={(event) => setType(event.target.value)}><option value="RETURN">Solicitar devolução</option><option value="EXTENSION">Solicitar prorrogação</option></select>{type === 'EXTENSION' && <input className="field" name="proposedDeadlineAt" type="datetime-local" required />}<textarea className="field" aria-label="Justificativa" name="reason" placeholder="Justificativa obrigatória" minLength={5} required /><button disabled={busy} className="action-secondary"><RotateCcw size={18} />Enviar solicitação</button></form>;
}

function DecisionActions({ requestItem, version, mutate, busy, requireReason }) {
  const [reason, setReason] = useState('');
  return <div className="mt-4 space-y-3"><textarea className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={requireReason ? 'Justificativa obrigatória' : 'Observação da decisão'} required={requireReason} /><div className="flex flex-wrap gap-2"><button disabled={busy || (requireReason && !reason.trim())} onClick={() => mutate(`/requests/${requestItem.id}/approve`, { expectedVersion: version, ...(reason ? { reason } : {}) })} className="action-primary"><Check size={18} />Aprovar</button><button disabled={busy || reason.trim().length < 5} onClick={() => mutate(`/requests/${requestItem.id}/deny`, { expectedVersion: version, reason })} className="action-danger"><X size={18} />Negar</button></div></div>;
}

function Info({ icon: Icon = null, label, value }) { return <div><dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">{Icon && <Icon size={15} />}{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function Action({ title, children }) { return <section className="rounded-2xl border border-border bg-white p-5"><h2 className="mb-4 font-extrabold">{title}</h2><div className="space-y-3">{children}</div></section>; }
function ReasonAction({ label, onSubmit, busy, danger }) { const [reason, setReason] = useState(''); return <form onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }} className="space-y-3"><textarea aria-label="Justificativa" placeholder="Justificativa obrigatória" minLength={5} required value={reason} onChange={(event) => setReason(event.target.value)} className="field" /><button disabled={busy} className={danger ? 'action-danger' : 'action-secondary'}><X size={18} />{label}</button></form>; }
function TextAction({ label, button, onSubmit, busy }) { const [value, setValue] = useState(''); return <form onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}><textarea aria-label={label} placeholder={label} minLength={10} required value={value} onChange={(event) => setValue(event.target.value)} className="field" /><button disabled={busy} className="action-primary mt-3"><Check size={18} />{button}</button></form>; }
function AssignmentForm({ users, version, onSubmit, busy }) { return <form onSubmit={(event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); onSubmit({ ...data, expectedVersion: version, deadlineAt: new Date(String(data.deadlineAt)).toISOString() }); }} className="space-y-3"><select aria-label="Responsável" name="userId" required className="field"><option value="">Selecione o responsável</option>{users.filter((item) => item.isActive).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.role.label}</option>)}</select><input aria-label="Prazo" name="deadlineAt" type="datetime-local" required className="field" /><textarea aria-label="Justificativa" name="reason" placeholder="Justificativa (obrigatória na reatribuição ou intervenção)" minLength={5} className="field" /><button disabled={busy} className="action-primary"><UserRound size={18} />Confirmar atribuição</button></form>; }
function EditForm({ cycle, onSubmit, busy }) { return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ ...Object.fromEntries(new FormData(event.currentTarget)), expectedVersion: cycle.version }); }} className="space-y-3"><input aria-label="Título" name="title" defaultValue={cycle.title} required className="field" /><textarea aria-label="Descrição" name="description" defaultValue={cycle.description} required className="field" /><select aria-label="Prioridade" name="priority" defaultValue={cycle.priority} className="field"><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select><textarea aria-label="Justificativa" name="reason" placeholder="Justificativa da alteração" required minLength={5} className="field" /><button disabled={busy} className="action-secondary"><Pencil size={18} />Salvar alterações</button></form>; }

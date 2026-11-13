/* eslint-disable react-hooks/set-state-in-effect */
import { ArrowLeft, CalendarClock, Check, Clock3, Download, Pencil, RotateCcw, Timer, Trash2, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { TaskLifecyclePanel } from '../tasks/TaskLifecyclePanel.tsx';
import { ImageGalleryPanel } from '../tasks/ImageGalleryPanel.tsx';
import { PriorityBadge, StatusBadge } from '../tasks/task-ui.tsx';

const key = () => crypto.randomUUID();
const duration = (value?: number) => {
  if (!value) return '0h 00min';
  const total = Math.floor(value / 60000);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}min`;
};
const localeDate = (value?: string) => value ? new Date(value).toLocaleString('pt-BR') : '—';

export function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const boardUrl = `/kanban${location.search}`;
  const { request, upload, user } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [executionFiles, setExecutionFiles] = useState<File[]>([]);
  const [executionProgress, setExecutionProgress] = useState<Record<string, number>>({});
  const [executionUploading, setExecutionUploading] = useState(false);
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
  const policy = currentCycle.deadlinePolicy;

  return (
    <div className="max-w-5xl">
      <Link to={boardUrl} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-700"><ArrowLeft size={17} />Voltar ao Kanban</Link>
      <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-brand-700">Tarefa #{task.publicNumber} · Ciclo {currentCycle.cycleNumber}</p>
            <h1 className="mt-2 text-3xl font-extrabold">{currentCycle.title}</h1>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-muted">{currentCycle.description}</p>
          </div>
          <div className="flex gap-2"><StatusBadge status={currentCycle.status} /><PriorityBadge priority={currentCycle.priority} /></div>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-3">
          <Info icon={UserRound} label="Responsável" value={currentAssignment?.user?.name ?? 'Sem responsável'} />
          <Info icon={CalendarClock} label="Equipe" value={task.team.name} />
          <Info label="Política de prazo" value={policy === 'RUNNING_CLOCK' ? 'Prazos corridos' : 'Calendário institucional'} />
        </dl>
        <dl className="mt-4 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-3">
          {policy === 'RUNNING_CLOCK' && currentCycle.status === 'AWAITING_ACCEPTANCE' && (
            <>
              <Info icon={Clock3} label="Prazo de aceite" value={localeDate(currentCycle.acceptanceDeadlineAt)} />
              <Info label="Duração do aceite" value={`${currentCycle.acceptanceDurationMinutes} minutos`} />
            </>
          )}
          {policy === 'RUNNING_CLOCK' && currentCycle.status === 'IN_PROGRESS' && (
            <>
              <Info icon={Clock3} label="Prazo de execução" value={localeDate(currentCycle.executionDeadlineAt)} />
              <Info label="Duração da execução" value={`${currentCycle.executionDurationMinutes} minutos`} />
            </>
          )}
          {policy === 'LEGACY_CALENDAR' && (
            <Info icon={CalendarClock} label="Prazo do calendário" value={localeDate(currentCycle.deadlineAt)} />
          )}
        </dl>
        {currentCycle.overdue && <p className="mt-5 rounded-xl bg-red-50 p-3 font-bold text-danger">Esta tarefa está atrasada.</p>}
      </section>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-danger">{error}</p>}
      <TaskMetrics cycle={currentCycle} assignment={currentAssignment} policy={policy} />
      <TaskLifecyclePanel task={task} cycle={currentCycle} users={users} canManage={canManage} busy={busy} mutate={mutate} />
      <ImageGalleryPanel taskId={task.id} cycleVersion={currentCycle.version} />
      <TaskAttachmentsPanel taskId={task.id} cycle={currentCycle} upload={upload} request={request} files={executionFiles} setFiles={setExecutionFiles} progress={executionProgress} setProgress={setExecutionProgress} uploading={executionUploading} setUploading={setExecutionUploading} own={own} policy={policy} status={currentCycle.status} load={load} />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {own && currentCycle.status === 'AWAITING_ACCEPTANCE' && <Action title="Responder atribuição"><button disabled={busy} onClick={() => mutate(`/assignments/${currentAssignment.id}/accept`, { expectedVersion: currentCycle.version })} className="action-primary"><Check size={18} />Aceitar tarefa</button><ReasonAction label="Rejeitar atribuição" danger busy={busy} onSubmit={(reason) => mutate(`/assignments/${currentAssignment.id}/reject`, { expectedVersion: currentCycle.version, reason })} /></Action>}
        {own && currentCycle.status === 'IN_PROGRESS' && !pending && <Action title="Solicitações"><RequestActions busy={busy} version={currentCycle.version} taskId={id} mutate={mutate} policy={policy} /></Action>}
        {pending && <Action title="Solicitação pendente"><p className="text-sm text-muted">{pending.type === 'RETURN' ? 'Devolução' : 'Prorrogação'} solicitada em {localeDate(pending.createdAt)}.</p><p className="text-sm">{pending.reason}</p>{pending.proposedDeadlineAt && <p className="mt-2 text-xs">Novo vencimento proposto: {localeDate(pending.proposedDeadlineAt)}</p>}{canManage && <DecisionActions requestItem={pending} version={currentCycle.version} busy={busy} mutate={mutate} requireReason={user.role.code === 'ADMIN_MASTER'} />}</Action>}
        {own && currentCycle.status === 'IN_PROGRESS' && pending?.type !== 'RETURN' && !openSubtasks.length && <Action title="Concluir tarefa"><TextAction label="Descrição dos resultados" button="Concluir tarefa" busy={busy} onSubmit={(completionText) => mutate(`/tasks/${id}/complete`, { expectedVersion: currentCycle.version, completionText })} /></Action>}
        {canManage && ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status) && <Action title={currentAssignment ? 'Reatribuir responsável' : 'Atribuir responsável'}><AssignmentForm users={users} version={currentCycle.version} busy={busy} policy={policy} onSubmit={(data) => mutate(`/tasks/${id}/assignments`, data)} /></Action>}
        {canManage && ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status) && <Action title="Editar tarefa"><EditForm cycle={currentCycle} busy={busy} onSubmit={(data) => mutate(`/tasks/${id}`, data, 'PATCH')} /></Action>}
        {canManage && ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status) && <Action title="Cancelar tarefa"><ReasonAction label="Cancelar definitivamente" danger busy={busy} onSubmit={(reason) => mutate(`/tasks/${id}/cancel`, { expectedVersion: currentCycle.version, reason })} /></Action>}
      </div>
      <RequestHistory cycle={cycle} />
      <section className="mt-7"><h2 className="text-xl font-extrabold">Histórico de alterações</h2><div className="mt-3 space-y-3">{task.history.map((event) => <article className="rounded-xl border border-border bg-white p-4" key={event.id}><p className="font-bold">{event.action}</p><p className="mt-1 text-xs text-muted">{new Date(event.createdAt).toLocaleString('pt-BR')}{event.reason ? ` · ${event.reason}` : ''}</p></article>)}</div></section>
    </div>
  );
}

function TaskMetrics({ cycle, assignment, policy }) {
  const acceptedWithinDeadline = assignment?.acceptedAt && cycle?.acceptanceDeadlineAt
    ? new Date(assignment.acceptedAt) <= new Date(cycle.acceptanceDeadlineAt)
    : null;
  return (
    <section className="mt-5 grid gap-3 rounded-2xl border border-border bg-brand-100/40 p-4 sm:grid-cols-4">
      {policy === 'RUNNING_CLOCK' && cycle.status === 'AWAITING_ACCEPTANCE' && (
        <>
          <Info icon={Timer} label="Espera para aceite" value={duration(assignment?.waitingMilliseconds)} />
          <Info label="Aceite dentro do prazo" value={acceptedWithinDeadline === null ? '—' : acceptedWithinDeadline ? 'Sim' : 'Não'} />
          <Info icon={Clock3} label="Prazo de aceite" value={localeDate(cycle.acceptanceDeadlineAt)} />
        </>
      )}
      {policy === 'RUNNING_CLOCK' && cycle.status === 'IN_PROGRESS' && (
        <>
          <Info icon={Timer} label="Tempo decorrido" value={duration(assignment?.elapsedMilliseconds)} />
          <Info icon={Clock3} label="Prazo de execução" value={localeDate(cycle.executionDeadlineAt)} />
          <Info label="Execução atrasada" value={cycle.executionDeadlineAt ? (new Date(cycle.executionDeadlineAt) < new Date() ? 'Sim' : 'Não') : '—'} />
        </>
      )}
      {policy === 'LEGACY_CALENDAR' && (
        <>
          <Info icon={CalendarClock} label="Prazo do calendário" value={localeDate(cycle.deadlineAt)} />
          <Info label="Atrasada" value={cycle.overdue ? 'Sim' : 'Não'} />
        </>
      )}
    </section>
  );
}

function TaskAttachmentsPanel({ taskId, cycle, upload, request, files, setFiles, progress, setProgress, uploading, setUploading, own, policy, status, load, busy: pageBusy = false }) {
  const [attachments, setAttachments] = useState([]);
  const [attachmentsError, setAttachmentsError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [removing, setRemoving] = useState(null);
  const [removeReason, setRemoveReason] = useState('');

  useEffect(() => {
    request(`/task-uploads/tasks/${taskId}`).then(async (response) => {
      const json = await response.json();
      if (response.ok) setAttachments(json.data?.attachments ?? []);
      else setAttachmentsError(json.error?.message ?? 'Não foi possível carregar anexos.');
    }).catch(() => setAttachmentsError('Não foi possível carregar anexos.'));
  }, [request, taskId]);

  const selectFiles = (event) => {
    const selected = Array.from(event.target.files ?? []);
    setFiles(selected);
    event.target.value = '';
  };

  const sendFiles = async () => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const stagedIds = [];
      for (const file of files) {
        const form = new FormData();
        form.append('attachment', file);
        const response = await upload('/task-uploads/staged', form, {
          headers: { 'idempotency-key': crypto.randomUUID() },
          onProgress: (value) => setProgress((current) => ({ ...current, [file.name]: value })),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível enviar o anexo.');
        stagedIds.push(json.data.id);
      }
      const response = await request(`/task-uploads/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID(), 'content-type': 'application/json' },
        body: JSON.stringify({ stagedIds, expectedVersion: cycle.version }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível associar anexos.');
      setFiles([]);
      setProgress({});
      setUploading(false);
      await load();
    } catch (cause) {
      setUploading(false);
      console.error(cause);
    }
  };

  const download = async (attachment) => {
    setDownloading(attachment.id);
    try {
      const response = await request(`/task-uploads/${attachment.id}/content`);
      if (!response.ok) throw new Error('Não foi possível baixar o anexo.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (cause) {
      console.error(cause);
    } finally {
      setDownloading(null);
    }
  };

  const confirmRemove = async () => {
    if (removeReason.trim().length < 5) return;
    setRemoving(null);
    try {
      const response = await request(`/task-uploads/${removing.id}`, {
        method: 'DELETE',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ reason: removeReason }),
      });
      if (!response.ok) throw new Error('Não foi possível remover o anexo.');
      setRemoveReason('');
      await load();
    } catch (cause) {
      console.error(cause);
    }
  };

  const initial = attachments.filter((a) => a.origin === 'INITIAL');
  const execution = attachments.filter((a) => a.origin === 'EXECUTION');

  return (
    <section className="mt-7 rounded-2xl border border-border bg-white p-5 sm:p-6" aria-labelledby="task-attachments-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="task-attachments-title" className="text-xl font-extrabold">Anexos da tarefa</h2>
          <p className="mt-1 text-sm text-muted">Arquivos vinculados ao ciclo de execução.</p>
        </div>
      </div>

      {own && status === 'IN_PROGRESS' && policy === 'RUNNING_CLOCK' && (
        <div className="mt-5 rounded-xl border border-dashed border-brand-700 bg-brand-100/40 p-4">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 font-normal text-sm hover:bg-brand-50 focus-within:ring-2 focus-within:ring-brand-700">
            <span>Selecionar arquivos de execução</span>
            <input className="sr-only" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx" onChange={selectFiles} disabled={uploading} />
          </label>
          <p className="mt-2 text-xs text-muted">JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX.</p>
          {files.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {files.map((file) => (
                <article key={file.name} className="overflow-hidden rounded-xl border border-border bg-white p-2">
                  <span className="text-xs font-bold truncate block">{file.name}</span>
                  {progress[file.name] != null && <span className="text-xs text-muted">({progress[file.name]}%)</span>}
                </article>
              ))}
            </div>
          )}
          <button type="button" disabled={uploading} onClick={sendFiles} className="action-primary mt-4"><span>Enviar anexos de execução ({files.length})</span></button>
        </div>
      )}

      {attachmentsError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-danger">{attachmentsError}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {initial.length > 0 && (
          <section className="rounded-xl border border-border bg-white p-4">
            <h3 className="text-sm font-bold text-brand-700 mb-3">Anexos iniciais</h3>
            <div className="space-y-2">
              {initial.map((item) => (
                <article key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border bg-background">
                  <div className="flex items-center gap-2"><button type="button" disabled={downloading === item.id} aria-label={`Baixar ${item.originalName}`} onClick={() => download(item)}><Download size={16} className="text-muted hover:text-brand-700" /></button><span className="text-sm truncate">{item.originalName}</span></div>
                  <span className="text-xs text-muted">{item.mimeType} · {Math.round(item.sizeBytes / 1024)} KB</span>
                </article>
              ))}
            </div>
          </section>
        )}
        {execution.length > 0 && (
          <section className="rounded-xl border border-border bg-white p-4">
            <h3 className="text-sm font-bold text-brand-700 mb-3">Anexos de execução</h3>
            <div className="space-y-2">
              {execution.map((item) => (
                <article key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border bg-background">
                  <div className="flex items-center gap-2"><button type="button" disabled={downloading === item.id} aria-label={`Baixar ${item.originalName}`} onClick={() => download(item)}><Download size={16} className="text-muted hover:text-brand-700" /></button><span className="text-sm truncate">{item.originalName}</span></div>
                  <span className="text-xs text-muted">{item.mimeType} · {Math.round(item.sizeBytes / 1024)} KB</span>
                  {own && <button type="button" onClick={() => { setRemoving(item); setRemoveReason(''); }} className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-danger"><Trash2 size={16} />Remover</button>}
                </article>
              ))}
            </div>
          </section>
        )}
        {(initial.length === 0 && execution.length === 0) && <p className="mt-3 text-sm text-muted">Nenhum anexo vinculado a este ciclo.</p>}
      </div>

      {removing && (
        <div ref={null} role="dialog" aria-modal="true" aria-labelledby="remove-attachment-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 id="remove-attachment-title" className="text-lg font-extrabold">Remover este anexo?</h3>
            <p className="mt-2 text-sm text-muted">Ele deixará de aparecer na galeria, mas o arquivo e a auditoria serão preservados.</p>
            <textarea className="field mt-4" value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} minLength={5} placeholder="Justificativa obrigatória" aria-label="Justificativa da remoção" />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="action-secondary" onClick={() => { setRemoving(null); setRemoveReason(''); }}>Cancelar</button>
              <button type="button" className="action-danger" disabled={pageBusy || removeReason.trim().length < 5} onClick={confirmRemove}><Trash2 size={18} />Confirmar remoção</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function RequestHistory({ cycle }) {
  return (
    <section className="mt-7">
      <h2 className="text-xl font-extrabold">Solicitações e prazos</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {cycle?.requests.map((item) => (
          <article className="rounded-xl border border-border bg-white p-4" key={item.id}>
            <div className="flex justify-between gap-3">
              <p className="font-bold">{item.type === 'RETURN' ? 'Devolução' : 'Prorrogação'}</p>
              <span className="text-xs font-bold text-brand-700">{item.status}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{item.reason}</p>
            {item.proposedDeadlineAt && <p className="mt-2 text-xs">Novo vencimento proposto: {localeDate(item.proposedDeadlineAt)}</p>}
            {item.decisionReason && <p className="mt-2 text-xs">Decisão: {item.decisionReason}</p>}
          </article>
        ))}
        {cycle?.deadlineChanges.map((change) => (
          <article className="rounded-xl border border-border bg-white p-4" key={change.id}>
            <p className="font-bold">Prazo alterado</p>
            <p className="mt-2 text-xs text-muted">De {localeDate(change.oldDeadlineAt)} para {localeDate(change.newDeadlineAt)}</p>
            <p className="mt-1 text-xs">{change.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function RequestActions({ taskId, version, mutate, busy, policy: _policy }) {
  const [type, setType] = useState('RETURN');
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const payload: { type: string; reason: FormDataEntryValue; expectedVersion: number; proposedDeadlineAt?: string } = { type, reason: data.reason, expectedVersion: version };
      if (type === 'EXTENSION') payload.proposedDeadlineAt = new Date(String(data.proposedDeadlineAt)).toISOString();
      mutate(`/tasks/${taskId}/requests`, payload);
    }} className="space-y-3">
      <select className="field" value={type} onChange={(event) => setType(event.target.value)}>
        <option value="RETURN">Solicitar devolução</option>
        <option value="EXTENSION">Solicitar prorrogação</option>
      </select>
      {type === 'EXTENSION' && (
        <>
          <label className="text-xs font-bold text-muted block mb-1">Novo vencimento (execução)</label>
          <input className="field" name="proposedDeadlineAt" type="datetime-local" required />
        </>
      )}
      <textarea className="field" aria-label="Justificativa" name="reason" placeholder="Justificativa obrigatória" minLength={5} required />
      <button disabled={busy} className="action-secondary"><RotateCcw size={18} />Enviar solicitação</button>
    </form>
  );
}

function DecisionActions({ requestItem, version, mutate, busy, requireReason }) {
  const [reason, setReason] = useState('');
  return (
    <div className="mt-4 space-y-3">
      <textarea className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={requireReason ? 'Justificativa obrigatória' : 'Observação da decisão'} required={requireReason} />
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || (requireReason && !reason.trim())} onClick={() => mutate(`/requests/${requestItem.id}/approve`, { expectedVersion: version, ...(reason ? { reason } : {}) })} className="action-primary"><Check size={18} />Aprovar</button>
        <button disabled={busy || reason.trim().length < 5} onClick={() => mutate(`/requests/${requestItem.id}/deny`, { expectedVersion: version, reason })} className="action-danger"><X size={18} />Negar</button>
      </div>
    </div>
  );
}

function Info({ icon: Icon = null, label, value }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">{Icon && <Icon size={15} />}{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
function Action({ title, children }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <h2 className="mb-4 font-extrabold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function ReasonAction({ label, onSubmit, busy, danger }) {
  const [reason, setReason] = useState('');
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(reason); }} className="space-y-3">
      <textarea aria-label="Justificativa" placeholder="Justificativa obrigatória" minLength={5} required value={reason} onChange={(event) => setReason(event.target.value)} className="field" />
      <button disabled={busy} className={danger ? 'action-danger' : 'action-secondary'}><X size={18} />{label}</button>
    </form>
  );
}
function TextAction({ label, button, onSubmit, busy }) {
  const [value, setValue] = useState('');
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
      <textarea aria-label={label} placeholder={label} minLength={10} required value={value} onChange={(event) => setValue(event.target.value)} className="field" />
      <button disabled={busy} className="action-primary mt-3"><Check size={18} />{button}</button>
    </form>
  );
}
function AssignmentForm({ users, version, onSubmit, busy, policy }) {
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const payload: any = { ...data, expectedVersion: version };
      if (policy === 'RUNNING_CLOCK') {
        payload.acceptanceDurationMinutes = Number(data.acceptanceDurationMinutes);
        payload.executionDurationMinutes = Number(data.executionDurationMinutes);
      } else {
        payload.deadlineAt = new Date(String(data.deadlineAt)).toISOString();
      }
      onSubmit(payload);
    }} className="space-y-3">
      <select aria-label="Responsável" name="userId" required className="field">
        <option value="">Selecione o responsável</option>
        {users.filter((item) => item.isActive).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.role.label}</option>)}
      </select>
      {policy === 'RUNNING_CLOCK' && (
        <>
          <Field label="Prazo para aceite (horas)">
            <select name="acceptanceDurationMinutes" defaultValue="240" className="field">
              <option value="60">1 hora</option>
              <option value="120">2 horas</option>
              <option value="240">4 horas</option>
              <option value="480">8 horas</option>
              <option value="720">12 horas</option>
              <option value="1440">24 horas</option>
            </select>
          </Field>
          <Field label="Prazo de execução (dias)">
            <select name="executionDurationMinutes" defaultValue="1440" className="field">
              <option value="720">Meio dia (12 horas)</option>
              <option value="1440">1 dia (24 horas)</option>
              <option value="2880">2 dias (48 horas)</option>
              <option value="4320">3 dias (72 horas)</option>
              <option value="7200">5 dias (120 horas)</option>
            </select>
          </Field>
        </>
      )}
      {policy === 'LEGACY_CALENDAR' && (
        <Field label="Prazo do calendário">
          <input aria-label="Prazo" name="deadlineAt" type="datetime-local" required className="field" />
        </Field>
      )}
      <textarea aria-label="Justificativa" name="reason" placeholder="Justificativa (obrigatória na reatribuição ou intervenção)" minLength={5} className="field" />
      <button disabled={busy} className="action-primary"><UserRound size={18} />Confirmar atribuição</button>
    </form>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <div className="mt-2 [&>*]:min-h-11 [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:border-border [&>*]:px-3 [&>*]:py-2 [&>*]:font-normal [&>*]:outline-none focus-within:[&>*]:ring-2 focus-within:[&>*]:ring-brand-700">{children}</div>
    </label>
  );
}
function EditForm({ cycle, onSubmit, busy }) {
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit({ ...Object.fromEntries(new FormData(event.currentTarget)), expectedVersion: cycle.version }); }} className="space-y-3">
      <input aria-label="Título" name="title" defaultValue={cycle.title} required className="field" />
      <textarea aria-label="Descrição" name="description" defaultValue={cycle.description} required className="field" />
      <select aria-label="Prioridade" name="priority" defaultValue={cycle.priority} className="field">
        <option value="LOW">Baixa</option>
        <option value="NORMAL">Normal</option>
        <option value="HIGH">Alta</option>
        <option value="URGENT">Urgente</option>
      </select>
      <textarea aria-label="Justificativa" name="reason" placeholder="Justificativa da alteração" required minLength={5} className="field" />
      <button disabled={busy} className="action-secondary"><Pencil size={18} />Salvar alterações</button>
    </form>
  );
}

import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  Paperclip,
  Pencil,
  RotateCcw,
  Send,
  Timer,
  Trash2,
  UserRound,
  UserRoundCog,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { getRoleLabel } from '../auth/roles.ts';

export const key = () => crypto.randomUUID();

export const duration = (value?: number) => {
  if (!value) return '0h 00min';
  const total = Math.floor(value / 60000);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}min`;
};

export const localeDate = (value?: string | Date | null) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
};

export function Info({ icon: Icon = null, label, value }: { icon?: any; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/80 bg-slate-50/70 p-3">
      <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        {Icon && <Icon size={14} className="shrink-0 text-brand-700" />}
        <span>{label}</span>
      </dt>
      <dd className="mt-1 text-sm font-semibold text-text truncate" title={typeof value === 'string' ? value : undefined}>
        {value}
      </dd>
    </div>
  );
}

export function Action({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-white p-4 shadow-xs">
      <h3 className="mb-3 text-sm font-bold text-text">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ReasonAction({
  label,
  onSubmit,
  busy,
  danger,
}: {
  label: string;
  onSubmit: (reason: string) => void;
  busy: boolean;
  danger?: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(reason);
      }}
      className="space-y-3"
    >
      <textarea
        aria-label="Justificativa"
        placeholder="Justificativa obrigatória"
        minLength={5}
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="field"
      />
      <button disabled={busy} className={danger ? 'action-danger' : 'action-secondary'}>
        <X size={18} />
        {label}
      </button>
    </form>
  );
}

export function TextAction({
  label,
  button,
  onSubmit,
  busy,
}: {
  label: string;
  button: string;
  onSubmit: (text: string) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <textarea
        aria-label={label}
        placeholder={label}
        minLength={10}
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="field"
      />
      <button disabled={busy} className="action-primary mt-3">
        <Check size={18} />
        {button}
      </button>
    </form>
  );
}

export function RequestActions({
  taskId,
  version,
  mutate,
  busy,
}: {
  taskId: string;
  version: number;
  mutate: (path: string, body: any) => Promise<boolean>;
  busy: boolean;
  policy?: string;
}) {
  const [type, setType] = useState('RETURN');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        const payload: {
          type: string;
          reason: FormDataEntryValue;
          expectedVersion: number;
          proposedDeadlineAt?: string;
        } = { type, reason: data.reason, expectedVersion: version };
        if (type === 'EXTENSION') payload.proposedDeadlineAt = new Date(String(data.proposedDeadlineAt)).toISOString();
        mutate(`/tasks/${taskId}/requests`, payload);
      }}
      className="space-y-3"
    >
      <select aria-label="Tipo de solicitação" className="field" value={type} onChange={(event) => setType(event.target.value)}>
        <option value="RETURN">Solicitar devolução</option>
        <option value="EXTENSION">Solicitar prorrogação</option>
      </select>
      {type === 'EXTENSION' && (
        <>
          <label className="text-xs font-bold text-muted block mb-1">Novo vencimento (execução)</label>
          <input className="field" name="proposedDeadlineAt" type="datetime-local" required />
        </>
      )}
      <textarea
        className="field"
        aria-label="Justificativa"
        name="reason"
        placeholder="Justificativa obrigatória"
        minLength={5}
        required
      />
      <button disabled={busy} className="action-secondary">
        <RotateCcw size={18} />
        Enviar solicitação
      </button>
    </form>
  );
}

export function DecisionActions({
  requestItem,
  version,
  mutate,
  busy,
  requireReason,
}: {
  requestItem: any;
  version: number;
  mutate: (path: string, body: any) => Promise<boolean>;
  busy: boolean;
  requireReason: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="mt-4 space-y-3">
      <textarea
        className="field"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={requireReason ? 'Justificativa obrigatória' : 'Observação da decisão'}
        required={requireReason}
      />
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy || (requireReason && !reason.trim())}
          onClick={() =>
            mutate(`/requests/${requestItem.id}/approve`, {
              expectedVersion: version,
              ...(reason ? { reason } : {}),
            })
          }
          className="action-primary"
        >
          <Check size={18} />
          Aprovar
        </button>
        <button
          disabled={busy || reason.trim().length < 5}
          onClick={() => mutate(`/requests/${requestItem.id}/deny`, { expectedVersion: version, reason })}
          className="action-danger"
        >
          <X size={18} />
          Negar
        </button>
      </div>
    </div>
  );
}

export function AssignmentForm({
  users,
  version,
  onSubmit,
  busy,
  policy,
  isReassignment = false,
  onCancel,
  submitLabel,
}: {
  users: any[];
  version: number;
  onSubmit: (data: any) => void;
  busy: boolean;
  policy: string;
  isReassignment?: boolean;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  return (
    <form
      onSubmit={(event) => {
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
      }}
      className="space-y-3"
    >
      <select aria-label="Responsável" name="userId" required className="field">
        <option value="">{isReassignment ? 'Selecione o novo responsável' : 'Selecione o responsável'}</option>
        {users
          .filter((item) => item.isActive)
          .map((item) => (
            <option value={item.id} key={item.id}>
              {item.name} · {getRoleLabel(item.role)}
            </option>
          ))}
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
      <textarea
        aria-label="Justificativa"
        name="reason"
        placeholder={
          isReassignment
            ? 'Justificativa da reatribuição (obrigatória)'
            : 'Justificativa (opcional)'
        }
        required={isReassignment}
        minLength={isReassignment ? 5 : undefined}
        className="field"
      />
      {onCancel ? (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="action-secondary"
          >
            Voltar
          </button>
          <button disabled={busy} className="action-primary">
            {isReassignment ? <UserRoundCog size={18} /> : <Send size={18} />}
            {submitLabel ?? (isReassignment ? 'Confirmar reatribuição' : 'Confirmar encaminhamento')}
          </button>
        </div>
      ) : (
        <button disabled={busy} className="action-primary">
          <UserRound size={18} />
          {submitLabel ?? (isReassignment ? 'Confirmar reatribuição' : 'Confirmar atribuição')}
        </button>
      )}
    </form>
  );
}

export function EditForm({
  cycle,
  onSubmit,
  busy,
}: {
  cycle: any;
  onSubmit: (data: any) => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          ...Object.fromEntries(new FormData(event.currentTarget)),
          expectedVersion: cycle.version,
        });
      }}
      className="space-y-3"
    >
      <input aria-label="Título" name="title" defaultValue={cycle.title} required className="field" />
      <textarea aria-label="Descrição" name="description" defaultValue={cycle.description} required className="field" />
      <select aria-label="Prioridade" name="priority" defaultValue={cycle.priority} className="field">
        <option value="LOW">Baixa</option>
        <option value="NORMAL">Normal</option>
        <option value="HIGH">Alta</option>
        <option value="URGENT">Urgente</option>
      </select>
      <textarea
        aria-label="Justificativa"
        name="reason"
        placeholder="Justificativa da alteração"
        required
        minLength={5}
        className="field"
      />
      <button disabled={busy} className="action-secondary">
        <Pencil size={18} />
        Salvar alterações
      </button>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <div className="mt-2 [&>*]:min-h-11 [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:border-border [&>*]:px-3 [&>*]:py-2 [&>*]:font-normal [&>*]:outline-none focus-within:[&>*]:ring-2 focus-within:[&>*]:ring-brand-700">
        {children}
      </div>
    </label>
  );
}

export function TaskMetrics({ cycle, assignment, policy }: { cycle: any; assignment: any; policy: string }) {
  const acceptedWithinDeadline =
    assignment?.acceptedAt && cycle?.acceptanceDeadlineAt
      ? new Date(assignment.acceptedAt) <= new Date(cycle.acceptanceDeadlineAt)
      : null;
  return (
    <section className="grid gap-3 rounded-xl border border-border bg-brand-100/30 p-3.5 sm:grid-cols-3">
      {policy === 'RUNNING_CLOCK' && cycle.status === 'AWAITING_ACCEPTANCE' && (
        <>
          <Info icon={Timer} label="Espera para aceite" value={duration(assignment?.waitingMilliseconds)} />
          <Info
            label="Aceite dentro do prazo"
            value={acceptedWithinDeadline === null ? '—' : acceptedWithinDeadline ? 'Sim' : 'Não'}
          />
          <Info icon={Clock3} label="Prazo de aceite" value={localeDate(cycle.acceptanceDeadlineAt)} />
        </>
      )}
      {policy === 'RUNNING_CLOCK' && cycle.status === 'IN_PROGRESS' && (
        <>
          <Info icon={Timer} label="Tempo decorrido" value={duration(assignment?.elapsedMilliseconds)} />
          <Info icon={Clock3} label="Prazo de execução" value={localeDate(cycle.executionDeadlineAt)} />
          <Info
            label="Execução atrasada"
            value={
              cycle.executionDeadlineAt
                ? new Date(cycle.executionDeadlineAt) < new Date()
                  ? 'Sim'
                  : 'Não'
                : '—'
            }
          />
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

export function TaskAttachmentsPanel({
  taskId,
  cycle,
  upload,
  request,
  files,
  setFiles,
  progress,
  setProgress,
  uploading,
  setUploading,
  own,
  policy,
  status,
  load,
  busy: pageBusy = false,
}: any) {
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attachmentsError, setAttachmentsError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [removing, setRemoving] = useState<any>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    request(`/task-uploads/tasks/${taskId}`)
      .then(async (response: Response) => {
        const json = await response.json();
        if (response.ok) setAttachments(json.data?.attachments ?? []);
        else setAttachmentsError(json.error?.message ?? 'Não foi possível carregar anexos.');
      })
      .catch(() => setAttachmentsError('Não foi possível carregar anexos.'));
  }, [request, taskId]);

  const selectFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
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
          onProgress: (value: number) => setProgress((current: any) => ({ ...current, [file.name]: value })),
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

  const download = async (attachment: any) => {
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
    <section className="rounded-xl border border-border bg-white p-3.5 sm:p-4 shadow-2xs" aria-labelledby="task-attachments-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Paperclip size={17} className="text-brand-700" />
          <h3 id="task-attachments-title" className="text-sm font-extrabold text-text">
            Anexos da tarefa ({attachments.length})
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="text-xs font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center gap-1 cursor-pointer select-none"
          aria-expanded={isExpanded}
        >
          <span>{isExpanded ? 'Recolher' : 'Expandir'}</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">Arquivos vinculados ao ciclo de execução.</p>

          {own && status === 'IN_PROGRESS' && policy === 'RUNNING_CLOCK' && (
            <div className="rounded-xl border border-dashed border-brand-700 bg-brand-100/40 p-3.5">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2 text-xs font-semibold hover:bg-brand-50 focus-within:ring-2 focus-within:ring-brand-700">
                <span>Selecionar arquivos de execução</span>
                <input
                  className="sr-only"
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                  onChange={selectFiles}
                  disabled={uploading}
                />
              </label>
              <p className="mt-1.5 text-xs text-muted">Formatos aceitos: JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX.</p>
              {files.length > 0 && (
                <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                  {files.map((file: File) => (
                    <article key={file.name} className="overflow-hidden rounded-lg border border-border bg-white p-2">
                      <span className="text-xs font-bold truncate block">{file.name}</span>
                      {progress[file.name] != null && <span className="text-xs text-muted">({progress[file.name]}%)</span>}
                    </article>
                  ))}
                </div>
              )}
              <button type="button" disabled={uploading} onClick={sendFiles} className="action-primary mt-3 text-xs">
                <span>Enviar anexos de execução ({files.length})</span>
              </button>
            </div>
          )}

          {attachmentsError && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-danger">{attachmentsError}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            {initial.length > 0 && (
              <section className="rounded-lg border border-border bg-slate-50/50 p-3">
                <h4 className="text-xs font-bold text-brand-700 mb-2">Anexos iniciais</h4>
                <div className="space-y-1.5">
                  {initial.map((item) => (
                    <article key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border bg-white text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          disabled={downloading === item.id}
                          aria-label={`Baixar ${item.originalName}`}
                          onClick={() => download(item)}
                          className="text-muted hover:text-brand-700 shrink-0"
                        >
                          <Download size={14} />
                        </button>
                        <span className="truncate font-medium">{item.originalName}</span>
                      </div>
                      <span className="text-[11px] text-muted shrink-0">{Math.round(item.sizeBytes / 1024)} KB</span>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {execution.length > 0 && (
              <section className="rounded-lg border border-border bg-slate-50/50 p-3">
                <h4 className="text-xs font-bold text-brand-700 mb-2">Anexos de execução</h4>
                <div className="space-y-1.5">
                  {execution.map((item) => (
                    <article key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border bg-white text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          disabled={downloading === item.id}
                          aria-label={`Baixar ${item.originalName}`}
                          onClick={() => download(item)}
                          className="text-muted hover:text-brand-700 shrink-0"
                        >
                          <Download size={14} />
                        </button>
                        <span className="truncate font-medium">{item.originalName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted">{Math.round(item.sizeBytes / 1024)} KB</span>
                        {own && (
                          <button
                            type="button"
                            onClick={() => {
                              setRemoving(item);
                              setRemoveReason('');
                            }}
                            className="text-danger hover:text-red-700 font-semibold"
                            title="Remover anexo"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {initial.length === 0 && execution.length === 0 && (
              <p className="mt-2 text-xs text-muted sm:col-span-2">Nenhum arquivo anexado a este ciclo.</p>
            )}
          </div>
        </div>
      )}

      {removing && (
        <div role="dialog" aria-modal="true" aria-labelledby="remove-attachment-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 id="remove-attachment-title" className="text-base font-extrabold text-text">Remover este anexo?</h3>
            <p className="mt-1 text-xs text-muted">Ele deixará de aparecer na lista, mas o histórico e a auditoria serão preservados.</p>
            <textarea
              className="field mt-3 text-xs"
              value={removeReason}
              onChange={(event) => setRemoveReason(event.target.value)}
              minLength={5}
              placeholder="Justificativa obrigatória (mín. 5 caracteres)"
              aria-label="Justificativa da remoção"
            />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" className="action-secondary text-xs" onClick={() => { setRemoving(null); setRemoveReason(''); }}>
                Cancelar
              </button>
              <button
                type="button"
                className="action-danger text-xs"
                disabled={pageBusy || removeReason.trim().length < 5}
                onClick={confirmRemove}
              >
                <Trash2 size={15} />
                Confirmar remoção
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function RequestHistory({ cycle }: { cycle: any }) {
  if (!cycle?.requests?.length && !cycle?.deadlineChanges?.length) return null;
  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <h3 className="text-base font-bold text-text">Solicitações e prazos</h3>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {cycle?.requests?.map((item: any) => (
          <article className="rounded-lg border border-border bg-slate-50/60 p-3 text-xs" key={item.id}>
            <div className="flex justify-between items-center gap-2">
              <p className="font-bold text-text">{item.type === 'RETURN' ? 'Devolução' : 'Prorrogação'}</p>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-900">{item.status}</span>
            </div>
            <p className="mt-1.5 text-muted">{item.reason}</p>
            {item.proposedDeadlineAt && (
              <p className="mt-1 font-medium">Novo vencimento proposto: {localeDate(item.proposedDeadlineAt)}</p>
            )}
            {item.decisionReason && <p className="mt-1 text-brand-900 font-medium">Decisão: {item.decisionReason}</p>}
          </article>
        ))}
        {cycle?.deadlineChanges?.map((change: any) => (
          <article className="rounded-lg border border-border bg-slate-50/60 p-3 text-xs" key={change.id}>
            <p className="font-bold text-text">Prazo alterado</p>
            <p className="mt-1 text-muted">
              De {localeDate(change.oldDeadlineAt)} para {localeDate(change.newDeadlineAt)}
            </p>
            <p className="mt-1 font-medium">{change.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}


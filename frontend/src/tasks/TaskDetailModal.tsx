/* eslint-disable react-hooks/set-state-in-effect */
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { ImageGalleryPanel } from './ImageGalleryPanel.tsx';
import { TaskActivitiesTimeline } from './TaskActivitiesTimeline.tsx';
import {
  Action,
  AssignmentForm,
  DecisionActions,
  EditForm,
  Info,
  key,
  localeDate,
  ReasonAction,
  RequestActions,
  RequestHistory,
  TaskAttachmentsPanel,
  TaskMetrics,
  TextAction,
} from './TaskDetailShared.tsx';
import { TaskLifecyclePanel } from './TaskLifecyclePanel.tsx';
import { PriorityBadge, StatusBadge } from './task-ui.tsx';

export interface TaskDetailModalProps {
  taskId: string | null;
  onClose: () => void;
  onTaskUpdated?: () => void;
  triggerElement?: HTMLElement | null;
}

export function TaskDetailModal({
  taskId,
  onClose,
  onTaskUpdated,
  triggerElement,
}: TaskDetailModalProps) {
  const { request, upload, user } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Anexos de execução
  const [executionFiles, setExecutionFiles] = useState<File[]>([]);
  const [executionProgress, setExecutionProgress] = useState<Record<string, number>>({});
  const [executionUploading, setExecutionUploading] = useState(false);

  const canManage = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER'].includes(user.role.code);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  // 1. Carregamento dos dados da tarefa
  const load = useCallback(async () => {
    if (!taskId) return;
    setError('');
    try {
      const response = await request(`/tasks/${taskId}`);
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error?.message || 'Não foi possível carregar os detalhes da tarefa.');
      }
      setTask(json.data.task);
    } catch (cause: any) {
      setError(cause.message || 'Erro ao carregar os dados da tarefa.');
    } finally {
      setLoading(false);
    }
  }, [request, taskId]);

  useEffect(() => {
    setLoading(true);
    load();
    if (canManage) {
      request('/users')
        .then((response) => response.json())
        .then((json) => setUsers(json.data?.users ?? []))
        .catch(() => {});
    }
  }, [load, canManage, request]);

  // 2. Foco inicial e captura (focus trap) e gerenciamento de Escape e Scroll lock
  useEffect(() => {
    previousFocusedElementRef.current = triggerElement || (document.activeElement as HTMLElement);

    // Trava rolagem do fundo
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foca no modal logo após a montagem
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), textarea, input, select, a[href], [tabindex="0"]',
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 50);

    const onKeyDown = (event: KeyboardEvent) => {
      // Ignora se houver um diálogo interno (ex: confirmação de remoção de anexo)
      const openInnerDialogs = document.querySelectorAll(
        '[role="dialog"]:not([aria-labelledby="task-detail-modal-title"])',
      );
      if (openInnerDialogs.length > 0) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
          ),
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;

      // Retorna o foco ao elemento que disparou a abertura
      if (previousFocusedElementRef.current && typeof previousFocusedElementRef.current.focus === 'function') {
        previousFocusedElementRef.current.focus();
      }
    };
  }, [onClose, triggerElement]);

  // 3. Mutação de ações da tarefa
  const mutate = async (path: string, data: any, method = 'POST') => {
    setBusy(true);
    setError('');
    try {
      const body = { ...data };
      if (body.reason === '') delete body.reason;
      const response = await request(path, {
        method,
        headers: { 'idempotency-key': key() },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error?.message ?? 'Não foi possível concluir a operação.');
      }

      // Atualiza o estado da tarefa localmente
      await load();

      // Notifica o Kanban pai para atualizar colunas e contadores sem recarregar a página
      onTaskUpdated?.();
      return true;
    } catch (cause: any) {
      setError(cause.message || 'Erro ao executar a ação.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !busy) {
      onClose();
    }
  };

  if (!taskId) return null;

  const currentCycle = task?.cycle;
  const cycle = task?.cycles?.find((item: any) => item.id === currentCycle?.id);
  const currentAssignment = cycle?.assignments?.find((item: any) => !item.endedAt);
  const own = currentAssignment?.userId === user.id;
  const pending = cycle?.requests?.find((item: any) => item.status === 'PENDING');
  const policy = currentCycle?.deadlinePolicy;

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-4 md:p-6 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-modal-title"
        tabIndex={-1}
        className="relative flex flex-col w-full max-w-4xl max-h-[92vh] h-full sm:h-auto rounded-xl sm:rounded-2xl border border-border bg-white shadow-2xl overflow-hidden focus:outline-none"
      >
        {/* ======================================================== */}
        {/* A. CABEÇALHO (Sticky)                                     */}
        {/* ======================================================== */}
        <header className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-border bg-white/95 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-xs">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-brand-700">
                Tarefa #{task?.publicNumber || '…'}
                {currentCycle?.cycleNumber ? ` · Ciclo ${currentCycle.cycleNumber}` : ''}
              </span>
              {currentCycle && (
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={currentCycle.status} />
                  <PriorityBadge priority={currentCycle.priority} />
                </div>
              )}
            </div>
            <h2
              id="task-detail-modal-title"
              className="mt-1 text-lg sm:text-xl font-extrabold text-text truncate"
              title={currentCycle?.title || 'Detalhes da tarefa'}
            >
              {currentCycle?.title || (loading ? 'Carregando tarefa…' : 'Tarefa')}
            </h2>
          </div>

          <button
            type="button"
            aria-label="Fechar modal de detalhes"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700"
          >
            <X size={20} />
          </button>
        </header>

        {/* ======================================================== */}
        {/* CORPO DO MODAL COM ROLAGEM VERTICAL                      */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted">
              <Loader2 size={32} className="animate-spin text-brand-700 mb-2" />
              <p className="text-sm font-semibold">Carregando detalhes da tarefa…</p>
            </div>
          ) : error && !task ? (
            <div role="alert" className="rounded-xl bg-red-50 p-6 text-center text-danger">
              <p className="font-bold">{error}</p>
              <button type="button" onClick={load} className="action-secondary mt-4">
                Tentar novamente
              </button>
            </div>
          ) : !task ? (
            <div className="py-12 text-center text-muted">
              <p className="font-semibold text-sm">Tarefa não encontrada ou fora do escopo de acesso.</p>
              <button type="button" onClick={onClose} className="action-secondary mt-3">
                Fechar
              </button>
            </div>
          ) : (
            <>
              {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-danger">
                  {error}
                </p>
              )}

              {/* B. INFORMAÇÕES GERAIS */}
              <section aria-label="Informações gerais da tarefa">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  <Info
                    icon={UserRound}
                    label="Responsável"
                    value={currentAssignment?.user?.name ?? 'Sem responsável atual'}
                  />
                  <Info
                    icon={CalendarClock}
                    label="Equipe"
                    value={task.team?.name ?? 'Sem equipe'}
                  />
                  <Info
                    icon={UserRound}
                    label="Criador da tarefa"
                    value={task.createdBy?.name ?? (task.creator?.name ?? '—')}
                  />
                  <Info
                    icon={Clock3}
                    label="Data de criação"
                    value={localeDate(task.createdAt)}
                  />

                  {policy === 'RUNNING_CLOCK' && currentCycle.status === 'AWAITING_ACCEPTANCE' && (
                    <>
                      <Info
                        icon={Clock3}
                        label="Prazo de aceite"
                        value={localeDate(currentCycle.acceptanceDeadlineAt)}
                      />
                      <Info
                        label="Duração de aceite"
                        value={`${currentCycle.acceptanceDurationMinutes ?? '—'} minutos`}
                      />
                    </>
                  )}

                  {policy === 'RUNNING_CLOCK' && currentCycle.status === 'IN_PROGRESS' && (
                    <>
                      <Info
                        icon={Clock3}
                        label="Prazo de execução"
                        value={localeDate(currentCycle.executionDeadlineAt)}
                      />
                      <Info
                        label="Duração de execução"
                        value={`${currentCycle.executionDurationMinutes ?? '—'} minutos`}
                      />
                    </>
                  )}

                  {policy === 'LEGACY_CALENDAR' && (
                    <Info
                      icon={CalendarClock}
                      label="Prazo do calendário"
                      value={localeDate(currentCycle.deadlineAt)}
                    />
                  )}

                  <Info
                    label="Política de prazo"
                    value={policy === 'RUNNING_CLOCK' ? 'Prazos corridos' : 'Calendário'}
                  />
                </dl>

                {currentCycle.overdue && (
                  <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-red-50 p-2.5 text-xs font-bold text-danger border border-red-200">
                    <AlertTriangle size={15} />
                    Esta tarefa está com o prazo vencido/atrasada.
                  </p>
                )}
              </section>

              {/* C. DESCRIÇÃO DA TAREFA */}
              <section aria-label="Descrição da tarefa">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                  Descrição da tarefa
                </h3>
                <div className="rounded-xl border border-border bg-slate-50/70 p-3.5 sm:p-4 text-xs sm:text-sm text-text whitespace-pre-wrap leading-relaxed font-normal">
                  {currentCycle.description || 'Sem descrição cadastrada.'}
                </div>
              </section>

              {/* D. INFORMAÇÕES COMPLEMENTARES */}

              {/* Resultado da execução (quando concluída) */}
              {currentCycle.completionText && (
                <section
                  aria-label="Resultado da execução"
                  className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"
                >
                  <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
                    <CheckCircle2 size={15} className="text-emerald-700" />
                    Resultado da execução
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-xs sm:text-sm text-emerald-950 font-normal leading-relaxed">
                    {currentCycle.completionText}
                  </p>
                </section>
              )}

              {/* Métricas de ciclo */}
              <TaskMetrics cycle={currentCycle} assignment={currentAssignment} policy={policy} />

              {/* Ciclos e histórico de execução */}
              <TaskLifecyclePanel
                task={task}
                cycle={currentCycle}
                canManage={canManage}
                busy={busy}
                mutate={mutate}
              />

              {/* Galeria de imagens */}
              <ImageGalleryPanel taskId={task.id} cycleVersion={currentCycle.version} />

              {/* Painel de anexos */}
              <TaskAttachmentsPanel
                taskId={task.id}
                cycle={currentCycle}
                upload={upload}
                request={request}
                files={executionFiles}
                setFiles={setExecutionFiles}
                progress={executionProgress}
                setProgress={setExecutionProgress}
                uploading={executionUploading}
                setUploading={setExecutionUploading}
                own={own}
                policy={policy}
                status={currentCycle.status}
                load={load}
                busy={busy}
              />

              {/* Subtarefas existentes (se houver) */}
              {Array.isArray(task.subtasks) && task.subtasks.length > 0 && (
                <section className="rounded-xl border border-border bg-white p-4">
                  <h3 className="text-sm font-bold text-text mb-2.5">Subtarefas associadas</h3>
                  <div className="space-y-2">
                    {task.subtasks.map((st: any) => (
                      <article
                        key={st.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-slate-50 text-xs"
                      >
                        <div>
                          <span className="font-bold text-brand-700">#{st.publicNumber} </span>
                          <span className="font-semibold">{st.cycle?.title || st.title}</span>
                        </div>
                        <StatusBadge status={st.cycle?.status || 'PENDING'} />
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {/* Histórico de solicitações e prazos */}
              <RequestHistory cycle={cycle} />

              {/* E. COMENTÁRIOS E ATIVIDADES */}
              <TaskActivitiesTimeline task={task} />

              {/* 4. AÇÕES DA TAREFA */}
              <section aria-label="Ações da tarefa" className="border-t border-border pt-4">
                <h3 className="text-sm font-extrabold text-text mb-3">Ações da tarefa</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Aceite ou rejeição */}
                  {own && currentCycle.status === 'AWAITING_ACCEPTANCE' && (
                    <Action title="Responder atribuição">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          mutate(`/assignments/${currentAssignment.id}/accept`, {
                            expectedVersion: currentCycle.version,
                          })
                        }
                        className="action-primary w-full justify-center"
                      >
                        <Check size={18} />
                        Aceitar tarefa
                      </button>
                      <ReasonAction
                        label="Rejeitar atribuição"
                        danger
                        busy={busy}
                        onSubmit={(reason) =>
                          mutate(`/assignments/${currentAssignment.id}/reject`, {
                            expectedVersion: currentCycle.version,
                            reason,
                          })
                        }
                      />
                    </Action>
                  )}

                  {/* Solicitações de devolução e prorrogação */}
                  {own && currentCycle.status === 'IN_PROGRESS' && !pending && (
                    <Action title="Solicitações">
                      <RequestActions
                        busy={busy}
                        version={currentCycle.version}
                        taskId={task.id}
                        mutate={mutate}
                        policy={policy}
                      />
                    </Action>
                  )}

                  {/* Decisão sobre solicitação pendente */}
                  {pending && (
                    <Action title="Solicitação pendente">
                      <p className="text-xs text-muted">
                        {pending.type === 'RETURN' ? 'Devolução' : 'Prorrogação'} solicitada em{' '}
                        {localeDate(pending.createdAt)}.
                      </p>
                      <p className="text-xs mt-1 font-medium">{pending.reason}</p>
                      {pending.proposedDeadlineAt && (
                        <p className="mt-1 text-[11px] text-brand-900 font-semibold">
                          Novo vencimento proposto: {localeDate(pending.proposedDeadlineAt)}
                        </p>
                      )}
                      {canManage && (
                        <DecisionActions
                          requestItem={pending}
                          version={currentCycle.version}
                          busy={busy}
                          mutate={mutate}
                          requireReason={user.role.code === 'ADMIN_MASTER'}
                        />
                      )}
                    </Action>
                  )}

                  {/* Conclusão de tarefa */}
                  {own && currentCycle.status === 'IN_PROGRESS' && pending?.type !== 'RETURN' && (
                    <Action title="Concluir tarefa">
                      <TextAction
                        label="Descrição dos resultados"
                        button="Concluir tarefa"
                        busy={busy}
                        onSubmit={(completionText) =>
                          mutate(`/tasks/${task.id}/complete`, {
                            expectedVersion: currentCycle.version,
                            completionText,
                          })
                        }
                      />
                    </Action>
                  )}

                  {/* Atribuição ou Reatribuição */}
                  {canManage &&
                    ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status) && (
                      <Action
                        title={currentAssignment ? 'Reatribuir responsável' : 'Atribuir responsável'}
                      >
                        <AssignmentForm
                          users={users}
                          version={currentCycle.version}
                          busy={busy}
                          policy={policy}
                          onSubmit={(data) => mutate(`/tasks/${task.id}/assignments`, data)}
                        />
                      </Action>
                    )}

                  {/* Edição de título e descrição */}
                  {canManage &&
                    ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status) && (
                      <Action title="Editar tarefa">
                        <EditForm
                          cycle={currentCycle}
                          busy={busy}
                          onSubmit={(data) => mutate(`/tasks/${task.id}`, data, 'PATCH')}
                        />
                      </Action>
                    )}

                  {/* Cancelamento da tarefa */}
                  {canManage &&
                    ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status) && (
                      <Action title="Cancelar tarefa">
                        <ReasonAction
                          label="Cancelar definitivamente"
                          danger
                          busy={busy}
                          onSubmit={(reason) =>
                            mutate(`/tasks/${task.id}/cancel`, {
                              expectedVersion: currentCycle.version,
                              reason,
                            })
                          }
                        />
                      </Action>
                    )}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


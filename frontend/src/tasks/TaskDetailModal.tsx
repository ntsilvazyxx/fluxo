/* eslint-disable react-hooks/set-state-in-effect */
import {
  AlertTriangle,
  Ban,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Route,
  Send,
  UserRound,
  UserRoundCog,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { ImageGalleryPanel } from './ImageGalleryPanel.tsx';
import { TaskActivitiesTimeline } from './TaskActivitiesTimeline.tsx';
import { TaskChatPanel } from './chat/TaskChatPanel.tsx';
import {
  Action,
  AssignmentForm,
  DecisionActions,
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

  // Controle do menu "Mais ações" e expansão da descrição
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false);
  const moreActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  // Controle de expansão de informações secundárias
  const [showMoreInfo, setShowMoreInfo] = useState(false);

  // Estados dos pop-ups de encaminhamento e reatribuição
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignError, setAssignError] = useState('');
  const assignButtonRef = useRef<HTMLButtonElement | null>(null);
  const assignModalRef = useRef<HTMLDivElement | null>(null);

  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [reassignError, setReassignError] = useState('');
  const reassignButtonRef = useRef<HTMLButtonElement | null>(null);
  const reassignModalRef = useRef<HTMLDivElement | null>(null);

  // Estados dos pop-ups de edição e cancelamento (criador original)
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [editError, setEditError] = useState('');

  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const editModalRef = useRef<HTMLDivElement | null>(null);
  const cancelModalRef = useRef<HTMLDivElement | null>(null);

  // Estados dos pop-ups de rejeição, conclusão e solicitação
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const rejectModalRef = useRef<HTMLDivElement | null>(null);

  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [completeText, setCompleteText] = useState('');
  const [completeError, setCompleteError] = useState('');
  const completeModalRef = useRef<HTMLDivElement | null>(null);

  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const requestModalRef = useRef<HTMLDivElement | null>(null);

  // Estado do Chat da tarefa
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatButtonRef = useRef<HTMLButtonElement | null>(null);

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
      if (event.key === 'Escape') {
        if (isMoreActionsOpen) {
          event.stopPropagation();
          event.preventDefault();
          setIsMoreActionsOpen(false);
          return;
        }
        if (isEditOpen) {
          event.stopPropagation();
          event.preventDefault();
          setIsEditOpen(false);
          return;
        }
        if (isCancelOpen) {
          event.stopPropagation();
          event.preventDefault();
          setIsCancelOpen(false);
          return;
        }
        if (isAssignOpen) {
          event.stopPropagation();
          event.preventDefault();
          setIsAssignOpen(false);
          return;
        }
        if (isReassignOpen) {
          event.stopPropagation();
          event.preventDefault();
          setIsReassignOpen(false);
          return;
        }
        if (isRejectOpen) {
          event.stopPropagation();
          event.preventDefault();
          setIsRejectOpen(false);
          return;
        }
        if (isCompleteOpen) {
          event.stopPropagation();
          event.preventDefault();
          setIsCompleteOpen(false);
          return;
        }
        if (isRequestOpen) {
          event.stopPropagation();
          event.preventDefault();
          setIsRequestOpen(false);
          return;
        }

        // Ignora se houver outro diálogo interno (ex: confirmação de remoção de anexo)
        const openInnerDialogs = document.querySelectorAll(
          '[role="dialog"]:not([aria-labelledby="task-detail-modal-title"])',
        );
        if (openInnerDialogs.length > 0) {
          return;
        }

        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const activeContainer = isEditOpen
          ? editModalRef.current
          : isCancelOpen
            ? cancelModalRef.current
            : isAssignOpen
              ? assignModalRef.current
              : isReassignOpen
                ? reassignModalRef.current
                : isRejectOpen
                  ? rejectModalRef.current
                  : isCompleteOpen
                    ? completeModalRef.current
                    : isRequestOpen
                      ? requestModalRef.current
                      : dialogRef.current;
        if (activeContainer) {
          const focusable = Array.from(
            activeContainer.querySelectorAll<HTMLElement>(
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
  }, [
    onClose,
    triggerElement,
    isMoreActionsOpen,
    isEditOpen,
    isCancelOpen,
    isAssignOpen,
    isReassignOpen,
    isRejectOpen,
    isCompleteOpen,
    isRequestOpen,
  ]);

  // Fecha o menu "Mais ações" ao clicar fora
  useEffect(() => {
    if (!isMoreActionsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreActionsMenuRef.current && !moreActionsMenuRef.current.contains(e.target as Node)) {
        setIsMoreActionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMoreActionsOpen]);

  // Gerenciamento de foco do pop-up de encaminhamento inicial
  useEffect(() => {
    if (isAssignOpen) {
      const timer = setTimeout(() => {
        if (assignModalRef.current) {
          const focusable = assignModalRef.current.querySelectorAll<HTMLElement>(
            'select:not(:disabled), input:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
          );
          if (focusable.length > 0) focusable[0].focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (!isAssignOpen && assignButtonRef.current) {
      assignButtonRef.current.focus();
    }
  }, [isAssignOpen]);

  // Gerenciamento de foco do pop-up de reatribuição
  useEffect(() => {
    if (isReassignOpen) {
      const timer = setTimeout(() => {
        if (reassignModalRef.current) {
          const focusable = reassignModalRef.current.querySelectorAll<HTMLElement>(
            'select:not(:disabled), input:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
          );
          if (focusable.length > 0) focusable[0].focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (!isReassignOpen && reassignButtonRef.current) {
      reassignButtonRef.current.focus();
    }
  }, [isReassignOpen]);

  // Gerenciamento de foco do pop-up de edição
  useEffect(() => {
    if (isEditOpen) {
      const timer = setTimeout(() => {
        if (editModalRef.current) {
          const focusable = editModalRef.current.querySelectorAll<HTMLElement>(
            'input:not(:disabled), textarea:not(:disabled), button:not(:disabled), select:not(:disabled)',
          );
          if (focusable.length > 0) focusable[0].focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (!isEditOpen && editButtonRef.current) {
      editButtonRef.current.focus();
    }
  }, [isEditOpen]);

  // Gerenciamento de foco do pop-up de cancelamento
  useEffect(() => {
    if (isCancelOpen) {
      const timer = setTimeout(() => {
        if (cancelModalRef.current) {
          const textarea = cancelModalRef.current.querySelector<HTMLTextAreaElement>(
            'textarea[name="cancelReason"]',
          );
          if (textarea) textarea.focus();
          else {
            const focusable = cancelModalRef.current.querySelectorAll<HTMLElement>(
              'button:not(:disabled), textarea:not(:disabled)',
            );
            focusable[0]?.focus();
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (!isCancelOpen && cancelButtonRef.current) {
      cancelButtonRef.current.focus();
    }
  }, [isCancelOpen]);

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
      if (
        isEditOpen ||
        isCancelOpen ||
        isAssignOpen ||
        isReassignOpen ||
        isRejectOpen ||
        isCompleteOpen ||
        isRequestOpen
      )
        return;
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

  // Controle estrito de autoria: somente quem criou originalmente a tarefa pode editar ou cancelar
  const isCreator = Boolean(
    (task?.createdById && task.createdById === user.id) ||
    (task?.createdBy?.id && task.createdBy.id === user.id)
  );
  const canAssign = Boolean(
    canManage &&
      !currentAssignment &&
      currentCycle &&
      ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status)
  );
  const canReassign = Boolean(
    canManage &&
      currentAssignment &&
      currentCycle &&
      ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status)
  );
  const canEditOrCancel = Boolean(
    isCreator &&
      currentCycle &&
      ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle.status)
  );

  const hasMoreActions = Boolean(canEditOrCancel || (canReassign && own));
  const hasAnyAction = Boolean(
    canAssign ||
      (canReassign && !own) ||
      canEditOrCancel ||
      (own && ['AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(currentCycle?.status)) ||
      pending
  );

  const descriptionText = currentCycle?.description || 'Sem descrição cadastrada.';
  const isDescLong = descriptionText.length > 240 || descriptionText.split('\n').length > 4;

  // Determinação do prazo principal conforme o estado da tarefa
  const primaryDeadline = (() => {
    if (!currentCycle) return null;
    const status = currentCycle.status;
    if (status === 'AWAITING_ACCEPTANCE') {
      const deadline = currentCycle.acceptanceDeadlineAt || currentCycle.deadlineAt;
      return {
        label: 'Prazo de aceite',
        value: deadline ? localeDate(deadline) : 'Sem prazo definido',
      };
    }
    if (status === 'IN_PROGRESS') {
      const deadline = currentCycle.executionDeadlineAt || currentCycle.deadlineAt;
      return {
        label: 'Prazo de execução',
        value: deadline ? localeDate(deadline) : 'Sem prazo definido',
      };
    }
    if (status === 'COMPLETED') {
      return {
        label: 'Conclusão',
        value: currentCycle.closedAt ? localeDate(currentCycle.closedAt) : 'Concluída',
      };
    }
    if (status === 'CANCELLED') {
      return {
        label: 'Cancelamento',
        value: currentCycle.closedAt ? localeDate(currentCycle.closedAt) : 'Cancelada',
      };
    }
    if (currentCycle.deadlineAt) {
      return {
        label: 'Prazo do calendário',
        value: localeDate(currentCycle.deadlineAt),
      };
    }
    return {
      label: 'Prazo principal',
      value: 'Não atribuído',
    };
  })();

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
        {/* A. CABEÇALHO COMPACTO (Sticky)                            */}
        {/* ======================================================== */}
        <header className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-border bg-white/95 px-4 py-2.5 sm:px-6 sm:py-3.5 backdrop-blur-xs">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
              <span className="font-bold text-brand-700">
                #{task?.publicNumber || '…'}
                {currentCycle?.cycleNumber ? ` · Percurso ${currentCycle.cycleNumber}` : ''}
              </span>
              <span className="text-slate-300 font-light" aria-hidden="true">|</span>
              {currentCycle && (
                <>
                  <StatusBadge status={currentCycle.status} />
                  <span className="text-slate-300 font-light" aria-hidden="true">|</span>
                  <PriorityBadge priority={currentCycle.priority} />
                </>
              )}
            </div>
            <h2
              id="task-detail-modal-title"
              className="mt-0.5 text-base sm:text-lg font-extrabold text-text truncate"
              title={currentCycle?.title || 'Detalhes da tarefa'}
            >
              {currentCycle?.title || (loading ? 'Carregando tarefa…' : 'Tarefa')}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              ref={chatButtonRef}
              type="button"
              aria-label="Abrir chat da tarefa"
              title="Abrir chat da tarefa"
              onClick={() => setIsChatOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/80 px-2.5 py-1.5 text-xs font-semibold text-brand-700 shadow-2xs hover:bg-brand-100 transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer"
            >
              <MessageSquare size={15} />
              <span className="hidden sm:inline">Chat da tarefa</span>
            </button>
            <button
              type="button"
              aria-label="Fechar modal de detalhes"
              onClick={onClose}
              className="grid size-8 sm:size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* ======================================================== */}
        {/* CORPO DO MODAL COM ROLAGEM VERTICAL                      */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
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

              {/* ======================================================== */}
              {/* 2. AÇÕES DA TAREFA (NO TOPO)                              */}
              {/* ======================================================== */}
              {hasAnyAction && (
                <section
                  aria-label="Ações da tarefa"
                  className="rounded-xl border border-border/80 bg-slate-50/70 p-2.5 sm:p-3 shadow-2xs space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Ações principais operacionais */}
                      {canAssign && (
                        <button
                          type="button"
                          ref={assignButtonRef}
                          aria-label="Encaminhar tarefa"
                          disabled={busy}
                          onClick={() => {
                            setAssignError('');
                            setIsAssignOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-2xs hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 disabled:opacity-50 cursor-pointer"
                        >
                          <Send size={14} className="text-brand-700" />
                          Encaminhar tarefa
                        </button>
                      )}

                      {canReassign && !own && (
                        <button
                          type="button"
                          ref={reassignButtonRef}
                          aria-label="Reatribuir responsável"
                          disabled={busy}
                          onClick={() => {
                            setReassignError('');
                            setIsReassignOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-2xs hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 disabled:opacity-50 cursor-pointer"
                        >
                          <UserRoundCog size={14} className="text-brand-700" />
                          Reatribuir responsável
                        </button>
                      )}

                      {own && currentCycle?.status === 'AWAITING_ACCEPTANCE' && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              mutate(`/assignments/${currentAssignment.id}/accept`, {
                                expectedVersion: currentCycle.version,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50 cursor-pointer"
                          >
                            <Check size={14} />
                            Aceitar tarefa
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setRejectError('');
                              setRejectReason('');
                              setIsRejectOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/60 px-3 py-1.5 text-xs font-semibold text-danger shadow-2xs hover:bg-red-100 transition-colors focus-visible:outline-2 focus-visible:outline-danger disabled:opacity-50 cursor-pointer"
                          >
                            <X size={14} />
                            Rejeitar atribuição
                          </button>
                        </>
                      )}

                      {own && currentCycle?.status === 'IN_PROGRESS' && (
                        <>
                          {pending?.type !== 'RETURN' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setCompleteError('');
                                setCompleteText('');
                                setIsCompleteOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-800 transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 disabled:opacity-50 cursor-pointer"
                            >
                              <CheckCircle2 size={14} />
                              Concluir tarefa
                            </button>
                          )}
                          {!pending && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setIsRequestOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-text shadow-2xs hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 disabled:opacity-50 cursor-pointer"
                            >
                              <RotateCcw size={14} className="text-brand-700" />
                              Solicitações
                            </button>
                          )}
                        </>
                      )}

                      {/* Menu "Mais ações" para ações secundárias */}
                      {hasMoreActions && (
                        <div className="relative inline-block text-left" ref={moreActionsMenuRef}>
                          <button
                            type="button"
                            aria-label="Mais ações"
                            aria-haspopup="true"
                            aria-expanded={isMoreActionsOpen}
                            disabled={busy}
                            onClick={() => setIsMoreActionsOpen((prev) => !prev)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-text shadow-2xs hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 disabled:opacity-50 cursor-pointer select-none"
                          >
                            <MoreHorizontal size={14} className="text-muted" />
                            <span>Mais ações</span>
                            <ChevronDown
                              size={13}
                              className={`text-muted transition-transform ${isMoreActionsOpen ? 'rotate-180' : ''}`}
                            />
                          </button>

                          {isMoreActionsOpen && (
                            <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-48 rounded-xl border border-border bg-white p-1.5 shadow-xl z-30 animate-in fade-in zoom-in-95 duration-150">
                              {canEditOrCancel && (
                                <button
                                  type="button"
                                  ref={editButtonRef}
                                  aria-label="Editar tarefa"
                                  disabled={busy}
                                  onClick={() => {
                                    setIsMoreActionsOpen(false);
                                    setEditError('');
                                    setIsEditOpen(true);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-text hover:bg-slate-50 transition-colors cursor-pointer text-left"
                                >
                                  <Pencil size={14} className="text-muted shrink-0" />
                                  <span>Editar tarefa</span>
                                </button>
                              )}

                              {canReassign && own && (
                                <button
                                  type="button"
                                  ref={reassignButtonRef}
                                  aria-label="Reatribuir responsável"
                                  disabled={busy}
                                  onClick={() => {
                                    setIsMoreActionsOpen(false);
                                    setReassignError('');
                                    setIsReassignOpen(true);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-text hover:bg-slate-50 transition-colors cursor-pointer text-left"
                                >
                                  <UserRoundCog size={14} className="text-brand-700 shrink-0" />
                                  <span>Reatribuir responsável</span>
                                </button>
                              )}

                              {canEditOrCancel && (
                                <>
                                  <div className="my-1 border-t border-border/80" />
                                  <button
                                    type="button"
                                    ref={cancelButtonRef}
                                    aria-label="Cancelar tarefa"
                                    disabled={busy}
                                    onClick={() => {
                                      setIsMoreActionsOpen(false);
                                      setCancelError('');
                                      setCancelReason('');
                                      setIsCancelOpen(true);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-danger hover:bg-red-50 transition-colors cursor-pointer text-left"
                                  >
                                    <Ban size={14} className="text-danger shrink-0" />
                                    <span>Cancelar tarefa</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Se houver solicitação pendente */}
                  {pending && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 sm:p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-amber-900">
                            {pending.type === 'RETURN' ? 'Devolução solicitada' : 'Prorrogação solicitada'}:
                          </span>{' '}
                          <span className="text-amber-950 font-medium">{pending.reason}</span>
                          {pending.proposedDeadlineAt && (
                            <p className="mt-0.5 text-[11px] text-amber-900 font-semibold">
                              Novo vencimento proposto: {localeDate(pending.proposedDeadlineAt)}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                mutate(`/requests/${pending.id}/approve`, {
                                  expectedVersion: currentCycle.version,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 cursor-pointer"
                            >
                              <Check size={13} /> Aprovar
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                mutate(`/requests/${pending.id}/deny`, {
                                  expectedVersion: currentCycle.version,
                                  reason: 'Solicitação negada pelo gestor',
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-danger shadow-2xs hover:bg-red-50 cursor-pointer"
                            >
                              <X size={13} /> Negar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* B. INFORMAÇÕES PRINCIPAIS COMPACTAS */}
              <section aria-label="Informações gerais da tarefa" className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-slate-50/80 border border-border/80 px-3.5 py-2.5 text-xs text-text">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <UserRound size={15} className="text-brand-700 shrink-0" />
                    <span className="text-muted font-medium">Responsável:</span>
                    <span className="font-semibold truncate">
                      {currentAssignment?.user?.name ?? 'Não atribuído'}
                    </span>
                  </div>

                  <span className="hidden sm:inline text-slate-300 font-light" aria-hidden="true">•</span>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <Users size={15} className="text-brand-700 shrink-0" />
                    <span className="text-muted font-medium">Equipe:</span>
                    <span className="font-semibold truncate">
                      {task.team?.name ?? 'Sem equipe'}
                    </span>
                  </div>

                  <span className="hidden sm:inline text-slate-300 font-light" aria-hidden="true">•</span>

                  <div className="flex items-center gap-1.5 min-w-0">
                    <Calendar size={15} className="text-brand-700 shrink-0" />
                    <span className="text-muted font-medium">{primaryDeadline?.label}:</span>
                    <span className="font-semibold truncate">
                      {primaryDeadline?.value}
                    </span>
                  </div>
                </div>

                {/* Linha de controle: Mais informações & Alerta de atraso */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => setShowMoreInfo((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900 transition-colors cursor-pointer select-none"
                    aria-expanded={showMoreInfo}
                  >
                    <span>{showMoreInfo ? 'Menos informações' : 'Mais informações'}</span>
                    {showMoreInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {currentCycle.overdue && (
                    <div
                      role="status"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-danger bg-red-50 border border-red-200/80 rounded-lg px-2.5 py-1"
                    >
                      <AlertTriangle size={13} className="shrink-0" />
                      <span>
                        {currentCycle.status === 'AWAITING_ACCEPTANCE'
                          ? 'Prazo de aceite vencido'
                          : currentCycle.status === 'IN_PROGRESS'
                          ? 'Prazo de execução vencido'
                          : 'Prazo vencido'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Área expandida de Mais informações */}
                {showMoreInfo && (
                  <div className="rounded-xl border border-border/80 bg-slate-50/50 p-3.5 space-y-3 animate-in fade-in duration-150">
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
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
                      <Info
                        label="Política de prazo"
                        value={policy === 'RUNNING_CLOCK' ? 'Prazos corridos' : 'Calendário'}
                      />
                      {currentCycle.acceptanceDeadlineAt && (
                        <Info
                          icon={Clock3}
                          label="Prazo de aceite"
                          value={localeDate(currentCycle.acceptanceDeadlineAt)}
                        />
                      )}
                      {currentCycle.acceptanceDurationMinutes && (
                        <Info
                          label="Duração de aceite"
                          value={`${currentCycle.acceptanceDurationMinutes} minutos`}
                        />
                      )}
                      {currentCycle.executionDeadlineAt && (
                        <Info
                          icon={Clock3}
                          label="Prazo de execução"
                          value={localeDate(currentCycle.executionDeadlineAt)}
                        />
                      )}
                      {currentCycle.executionDurationMinutes && (
                        <Info
                          label="Duração de execução"
                          value={`${currentCycle.executionDurationMinutes} minutos`}
                        />
                      )}
                      {policy === 'LEGACY_CALENDAR' && currentCycle.deadlineAt && (
                        <Info
                          icon={CalendarClock}
                          label="Prazo do calendário"
                          value={localeDate(currentCycle.deadlineAt)}
                        />
                      )}
                    </dl>

                    {/* Métricas de ciclo */}
                    <TaskMetrics cycle={currentCycle} assignment={currentAssignment} policy={policy} />
                  </div>
                )}
              </section>

              {/* 4. DESCRIÇÃO DA TAREFA */}
              <section aria-label="Descrição da tarefa" className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                    Descrição da tarefa
                  </h3>
                  {isDescLong && (
                    <button
                      type="button"
                      onClick={() => setIsDescExpanded((prev) => !prev)}
                      className="text-xs font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center gap-1 cursor-pointer select-none"
                      aria-expanded={isDescExpanded}
                    >
                      <span>{isDescExpanded ? 'Ver menos' : 'Ver mais'}</span>
                      {isDescExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}
                </div>
                <div
                  className={`rounded-xl border border-border/80 bg-slate-50/60 px-3.5 py-2.5 text-xs sm:text-sm text-text whitespace-pre-wrap leading-relaxed font-normal ${
                    !isDescExpanded && isDescLong ? 'line-clamp-3' : ''
                  }`}
                >
                  {descriptionText}
                </div>
              </section>

              {/* Vínculo SIGADOC (quando houver) */}
              {task.sigadocProcessNumber && task.sigadocProcessLink && (
                <section
                  aria-label="Processo SIGADOC vinculado"
                  className="rounded-xl border border-border/80 bg-slate-50/60 p-3 sm:px-3.5 sm:py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link2 size={16} className="text-brand-700 shrink-0" />
                      <span className="text-xs font-bold text-muted uppercase tracking-wider">
                        Processo SIGADOC:
                      </span>
                      <span className="text-xs font-bold text-text truncate">
                        {task.sigadocProcessNumber}
                      </span>
                    </div>
                    <a
                      href={task.sigadocProcessLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir processo SIGADOC ${task.sigadocProcessNumber} em nova aba`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-900 transition-colors"
                    >
                      <span>Abrir processo</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </section>
              )}

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

              {/* Percurso e histórico de execução */}
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
            </>
          )}
        </div>
      </div>

      {/* Pop-up de Encaminhamento Inicial da Tarefa */}
      {isAssignOpen && currentCycle && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setIsAssignOpen(false);
            }
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            ref={assignModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-task-modal-title"
            className="relative flex flex-col w-full max-w-md max-h-[90vh] rounded-2xl border border-border bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-left"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Send size={18} />
                </div>
                <div>
                  <h3 id="assign-task-modal-title" className="text-base font-extrabold text-text">
                    Encaminhar tarefa
                  </h3>
                  <p className="text-xs text-muted">Tarefa #{task.publicNumber}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar encaminhamento"
                disabled={busy}
                onClick={() => setIsAssignOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Formulário com rolagem interna */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {assignError && (
                <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-danger border border-red-200">
                  {assignError}
                </div>
              )}
              <AssignmentForm
                users={users}
                version={currentCycle.version}
                busy={busy}
                policy={policy}
                isReassignment={false}
                onCancel={() => setIsAssignOpen(false)}
                submitLabel="Confirmar encaminhamento"
                onSubmit={async (data) => {
                  setAssignError('');
                  const ok = await mutate(`/tasks/${task.id}/assignments`, data);
                  if (ok) {
                    setIsAssignOpen(false);
                  } else {
                    setAssignError(error || 'Não foi possível encaminhar a tarefa.');
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pop-up de Reatribuição de Responsável */}
      {isReassignOpen && currentCycle && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setIsReassignOpen(false);
            }
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            ref={reassignModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reassign-task-modal-title"
            className="relative flex flex-col w-full max-w-md max-h-[90vh] rounded-2xl border border-border bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-left"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <UserRoundCog size={18} />
                </div>
                <div>
                  <h3 id="reassign-task-modal-title" className="text-base font-extrabold text-text">
                    Reatribuir responsável
                  </h3>
                  <p className="text-xs text-muted">Tarefa #{task.publicNumber}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar reatribuição"
                disabled={busy}
                onClick={() => setIsReassignOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Formulário com rolagem interna */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {reassignError && (
                <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-danger border border-red-200">
                  {reassignError}
                </div>
              )}
              <AssignmentForm
                users={users}
                version={currentCycle.version}
                busy={busy}
                policy={policy}
                isReassignment={true}
                onCancel={() => setIsReassignOpen(false)}
                submitLabel="Confirmar reatribuição"
                onSubmit={async (data) => {
                  setReassignError('');
                  const ok = await mutate(`/tasks/${task.id}/assignments`, data);
                  if (ok) {
                    setIsReassignOpen(false);
                  } else {
                    setReassignError(error || 'Não foi possível reatribuir a tarefa.');
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pop-up de Edição da Tarefa (exclusivo do criador original) */}
      {isEditOpen && currentCycle && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setIsEditOpen(false);
            }
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            ref={editModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-task-modal-title"
            className="relative flex flex-col w-full max-w-lg max-h-[90vh] rounded-2xl border border-border bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-left"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 id="edit-task-modal-title" className="text-base font-extrabold text-text">
                    Editar tarefa
                  </h3>
                  <p className="text-xs text-muted">Tarefa #{task.publicNumber}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar edição"
                disabled={busy}
                onClick={() => setIsEditOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Formulário com rolagem interna */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setEditError('');
                const form = e.currentTarget;
                const formData = new FormData(form);
                const title = String(formData.get('title') || '').trim();
                const description = String(formData.get('description') || '').trim();
                const priority = String(formData.get('priority') || '');
                const reason = String(formData.get('reason') || '').trim();

                if (reason.length < 5) {
                  setEditError('A justificativa da alteração deve ter no mínimo 5 caracteres.');
                  return;
                }

                const rawSigadocNumber = String(formData.get('sigadocProcessNumber') || '').trim();
                const rawSigadocLink = String(formData.get('sigadocProcessLink') || '').trim();

                if ((rawSigadocNumber && !rawSigadocLink) || (!rawSigadocNumber && rawSigadocLink)) {
                  setEditError('Para vincular processo SIGADOC, informe tanto o número quanto o link.');
                  return;
                }

                if (rawSigadocLink) {
                  let validUrl = false;
                  try {
                    const parsed = new URL(rawSigadocLink);
                    validUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:';
                  } catch {
                    validUrl = false;
                  }
                  if (!validUrl) {
                    setEditError('O link do processo SIGADOC deve ser uma URL válida com protocolo HTTP ou HTTPS.');
                    return;
                  }
                }

                const payload: any = {
                  title,
                  description,
                  priority,
                  expectedVersion: currentCycle.version,
                  reason,
                };

                if (rawSigadocNumber && rawSigadocLink) {
                  payload.sigadocProcessNumber = rawSigadocNumber;
                  payload.sigadocProcessLink = rawSigadocLink;
                } else if (task.sigadocProcessNumber || task.sigadocProcessLink) {
                  // Remoção explícita do processo vinculado
                  payload.sigadocProcessNumber = null;
                  payload.sigadocProcessLink = null;
                }

                const success = await mutate(`/tasks/${task.id}`, payload, 'PATCH');

                if (success) {
                  setIsEditOpen(false);
                }
              }}
              className="flex flex-col overflow-hidden"
            >
              <div className="overflow-y-auto p-4 sm:p-6 space-y-4">
                {editError && (
                  <div role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-danger border border-red-200">
                    {editError}
                  </div>
                )}

                <label className="block text-xs font-bold text-muted">
                  Título
                  <input
                    aria-label="Título"
                    name="title"
                    defaultValue={currentCycle.title}
                    required
                    minLength={3}
                    maxLength={255}
                    disabled={busy}
                    className="field mt-1"
                  />
                </label>

                <label className="block text-xs font-bold text-muted">
                  Descrição
                  <textarea
                    aria-label="Descrição"
                    name="description"
                    defaultValue={currentCycle.description}
                    required
                    minLength={3}
                    maxLength={10000}
                    rows={4}
                    disabled={busy}
                    className="field mt-1"
                  />
                </label>

                <label className="block text-xs font-bold text-muted">
                  Prioridade
                  <select
                    aria-label="Prioridade"
                    name="priority"
                    defaultValue={currentCycle.priority}
                    disabled={busy}
                    className="field mt-1"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </label>

                {/* Seção SIGADOC no formulário de edição */}
                <div className="rounded-xl border border-border/80 bg-slate-50/50 p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted uppercase tracking-wider">
                    <Link2 size={14} className="text-brand-700" />
                    <span>Processo SIGADOC vinculado</span>
                    <span className="text-[11px] font-normal text-muted lowercase">(opcional)</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <label className="block text-xs font-bold text-muted">
                      Número do processo
                      <input
                        aria-label="Número do processo SIGADOC"
                        name="sigadocProcessNumber"
                        defaultValue={task.sigadocProcessNumber || ''}
                        placeholder="Informe o número do processo"
                        maxLength={128}
                        disabled={busy}
                        className="field mt-1 text-xs"
                      />
                    </label>
                    <label className="block text-xs font-bold text-muted">
                      Link do processo
                      <input
                        aria-label="Link do processo SIGADOC"
                        type="url"
                        name="sigadocProcessLink"
                        defaultValue={task.sigadocProcessLink || ''}
                        placeholder="https://..."
                        maxLength={2048}
                        disabled={busy}
                        className="field mt-1 text-xs"
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-muted">
                    Deixe ambos os campos vazios para desvincular o processo da tarefa.
                  </p>
                </div>

                <label className="block text-xs font-bold text-muted">
                  Justificativa da alteração
                  <textarea
                    aria-label="Justificativa da alteração"
                    name="reason"
                    placeholder="Informe o motivo da alteração (mínimo 5 caracteres)"
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={3}
                    disabled={busy}
                    className="field mt-1"
                  />
                </label>
              </div>

              {/* Rodapé */}
              <div className="flex items-center justify-end gap-2 border-t border-border p-4 sm:px-6 bg-slate-50/50">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setIsEditOpen(false)}
                  className="action-secondary"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="action-primary"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pop-up de Confirmação de Cancelamento (exclusivo do criador original) */}
      {isCancelOpen && currentCycle && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setIsCancelOpen(false);
            }
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            ref={cancelModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-task-modal-title"
            className="relative flex flex-col w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-left"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-red-50 text-danger">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 id="cancel-task-modal-title" className="text-base font-extrabold text-text">
                    Cancelar tarefa
                  </h3>
                  <p className="text-xs text-muted">Tarefa #{task.publicNumber}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar cancelamento"
                disabled={busy}
                onClick={() => setIsCancelOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo */}
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-text leading-relaxed">
                Tem certeza de que deseja cancelar a tarefa #{task.publicNumber}? Esta ação será registrada no histórico da tarefa.
              </p>

              {cancelError && (
                <div role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-danger border border-red-200">
                  {cancelError}
                </div>
              )}

              <label className="block text-xs font-bold text-muted">
                Justificativa do cancelamento
                <textarea
                  aria-label="Justificativa do cancelamento"
                  name="cancelReason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Informe a justificativa do cancelamento (mínimo 5 caracteres)"
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={3}
                  disabled={busy}
                  className="field mt-1"
                />
                <span className="mt-1 block text-[11px] text-muted">
                  {cancelReason.trim().length < 5
                    ? `Mínimo de 5 caracteres (${cancelReason.trim().length}/5)`
                    : `${cancelReason.trim().length}/2000 caracteres`}
                </span>
              </label>
            </div>

            {/* Rodapé */}
            <div className="flex items-center justify-end gap-2 border-t border-border p-4 sm:px-6 bg-slate-50/50">
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsCancelOpen(false)}
                className="action-secondary"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={busy || cancelReason.trim().length < 5}
                onClick={async () => {
                  if (cancelReason.trim().length < 5) return;
                  setCancelError('');
                  const success = await mutate(`/tasks/${task.id}/cancel`, {
                    expectedVersion: currentCycle.version,
                    reason: cancelReason.trim(),
                  });
                  if (success) {
                    setIsCancelOpen(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Pop-up de Rejeição de Atribuição */}
      {isRejectOpen && currentAssignment && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setIsRejectOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            ref={rejectModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-assignment-modal-title"
            className="relative flex flex-col w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-left"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-red-50 text-danger">
                  <X size={18} />
                </div>
                <div>
                  <h3 id="reject-assignment-modal-title" className="text-base font-extrabold text-text">
                    Rejeitar atribuição
                  </h3>
                  <p className="text-xs text-muted">Tarefa #{task.publicNumber}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar rejeição"
                disabled={busy}
                onClick={() => setIsRejectOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo */}
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-text leading-relaxed">
                Informe a justificativa da rejeição da atribuição. Esta informação será registrada no histórico e a equipe será notificada.
              </p>

              {rejectError && (
                <div role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-danger border border-red-200">
                  {rejectError}
                </div>
              )}

              <label className="block text-xs font-bold text-muted">
                Justificativa da rejeição (obrigatória)
                <textarea
                  aria-label="Justificativa"
                  placeholder="Justificativa obrigatória"
                  minLength={5}
                  maxLength={2000}
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  disabled={busy}
                  className="field mt-1"
                />
                <span className="mt-1 block text-[11px] text-muted">
                  {rejectReason.trim().length < 5
                    ? `Mínimo de 5 caracteres (${rejectReason.trim().length}/5)`
                    : `${rejectReason.trim().length}/2000 caracteres`}
                </span>
              </label>
            </div>

            {/* Rodapé */}
            <div className="flex items-center justify-end gap-2 border-t border-border p-4 sm:px-6 bg-slate-50/50">
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsRejectOpen(false)}
                className="action-secondary"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={busy || rejectReason.trim().length < 5}
                onClick={async () => {
                  if (rejectReason.trim().length < 5) return;
                  setRejectError('');
                  const ok = await mutate(`/assignments/${currentAssignment.id}/reject`, {
                    expectedVersion: currentCycle.version,
                    reason: rejectReason.trim(),
                  });
                  if (ok) setIsRejectOpen(false);
                  else setRejectError(error || 'Não foi possível rejeitar a atribuição.');
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                Confirmar rejeição
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up de Conclusão da Tarefa */}
      {isCompleteOpen && currentCycle && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setIsCompleteOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            ref={completeModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-task-modal-title"
            className="relative flex flex-col w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-left"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h3 id="complete-task-modal-title" className="text-base font-extrabold text-text">
                    Concluir tarefa
                  </h3>
                  <p className="text-xs text-muted">Tarefa #{task.publicNumber}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar conclusão"
                disabled={busy}
                onClick={() => setIsCompleteOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo */}
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-text leading-relaxed">
                Descreva os resultados alcançados e as entregas realizadas nesta execução.
              </p>

              {completeError && (
                <div role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-danger border border-red-200">
                  {completeError}
                </div>
              )}

              <label className="block text-xs font-bold text-muted">
                Descrição dos resultados (mínimo 10 caracteres)
                <textarea
                  aria-label="Descrição dos resultados"
                  placeholder="Descrição dos resultados"
                  minLength={10}
                  maxLength={10000}
                  rows={4}
                  required
                  value={completeText}
                  onChange={(e) => setCompleteText(e.target.value)}
                  disabled={busy}
                  className="field mt-1"
                />
                <span className="mt-1 block text-[11px] text-muted">
                  {completeText.trim().length < 10
                    ? `Mínimo de 10 caracteres (${completeText.trim().length}/10)`
                    : `${completeText.trim().length}/10000 caracteres`}
                </span>
              </label>
            </div>

            {/* Rodapé */}
            <div className="flex items-center justify-end gap-2 border-t border-border p-4 sm:px-6 bg-slate-50/50">
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsCompleteOpen(false)}
                className="action-secondary"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={busy || completeText.trim().length < 10}
                onClick={async () => {
                  if (completeText.trim().length < 10) return;
                  setCompleteError('');
                  const ok = await mutate(`/tasks/${task.id}/complete`, {
                    expectedVersion: currentCycle.version,
                    completionText: completeText.trim(),
                  });
                  if (ok) setIsCompleteOpen(false);
                  else setCompleteError(error || 'Não foi possível concluir a tarefa.');
                }}
                className="action-primary"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Confirmar conclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up de Solicitações (Prorrogação e Devolução) */}
      {isRequestOpen && currentCycle && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setIsRequestOpen(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div
            ref={requestModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-task-modal-title"
            className="relative flex flex-col w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-left"
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-border p-4 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <RotateCcw size={18} />
                </div>
                <div>
                  <h3 id="request-task-modal-title" className="text-base font-extrabold text-text">
                    Solicitações
                  </h3>
                  <p className="text-xs text-muted">Devolução ou prorrogação de prazo</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar solicitações"
                disabled={busy}
                onClick={() => setIsRequestOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo */}
            <div className="p-4 sm:p-6">
              <RequestActions
                taskId={task.id}
                version={currentCycle.version}
                mutate={async (path, data) => {
                  const ok = await mutate(path, data);
                  if (ok) setIsRequestOpen(false);
                  return ok;
                }}
                busy={busy}
                policy={policy}
              />
            </div>
          </div>
        </div>
      )}
      {/* Painel do Chat da Tarefa */}
      {isChatOpen && task && (
        <TaskChatPanel
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          taskId={task.id}
          taskPublicNumber={task.publicNumber}
          taskTitle={currentCycle?.title || task.title}
          triggerElement={chatButtonRef.current}
        />
      )}
    </div>
  );
}


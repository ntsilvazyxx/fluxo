import {
  Activity,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { localeDate } from './TaskDetailShared.tsx';

const ACTION_LABELS: Record<string, string> = {
  TASK_CREATED_AND_ASSIGNED: 'Tarefa criada e atribuída',
  TASK_CREATED: 'Tarefa criada',
  TASK_ASSIGNED: 'Responsável atribuído',
  TASK_REASSIGNED: 'Responsável reatribuído',
  ASSIGNMENT_ACCEPTED: 'Atribuição aceita pelo responsável',
  ASSIGNMENT_REJECTED: 'Atribuição rejeitada pelo responsável',
  TASK_COMPLETED: 'Tarefa concluída com sucesso',
  TASK_CANCELLED: 'Tarefa cancelada definitivamente',
  TASK_REOPENED: 'Tarefa reaberta para novo ciclo',
  TASK_RESTORED: 'Tarefa restaurada',
  TASK_UPDATED: 'Dados da tarefa atualizados',
  TASK_REQUEST_CREATED: 'Nova solicitação registrada',
  TASK_REQUEST_APPROVED: 'Solicitação aprovada',
  TASK_REQUEST_DENIED: 'Solicitação negada',
  ATTACHMENT_UPLOADED: 'Anexo adicionado à tarefa',
  ATTACHMENT_REMOVED: 'Anexo removido da tarefa',
  IMAGE_UPLOADED: 'Imagem adicionada à galeria',
  IMAGE_REMOVED: 'Imagem removida da galeria',
  USER_PASSWORD_RESET_BY_ADMIN: 'Senha redefinida pelo administrador',
};

function getInitials(name?: string) {
  if (!name || typeof name !== 'string') return 'SEAF';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SEAF';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function generateClientMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface ActivityItem {
  id: string;
  type: 'comment' | 'event' | 'note';
  authorName: string;
  createdAt: string;
  content: string;
  reason?: string | null;
  clientMessageId?: string | null;
}

export function TaskActivitiesTimeline({ task }: { task: any }) {
  const { request } = useAuth();
  const [comments, setComments] = useState<any[]>(() => task?.comments ?? []);
  const [prevTaskComments, setPrevTaskComments] = useState(() => task?.comments);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const clientMessageIdRef = useRef<string>(generateClientMessageId());

  // Ajusta comentários sincronamente quando a prop task.comments mudar
  if (task?.comments !== prevTaskComments) {
    setPrevTaskComments(task?.comments);
    setComments(task?.comments ?? []);
  }

  // Polling suave e periódico a cada 10s enquanto o modal/painel estiver montado
  useEffect(() => {
    if (!task?.id) return;
    let active = true;

    const interval = setInterval(async () => {
      try {
        const response = await request(`/tasks/${task.id}/comments`);
        if (!response.ok || !active) return;
        const json = await response.json();
        if (json.data?.comments && active) {
          setComments(json.data.comments);
        }
      } catch {
        // Falhas transitórias de polling silenciosas para não interromper digitação
      }
    }, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [task?.id, request]);

  // Verifica se a tarefa está em estado terminal (COMPLETED ou CANCELLED)
  const currentCycle = task?.cycle || task?.currentCycle;
  const isClosed =
    currentCycle?.status === 'COMPLETED' ||
    currentCycle?.status === 'CANCELLED' ||
    Boolean(currentCycle?.closedAt);

  // Unificação cronológica de Comentários, Eventos de Auditoria e Notas de Ciclo
  const items = useMemo(() => {
    const list: ActivityItem[] = [];

    // 1. Comentários reais de usuários (persistidos na tabela task_comments)
    if (Array.isArray(comments)) {
      for (const comment of comments) {
        list.push({
          id: comment.id,
          type: 'comment',
          authorName: comment.author?.name || 'Usuário',
          createdAt: comment.createdAt,
          content: comment.content,
          clientMessageId: comment.clientMessageId,
        });
      }
    }

    // 2. Eventos automáticos da tarefa (auditoria oficial do sistema)
    if (Array.isArray(task?.history)) {
      for (const event of task.history) {
        const readableAction =
          ACTION_LABELS[event.action] || event.action?.replace(/_/g, ' ') || 'Evento registrado';
        const displayContent = event.reason ? `${readableAction}: "${event.reason}"` : readableAction;
        list.push({
          id: event.id || `event-${event.createdAt}`,
          type: 'event',
          authorName: event.actor?.name || 'Sistema SEAF',
          createdAt: event.createdAt,
          content: displayContent,
          reason: event.reason,
        });
      }
    }

    // 3. Notas de execução de ciclo (preservadas e distinguidas de comentários de chat)
    if (Array.isArray(task?.cycles)) {
      for (const cycle of task.cycles) {
        if (Array.isArray(cycle.notes)) {
          for (const note of cycle.notes) {
            list.push({
              id: note.id || `note-${note.createdAt}`,
              type: 'note',
              authorName: note.author?.name || 'Responsável',
              createdAt: note.createdAt,
              content: note.content || note.reason || 'Nota registrada',
              reason: note.reason,
            });
          }
        }
      }
    }

    // Ordenação cronológica estrita por timestamp com desempate determinístico
    list.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeA !== timeB) return timeA - timeB;
      // Critério determinístico de desempate: eventos do sistema precedem notas e comentários
      if (a.type !== b.type) {
        if (a.type === 'event') return -1;
        if (b.type === 'event') return 1;
        if (a.type === 'note') return -1;
        if (b.type === 'note') return 1;
      }
      return (a.id || '').localeCompare(b.id || '');
    });

    return list;
  }, [comments, task]);

  // Envio de comentário
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed || trimmed.length > 2000 || submitting || isClosed) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const response = await request(`/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: trimmed,
          clientMessageId: clientMessageIdRef.current,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error?.message || 'Falha ao enviar comentário.');
      }

      const created = json.data?.comment;
      if (created) {
        setComments((prev) => {
          // Previne duplicatas se já incluído pelo polling ou resposta
          if (
            prev.some(
              (c) =>
                c.id === created.id ||
                (created.clientMessageId && c.clientMessageId === created.clientMessageId),
            )
          ) {
            return prev;
          }
          return [...prev, created];
        });
      }

      // Sucesso: limpa o campo e gera nova chave de mensagem
      setCommentText('');
      clientMessageIdRef.current = generateClientMessageId();
    } catch (err: any) {
      // Erro: preserva o texto digitado no textarea e exibe mensagem de falha
      setSubmitError(err.message || 'Erro de conexão ao enviar comentário. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sem Shift envia o comentário; Shift+Enter quebra a linha
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const [showAllActivities, setShowAllActivities] = useState(false);

  const charsRemaining = 2000 - commentText.length;
  const isOverLimit = charsRemaining < 0;

  const displayedItems = showAllActivities || items.length <= 5 ? items : items.slice(-5);

  return (
    <section
      aria-label="Comentários e Atividades"
      className="rounded-xl border border-border bg-white p-3.5 sm:p-4 shadow-2xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2.5">
        <div className="flex items-center gap-2">
          <MessageSquare size={17} className="text-brand-700" />
          <h3 className="text-sm font-extrabold text-text">Comentários e Atividades</h3>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllActivities((prev) => !prev)}
              className="text-xs font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center gap-1 cursor-pointer select-none"
              aria-expanded={showAllActivities}
            >
              <span>{showAllActivities ? 'Mostrar recentes' : `Exibir todas (${items.length})`}</span>
              {showAllActivities ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
          <span className="text-xs text-muted">
            {items.length === 1 ? '1 registro' : `${items.length} registros`}
          </span>
        </div>
      </div>

      {/* Linha do tempo vertical: estruturalmente idêntica no Desktop e Mobile */}
      <div className="mt-3">
        {items.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted italic">
            Nenhuma atividade ou comentário registrado para esta tarefa ainda.
          </p>
        ) : (
          <div className="relative border-l-2 border-slate-200 ml-3.5 pl-3.5 sm:ml-4 sm:pl-4 space-y-2.5">
            {displayedItems.map((item) => {
              const isComment = item.type === 'comment';
              const isNote = item.type === 'note';

              return (
                <article key={item.id} className="relative group">
                  {/* Ponto / Ícone na linha do tempo */}
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[24px] sm:-left-[26px] top-0.5 flex size-5 sm:size-6 items-center justify-center rounded-full border shadow-2xs ${
                      isComment
                        ? 'bg-blue-100 text-blue-700 border-blue-300 font-bold text-[9px]'
                        : isNote
                          ? 'bg-amber-100 text-amber-700 border-amber-300 font-bold text-[9px]'
                          : 'bg-slate-100 text-slate-600 border-slate-300 text-[9px]'
                    }`}
                  >
                    {isComment ? (
                      getInitials(item.authorName)
                    ) : isNote ? (
                      <FileText size={11} className="text-amber-700" />
                    ) : (
                      <Activity size={11} className="text-slate-600" />
                    )}
                  </span>

                  {/* Conteúdo da mensagem / evento */}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-bold text-xs text-text truncate">{item.authorName}</span>
                      {isComment ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold">
                          <MessageSquare size={9} /> Comentário
                        </span>
                      ) : isNote ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                          <FileText size={9} /> Nota de execução
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold">
                          <ShieldCheck size={9} /> Evento do sistema
                        </span>
                      )}
                      <time className="text-[11px] text-muted shrink-0">{localeDate(item.createdAt)}</time>
                    </div>

                    <div
                      className={`mt-1 rounded-xl p-2.5 sm:p-3 text-xs leading-relaxed ${
                        isComment
                          ? 'bg-blue-50/50 border border-blue-100 text-slate-800 whitespace-pre-wrap font-normal'
                          : isNote
                            ? 'bg-amber-50/50 border border-amber-200 text-amber-900 whitespace-pre-wrap font-normal'
                            : 'bg-slate-50 border border-border text-slate-700 font-normal'
                      }`}
                    >
                      {item.content}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Área de envio de comentários funcional (Fase 5) */}
      <form onSubmit={handleSend} className="mt-5 rounded-xl border border-border bg-slate-50/70 p-3 sm:p-4">
        {isClosed ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            <Lock size={15} className="shrink-0 text-amber-700" />
            <span>
              Esta tarefa foi {currentCycle?.status === 'COMPLETED' ? 'concluída' : 'cancelada'}. O envio de novos
              comentários está desabilitado para tarefas finalizadas.
            </span>
          </div>
        ) : (
          <>
            <label htmlFor="task-comment-input" className="sr-only">
              Escreva seu comentário
            </label>
            <textarea
              id="task-comment-input"
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={submitting}
              placeholder="Escreva seu comentário..."
              className="w-full resize-none rounded-lg border border-border bg-white p-2.5 text-xs text-slate-800 placeholder:text-muted focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 disabled:bg-slate-100 disabled:cursor-not-allowed"
              aria-label="Escreva seu comentário"
              maxLength={2000}
            />

            {/* Alerta de erro com botão para tentar novamente preservando o texto digitado */}
            {submitError && (
              <div
                role="alert"
                className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle size={14} className="shrink-0 text-rose-600" />
                  <span className="truncate">{submitError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={submitting}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 underline shrink-0"
                >
                  <RotateCcw size={11} />
                  <span>Tentar novamente</span>
                </button>
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  title="Anexar arquivo diretamente no chat estará disponível em breve"
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-muted cursor-not-allowed opacity-60"
                >
                  <Paperclip size={13} />
                  <span>Anexar</span>
                </button>
                <span
                  className={`text-[11px] ${isOverLimit ? 'text-rose-600 font-bold' : 'text-muted'}`}
                >
                  {charsRemaining} caracteres restantes
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted hidden md:inline">
                  Pressione <kbd className="rounded border border-border bg-white px-1 py-0.5 text-[10px]">Enter</kbd> para enviar
                </span>
                <button
                  type="submit"
                  disabled={submitting || !commentText.trim() || isOverLimit}
                  className="action-primary py-1.5 px-3.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      <span>Enviar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </form>
    </section>
  );
}

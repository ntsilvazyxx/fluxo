import { Activity, Info, MessageSquare, Paperclip, Send, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
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

interface ActivityItem {
  id: string;
  type: 'comment' | 'event';
  authorName: string;
  createdAt: string;
  content: string;
  reason?: string | null;
}

export function TaskActivitiesTimeline({ task }: { task: any }) {
  const items = useMemo(() => {
    const list: ActivityItem[] = [];

    // 1. Cycle notes (comentários manuais registrados nos ciclos)
    if (Array.isArray(task.cycles)) {
      for (const cycle of task.cycles) {
        if (Array.isArray(cycle.notes)) {
          for (const note of cycle.notes) {
            list.push({
              id: note.id || `note-${note.createdAt}`,
              type: 'comment',
              authorName: note.author?.name || 'Responsável',
              createdAt: note.createdAt,
              content: note.content || note.reason || 'Comentário sem texto',
              reason: note.reason,
            });
          }
        }
      }
    }

    // 2. Audit events (eventos automáticos do sistema)
    if (Array.isArray(task.history)) {
      for (const event of task.history) {
        const readableAction = ACTION_LABELS[event.action] || event.action?.replace(/_/g, ' ') || 'Evento registrado';
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

    // Ordenação cronológica (do mais antigo ao mais recente)
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return list;
  }, [task]);

  return (
    <section
      aria-label="Comentários e Atividades"
      className="rounded-xl border border-border bg-white p-4 sm:p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-brand-700" />
          <h3 className="text-base font-extrabold text-text">Comentários e Atividades</h3>
        </div>
        <span className="text-xs text-muted">
          {items.length === 1 ? '1 registro' : `${items.length} registros`}
        </span>
      </div>

      {/* Linha do tempo vertical estruturalmente idêntica no Desktop e Mobile */}
      <div className="mt-4">
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted italic">
            Nenhuma atividade ou comentário registrado para esta tarefa ainda.
          </p>
        ) : (
          <div className="relative border-l-2 border-slate-200 ml-4 pl-4 sm:ml-5 sm:pl-5 space-y-4">
            {items.map((item) => {
              const isComment = item.type === 'comment';
              return (
                <article key={item.id} className="relative group">
                  {/* Ponto / Ícone na linha do tempo */}
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[27px] sm:-left-[31px] top-0 flex size-6 sm:size-7 items-center justify-center rounded-full border shadow-xs ${
                      isComment
                        ? 'bg-blue-100 text-blue-700 border-blue-300 font-bold text-[10px]'
                        : 'bg-slate-100 text-slate-600 border-slate-300 text-[10px]'
                    }`}
                  >
                    {isComment ? (
                      getInitials(item.authorName)
                    ) : (
                      <Activity size={12} className="text-slate-600" />
                    )}
                  </span>

                  {/* Conteúdo da mensagem / evento */}
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-bold text-xs text-text truncate">{item.authorName}</span>
                      {isComment ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold">
                          <MessageSquare size={9} /> Comentário
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold">
                          <ShieldCheck size={9} /> Evento do sistema
                        </span>
                      )}
                      <time className="text-[11px] text-muted shrink-0">{localeDate(item.createdAt)}</time>
                    </div>

                    <div
                      className={`mt-1 rounded-xl p-3 text-xs leading-relaxed ${
                        isComment
                          ? 'bg-blue-50/50 border border-blue-100 text-slate-800 whitespace-pre-wrap font-normal'
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

      {/* Área reservada para envio de comentários (Fase 5) */}
      <div className="mt-5 rounded-xl border border-border bg-slate-50/70 p-3 sm:p-4">
        <label htmlFor="task-comment-input" className="sr-only">
          Escreva seu comentário
        </label>
        <textarea
          id="task-comment-input"
          rows={3}
          disabled
          placeholder="Escreva seu comentário..."
          className="w-full resize-none rounded-lg border border-border bg-white p-2.5 text-xs text-slate-700 placeholder:text-muted cursor-not-allowed opacity-80 focus:outline-none"
          aria-label="Escreva seu comentário (disponível na Fase 5)"
        />
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              title="Anexar arquivo (disponível na Fase 5)"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-muted cursor-not-allowed opacity-70"
            >
              <Paperclip size={13} />
              <span>Anexar</span>
            </button>
            <span className="text-[11px] text-muted hidden sm:inline">
              O chat com persistência e envio de mensagens em tempo real será ativado na Fase 5.
            </span>
          </div>
          <button
            type="button"
            disabled
            title="Envio disponível na Fase 5"
            className="action-primary py-1.5 px-3 text-xs opacity-60 cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <Send size={13} />
            <span>Enviar</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted sm:hidden flex items-center gap-1">
          <Info size={12} className="shrink-0 text-brand-700" />
          O envio de comentários estará disponível na Fase 5.
        </p>
      </div>
    </section>
  );
}

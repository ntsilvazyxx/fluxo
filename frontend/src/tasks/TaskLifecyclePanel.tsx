import { ChevronDown, ChevronUp, Route, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { StatusBadge } from './task-ui.tsx';

export function TaskLifecyclePanel({ task, cycle, canManage, busy, mutate }: any) {
  const terminal = ['COMPLETED', 'CANCELLED'].includes(cycle?.status);
  const allCycles: any[] = task?.cycles ?? [];
  const otherCycles = allCycles.filter((item: any) => item.id !== cycle?.id);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="space-y-3">
      {canManage && terminal && (
        <section className="rounded-xl border border-border bg-white p-3.5 sm:p-4 shadow-2xs">
          <h2 className="text-sm font-extrabold text-text">Reabertura / Novo percurso</h2>
          <p className="mt-0.5 text-xs text-muted">
            O histórico atual será preservado. O novo percurso começará pendente, sem responsável e sem prazo.
          </p>
          <RestartForm
            busy={busy}
            label={cycle.status === 'COMPLETED' ? 'Reabrir tarefa' : 'Restaurar tarefa'}
            onSubmit={(reason: string) =>
              mutate(`/tasks/${task.id}/${cycle.status === 'COMPLETED' ? 'reopen' : 'restore'}`, {
                expectedVersion: cycle.version,
                reason,
              })
            }
          />
        </section>
      )}

      <section className="rounded-xl border border-border bg-white p-3.5 sm:p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Route className="text-brand-700" size={17} />
            <h2 className="text-sm font-extrabold text-text">Percurso da tarefa</h2>
            <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 border border-brand-200">
              Percurso {cycle?.cycleNumber || 1}
            </span>
          </div>

          {otherCycles.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
              className="text-xs font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center gap-1 cursor-pointer select-none"
              aria-expanded={showHistory}
            >
              <span>{showHistory ? 'Ocultar anteriores' : `Ver anteriores (${otherCycles.length})`}</span>
              {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>

        {/* Resumo do percurso atual */}
        <div className="mt-3">
          <CycleCard cycle={cycle} isCurrent />
        </div>

        {/* Histórico de percursos anteriores expandido */}
        {showHistory && otherCycles.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-border/80 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Percursos anteriores
            </p>
            {otherCycles.map((item: any) => (
              <CycleCard key={item.id} cycle={item} isCurrent={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CycleCard({ cycle, isCurrent }: { cycle: any; isCurrent?: boolean }) {
  if (!cycle) return null;
  const responsible = cycle.assignments?.at(-1)?.user?.name ?? 'Sem responsável';
  return (
    <article
      className={`rounded-lg border p-2.5 sm:p-3 text-xs ${
        isCurrent ? 'border-brand-200 bg-brand-50/25' : 'border-border/80 bg-slate-50/50'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-xs sm:text-sm text-text">
            Percurso {cycle.cycleNumber}
            {isCurrent && (
              <span className="ml-1.5 rounded bg-brand-100 text-brand-800 text-[10px] font-bold px-1.5 py-0.5">
                Atual
              </span>
            )}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {responsible} · aberto em {new Date(cycle.openedAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <StatusBadge status={cycle.status} />
      </div>
      <p className="mt-1 text-xs text-slate-700">
        Prazo: {cycle.deadlineAt ? new Date(cycle.deadlineAt).toLocaleString('pt-BR') : 'sem prazo'}
      </p>
      {cycle.closedAt && (
        <p className="mt-0.5 text-[11px] text-muted">
          Encerrado em {new Date(cycle.closedAt).toLocaleString('pt-BR')}
        </p>
      )}
    </article>
  );
}

function RestartForm({ busy, label, onSubmit }: any) {
  const [reason, setReason] = useState('');
  return (
    <form
      className="mt-3 space-y-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(reason);
      }}
    >
      <textarea
        className="field"
        minLength={5}
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Justificativa obrigatória"
        rows={2}
      />
      <button disabled={busy} className="action-primary text-xs sm:text-sm">
        <RotateCcw size={16} />
        {label}
      </button>
    </form>
  );
}

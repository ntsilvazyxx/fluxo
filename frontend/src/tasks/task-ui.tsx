import {
  AlertTriangle,
  CalendarClock,
  Circle,
  CircleCheck,
  Clock3,
  GripVertical,
  MoreHorizontal,
  Palette,
  RotateCcw,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdvancedColorPicker } from './AdvancedColorPicker.tsx';
import {
  CARD_COLORS,
  CardColorKey,
  COLOR_OPTIONS,
  getCardColorConfig,
  isValidHex,
} from './task-colors.ts';

const statusLabels = {
  PENDING: 'Pendente',
  AWAITING_ACCEPTANCE: 'Aguardando aceite',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const priorityLabels = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-900">
      <Circle size={10} fill="currentColor" />
      {statusLabels[status as keyof typeof statusLabels] || status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const danger = priority === 'URGENT';
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${danger ? 'bg-red-50 text-danger' : 'bg-slate-100 text-muted'
        }`}
    >
      {priorityLabels[priority as keyof typeof priorityLabels] || priority}
    </span>
  );
}

export function TaskCard({
  task,
  compact = false,
  personal = false,
  search = '',
  color,
  onColorChange,
  onSelect,
  dragHandleProps,
}: {
  task: any;
  compact?: boolean;
  personal?: boolean;
  search?: string;
  color?: string;
  onColorChange?: (color: string | null) => void;
  onSelect?: (task: any, trigger?: HTMLElement) => void;
  dragHandleProps?: Record<string, any>;
}) {
  const c = task.cycle;
  const navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const paletteBtnRef = useRef<HTMLButtonElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [popoverPlacement, setPopoverPlacement] = useState<'bottom' | 'top'>('bottom');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});
  const target = `/kanban/tarefas/${task.id}${search}`;
  const colorConfig = getCardColorConfig(color);
  const isCustomColor = Boolean(color && color !== 'default');

  // Garante que apenas um pop-up permaneça aberto simultaneamente
  useEffect(() => {
    const handleCloseOthers = (e: Event) => {
      const custom = e as CustomEvent<{ id: string; type: string }>;
      if (custom.detail?.id !== task.id) {
        setSummaryOpen(false);
        setPaletteOpen(false);
        setIsAdvancedOpen(false);
      }
    };
    window.addEventListener('seaf:close-task-popups', handleCloseOthers);
    return () => window.removeEventListener('seaf:close-task-popups', handleCloseOthers);
  }, [task.id]);

  const openSummary = () => {
    if (menu.current) {
      menu.current.open = false;
    }
    setPaletteOpen(false);
    setIsAdvancedOpen(false);
    setSummaryOpen(true);
    window.dispatchEvent(
      new CustomEvent('seaf:close-task-popups', {
        detail: { id: task.id, type: 'summary' },
      }),
    );
  };

  const togglePalette = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSummaryOpen(false);
    setPaletteOpen((prev) => {
      const next = !prev;
      if (!next) {
        setIsAdvancedOpen(false);
      } else {
        window.dispatchEvent(
          new CustomEvent('seaf:close-task-popups', {
            detail: { id: task.id, type: 'palette' },
          }),
        );
      }
      return next;
    });
  };

  // Posicionamento inteligente da paleta (abre para cima se o espaço inferior for insuficiente)
  useEffect(() => {
    if (!paletteOpen || !paletteBtnRef.current) return;
    const rect = paletteBtnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 310) {
      setPopoverPlacement('top');
    } else {
      setPopoverPlacement('bottom');
    }
  }, [paletteOpen, isAdvancedOpen]);

  // Teclado e clique fora para a paleta
  useEffect(() => {
    if (!paletteOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAdvancedOpen) {
          setIsAdvancedOpen(false);
        } else {
          setPaletteOpen(false);
          paletteBtnRef.current?.focus();
        }
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setPaletteOpen(false);
        setIsAdvancedOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [paletteOpen, isAdvancedOpen]);

  // Teclado, foco e clique fora para o pop-up compacto de resumo
  useEffect(() => {
    if (!summaryOpen) return;
    const closeBtn = summaryRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Fechar resumo"]');
    closeBtn?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSummaryOpen(false);
        menu.current?.querySelector('summary')?.focus();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (summaryRef.current && !summaryRef.current.contains(e.target as Node)) {
        setSummaryOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [summaryOpen]);

  // Ajuste de posicionamento inteligente para manter o resumo dentro da tela
  useEffect(() => {
    if (!summaryOpen || !summaryRef.current) return;
    const adjustPosition = () => {
      if (!summaryRef.current) return;
      const rect = summaryRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let adjustX = 0;
      let adjustY = 0;

      if (rect.right > viewportWidth - 8) {
        adjustX = viewportWidth - 8 - rect.right;
      } else if (rect.left < 8) {
        adjustX = 8 - rect.left;
      }

      if (rect.bottom > viewportHeight - 8) {
        adjustY = viewportHeight - 8 - rect.bottom;
      } else if (rect.top < 8) {
        adjustY = 8 - rect.top;
      }

      if (adjustX !== 0 || adjustY !== 0) {
        setPositionStyle({
          transform: `translate(${adjustX}px, ${adjustY}px)`,
        });
      } else {
        setPositionStyle({});
      }
    };

    adjustPosition();
    window.addEventListener('resize', adjustPosition);
    return () => window.removeEventListener('resize', adjustPosition);
  }, [summaryOpen]);

  return (
    <article
      data-task-id={task.id}
      className={`relative min-w-0 rounded-xl border shadow-sm transition ${colorConfig.bgClass} ${colorConfig.borderClass} ${colorConfig.hoverBorderClass}`}
      style={colorConfig.style}
    >
      <Link
        to={target}
        aria-label={`Abrir tarefa #${task.publicNumber}: ${c.title}`}
        className={`block rounded-xl ${compact || onColorChange ? 'p-3 pr-20' : 'p-4'}`}
        onClick={(e) => {
          if (onSelect) {
            e.preventDefault();
            onSelect(task, e.currentTarget);
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {dragHandleProps && (
            <button
              type="button"
              {...dragHandleProps}
              aria-label={`Arrastar tarefa #${task.publicNumber}`}
              className={`touch-none cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 ${
                colorConfig.isDark
                  ? 'text-white/70 hover:text-white hover:bg-white/10'
                  : 'text-muted/70 hover:text-brand-700 hover:bg-black/5'
              }`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <GripVertical size={14} />
            </button>
          )}
          <span className={`text-xs font-bold ${colorConfig.numberClass}`}>#{task.publicNumber}</span>
          <PriorityBadge priority={c.priority} />
        </div>
        <h3 className={`mt-2 line-clamp-2 text-sm font-bold leading-5 ${colorConfig.textClass}`} title={c.title}>
          {c.title}
        </h3>
        <p className={`mt-1 truncate text-xs ${colorConfig.mutedClass}`} title={task.team.name}>
          {task.team.name}
        </p>
        <div className={`mt-3 space-y-1.5 text-xs ${colorConfig.mutedClass}`}>
          <p className="flex min-w-0 items-center gap-1.5">
            <UserRound size={13} className="shrink-0" />
            <span className="truncate">
              {c.assignment?.user?.name ?? (personal && c.status === 'COMPLETED' ? 'Concluída por você' : 'Sem responsável atual')}
            </span>
          </p>
          <p className={`flex items-start gap-1.5 ${c.overdue ? (colorConfig.isDark ? 'font-bold text-red-300' : 'font-bold text-danger') : ''}`}>
            {c.overdue ? <AlertTriangle size={13} className="mt-0.5 shrink-0" /> : <CalendarClock size={13} className="mt-0.5 shrink-0" />}
            <span>
              {c.deadlineAt ? new Date(c.deadlineAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sem prazo'}
              {c.overdue ? ' · Atrasada' : ''}
            </span>
          </p>
        </div>
        {personal && (
          <div className="mt-2">
            <StatusBadge status={c.status} />
          </div>
        )}
      </Link>

      <div
        className="absolute right-1 top-1 z-10 flex items-center gap-0.5"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {onColorChange && (
          <div ref={paletteRef} className="relative">
            <button
              ref={paletteBtnRef}
              type="button"
              aria-label={`Personalizar cor da tarefa #${task.publicNumber}`}
              aria-expanded={paletteOpen}
              className={`grid size-9 cursor-pointer place-items-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 ${colorConfig.actionIconClass}`}
              onClick={togglePalette}
            >
              <Palette size={16} />
            </button>
            {paletteOpen && (
              <div
                className={`absolute right-0 z-30 ${popoverPlacement === 'top' ? 'bottom-full mb-1.5' : 'top-10'}`}
                onClick={(e) => e.stopPropagation()}
              >
                {isAdvancedOpen ? (
                  <AdvancedColorPicker
                    initialColor={color}
                    onApply={(newHex) => {
                      onColorChange(newHex);
                      setPaletteOpen(false);
                      setIsAdvancedOpen(false);
                      paletteBtnRef.current?.focus();
                    }}
                    onCancel={() => {
                      setPaletteOpen(false);
                      setIsAdvancedOpen(false);
                      paletteBtnRef.current?.focus();
                    }}
                  />
                ) : (
                  <div
                    role="dialog"
                    aria-label="Paleta de cores do cartão"
                    className="w-48 rounded-xl border border-border bg-white p-2.5 shadow-card"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-bold text-muted">Cor do cartão</p>
                      <button
                        type="button"
                        aria-label="Abrir paleta avançada"
                        title="Paleta avançada de cores"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsAdvancedOpen(true);
                        }}
                        className="flex items-center gap-1 rounded p-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50 hover:text-brand-900 transition-colors"
                      >
                        <Palette size={13} />
                        <span>Mais cores</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {COLOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          aria-label={`Selecionar cor ${opt.label}`}
                          title={opt.label}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onColorChange(opt.id === 'default' ? null : opt.id);
                            setPaletteOpen(false);
                            paletteBtnRef.current?.focus();
                          }}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-brand-700 ${
                            (color || 'default') === opt.id
                              ? 'ring-2 ring-brand-700 ring-offset-1 border-brand-700'
                              : 'border-slate-300 hover:border-slate-400'
                          }`}
                          style={{ backgroundColor: opt.swatchBg }}
                        >
                          {opt.id === 'default' && <RotateCcw size={12} className="text-slate-500" />}
                        </button>
                      ))}
                    </div>
                    {isCustomColor && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onColorChange(null);
                          setPaletteOpen(false);
                          paletteBtnRef.current?.focus();
                        }}
                        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-slate-50 py-1.5 text-[11px] font-semibold text-muted hover:bg-slate-100 hover:text-text transition-colors"
                      >
                        <RotateCcw size={12} />
                        Restaurar cor padrão
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {compact && (
          <details
            ref={menu}
            className="relative"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                event.currentTarget.open = false;
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (menu.current) {
                  menu.current.open = false;
                  menu.current.querySelector('summary')?.focus();
                }
              }
            }}
          >
            <summary
              aria-label={`Ações da tarefa #${task.publicNumber}`}
              className={`grid size-9 cursor-pointer list-none place-items-center rounded-lg transition-colors ${colorConfig.actionIconClass}`}
              onClick={(e) => {
                e.stopPropagation();
                setSummaryOpen(false);
                setPaletteOpen(false);
                setIsAdvancedOpen(false);
              }}
            >
              <MoreHorizontal size={18} />
            </summary>
            <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-border bg-white p-1 shadow-card">
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold hover:bg-brand-100 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openSummary();
                }}
              >
                Resumo da tarefa
              </button>
              {personal && ['AWAITING_ACCEPTANCE', 'IN_PROGRESS'].includes(c.status) && (
                <Link
                  className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-brand-100"
                  to={target}
                  onClick={(e) => {
                    if (menu.current) {
                      menu.current.open = false;
                      menu.current.querySelector('summary')?.focus();
                    }
                    if (onSelect) {
                      e.preventDefault();
                      onSelect(task);
                    }
                  }}
                >
                  {c.status === 'AWAITING_ACCEPTANCE' ? 'Responder atribuição' : 'Execução e solicitações'}
                </Link>
              )}
            </div>
          </details>
        )}
      </div>

      {/* Pop-up compacto de Resumo da tarefa */}
      {summaryOpen && (
        <div
          ref={summaryRef}
          role="dialog"
          aria-label={`Resumo da tarefa #${task.publicNumber}`}
          style={{ width: 300, maxWidth: 'calc(100vw - 24px)', ...positionStyle }}
          className="absolute right-2 top-10 z-30 rounded-xl border border-border bg-white p-3.5 shadow-card text-left"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2.5">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold text-brand-700">#{task.publicNumber}</span>
              <h4 className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-text" title={c.title}>
                {c.title}
              </h4>
            </div>
            <button
              type="button"
              aria-label="Fechar resumo"
              onClick={() => {
                setSummaryOpen(false);
                menu.current?.querySelector('summary')?.focus();
              }}
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              <X size={15} />
            </button>
          </div>

          {/* Badges de Status e Prioridade */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={c.status} />
            <PriorityBadge priority={c.priority} />
          </div>

          {/* Detalhes: Equipe, Responsável, Prazo */}
          <div className="mt-3 space-y-2 text-xs text-muted">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/80">Equipe</p>
              <p className="mt-0.5 font-medium text-text truncate" title={task.team?.name}>
                {task.team?.name ?? 'Sem equipe'}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/80">Responsável</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-medium text-text truncate">
                <UserRound size={13} className="shrink-0 text-muted" />
                <span className="truncate">
                  {c.assignment?.user?.name ?? (personal && c.status === 'COMPLETED' ? 'Concluída por você' : 'Sem responsável atual')}
                </span>
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/80">Prazo</p>
              <p className={`mt-0.5 flex items-center gap-1.5 font-medium ${c.overdue ? 'font-bold text-danger' : 'text-text'}`}>
                {c.overdue ? <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" /> : <CalendarClock size={13} className="mt-0.5 shrink-0 text-muted" />}
                <span>
                  {c.deadlineAt
                    ? new Date(c.deadlineAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                    : 'Sem prazo'}
                  {c.overdue ? ' · Atrasada' : ''}
                </span>
              </p>
            </div>
          </div>

          {/* Botão de ação: Ver detalhes completos */}
          <div className="mt-3.5 border-t border-border/60 pt-2.5">
            <button
              type="button"
              className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-900 focus-visible:outline-2 focus-visible:outline-brand-700"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const returnTrigger = menu.current?.querySelector('summary') || undefined;
                setSummaryOpen(false);
                if (onSelect) {
                  onSelect(task, returnTrigger);
                } else {
                  navigate(target);
                }
              }}
            >
              Ver detalhes completos
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function EmptyTasks({ history = false }: { history?: boolean }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-border bg-white p-6 text-center">
      <div>
        {history ? <CircleCheck className="mx-auto text-success" /> : <Clock3 className="mx-auto text-brand-700" />}
        <p className="mt-3 font-bold">Nenhuma tarefa encontrada</p>
        <p className="mt-1 text-sm text-muted">Ajuste os filtros ou aguarde novas movimentações.</p>
      </div>
    </div>
  );
}

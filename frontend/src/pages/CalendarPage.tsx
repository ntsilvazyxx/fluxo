import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  AlertTriangle,
  Clock3,
  CheckCircle2,
  ListTodo,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { TaskDetailModal } from '../tasks/TaskDetailModal.tsx';

type TaskItem = {
  id: string;
  publicNumber: string;
  team: { id: string; name: string };
  cycle: {
    id: string;
    title: string;
    status: string;
    priority: string;
    deadlineAt: string | null;
    openedAt: string;
    closedAt?: string | null;
    overdue?: boolean;
    assignment?: {
      user?: { id: string; name: string };
    } | null;
  } | null;
};

type CalendarException = {
  id: string;
  date: string;
  type: string;
  description: string;
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const priorityBadges: Record<string, string> = {
  URGENT: 'bg-danger text-white',
  HIGH: 'bg-warning text-text font-bold',
  NORMAL: 'bg-brand-100 text-brand-900',
  LOW: 'bg-slate-100 text-slate-700',
};

const statusClasses: Record<string, string> = {
  PENDING: 'border-l-4 border-amber-500 bg-amber-50/70',
  AWAITING_ACCEPTANCE: 'border-l-4 border-indigo-500 bg-indigo-50/70',
  IN_PROGRESS: 'border-l-4 border-brand-600 bg-blue-50/70',
  COMPLETED: 'border-l-4 border-success bg-emerald-50/70',
  CANCELLED: 'border-l-4 border-slate-400 bg-slate-100/70 text-slate-500',
};

export function CalendarPage() {
  const { request } = useAuth();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const formattedMonth = useMemo(() => {
    const m = String(currentMonth + 1).padStart(2, '0');
    return `${currentYear}-${m}`;
  }, [currentYear, currentMonth]);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const response = await request(`/tasks/calendar?month=${formattedMonth}`);
      if (!response.ok) return;
      const json = await response.json();
      setTasks(json.data?.tasks ?? []);
      setExceptions(json.data?.exceptions ?? []);
    } catch {
      // Ignora erro transitório
    } finally {
      setLoading(false);
    }
  }, [formattedMonth, request]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  const prevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const cycle = t.cycle;
      if (!cycle) return false;
      if (statusFilter && cycle.status !== statusFilter) return false;
      if (priorityFilter && cycle.priority !== priorityFilter) return false;
      return true;
    });
  }, [tasks, statusFilter, priorityFilter]);

  // Dias do mês em grade (visão mensal)
  const monthDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const lastDayDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthLastDate = new Date(currentYear, currentMonth, 0).getDate();

    const days = [];

    // Dias do mês anterior para completar primeira semana
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        dayNumber: prevMonthLastDate - i,
        isCurrentMonth: false,
        dateString: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(prevMonthLastDate - i).padStart(2, '0')}`,
      });
    }

    // Dias do mês corrente
    for (let i = 1; i <= lastDayDate; i++) {
      days.push({
        dayNumber: i,
        isCurrentMonth: true,
        dateString: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
      });
    }

    // Dias do próximo mês para completar grade de 35 ou 42
    const totalSlots = days.length > 35 ? 42 : 35;
    const remaining = totalSlots - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        dayNumber: i,
        isCurrentMonth: false,
        dateString: `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  // Dias da semana corrente (visão semanal)
  const weekDays = useMemo(() => {
    const today = new Date(currentDate);
    const dayOfWeek = today.getDay();
    const sunday = new Date(today.setDate(today.getDate() - dayOfWeek));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      days.push({
        dayName: WEEKDAYS[i],
        dayNumber: d.getDate(),
        dateString: `${y}-${m}-${day}`,
        isToday: new Date().toDateString() === d.toDateString(),
      });
    }
    return days;
  }, [currentDate]);

  // Agrupamento de tarefas por data ISO YYYY-MM-DD
  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const t of filteredTasks) {
      if (!t.cycle?.deadlineAt) continue;
      const dateKey = t.cycle.deadlineAt.slice(0, 10);
      const list = map.get(dateKey) ?? [];
      list.push(t);
      map.set(dateKey, list);
    }
    return map;
  }, [filteredTasks]);

  // Feriados e pontos facultativos por data
  const exceptionsByDate = useMemo(() => {
    const map = new Map<string, CalendarException>();
    for (const ex of exceptions) {
      map.set(ex.date, ex);
    }
    return map;
  }, [exceptions]);

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {/* 1. Cabeçalho da página */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand-700">
            <CalendarDays size={20} />
            <span className="text-sm font-bold tracking-wide uppercase">Operacional</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text mt-0.5">
            Calendário de Tarefas
          </h1>
          <p className="text-sm text-muted">
            Acompanhamento visual de prazos de entrega e feriados institucionais.
          </p>
        </div>

        {/* Alternância de visão e filtros */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-xl bg-slate-100 p-1 border border-border">
            <button
              type="button"
              onClick={() => setView('month')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                view === 'month' ? 'bg-white text-brand-900 shadow-xs' : 'text-muted hover:text-text'
              }`}
            >
              Mês
            </button>
            <button
              type="button"
              onClick={() => setView('week')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                view === 'week' ? 'bg-white text-brand-900 shadow-xs' : 'text-muted hover:text-text'
              }`}
            >
              Semana
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filtrar por status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="field text-xs py-1.5 min-w-[130px]"
            >
              <option value="">Todos os status</option>
              <option value="PENDING">Pendente</option>
              <option value="AWAITING_ACCEPTANCE">Aguardando aceite</option>
              <option value="IN_PROGRESS">Em andamento</option>
              <option value="COMPLETED">Concluída</option>
            </select>

            <select
              aria-label="Filtrar por prioridade"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="field text-xs py-1.5 min-w-[130px]"
            >
              <option value="">Todas prioridades</option>
              <option value="URGENT">Urgente</option>
              <option value="HIGH">Alta</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Baixa</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Barra de navegação do período */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-border shadow-xs">
        <div className="flex items-center gap-2">
          <h2 className="text-lg sm:text-xl font-extrabold text-brand-900 min-w-[180px]">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Mês anterior"
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-border text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Próximo mês"
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Legenda de situação */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Concluída
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-600" /> Em andamento
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Aguardando / Pendente
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger" /> Atrasada
          </span>
        </div>
      </div>

      {/* 3. Grade do Calendário */}
      {view === 'month' ? (
        <div className="rounded-2xl border border-border bg-white shadow-panel overflow-hidden">
          {/* Cabeçalho dos dias da semana */}
          <div className="grid grid-cols-7 border-b border-border bg-slate-50/80 text-center text-xs font-bold text-slate-600">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-2.5">
                {day}
              </div>
            ))}
          </div>

          {/* Células dos dias do mês */}
          <div className="grid grid-cols-7 auto-rows-[minmax(110px,1fr)] divide-x divide-y divide-border">
            {monthDays.map((item, idx) => {
              const dayTasks = tasksByDate.get(item.dateString) ?? [];
              const exception = exceptionsByDate.get(item.dateString);
              const isToday = item.dateString === todayIso;

              return (
                <div
                  key={`${item.dateString}-${idx}`}
                  className={`relative p-2 transition-colors flex flex-col justify-between ${
                    item.isCurrentMonth ? 'bg-white' : 'bg-slate-50/50 text-slate-400'
                  } ${isToday ? 'ring-2 ring-inset ring-brand-500/70 bg-brand-50/20' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-extrabold rounded-md px-1.5 py-0.5 ${
                        isToday
                          ? 'bg-brand-700 text-white shadow-xs'
                          : item.isCurrentMonth
                            ? 'text-text'
                            : 'text-slate-400'
                      }`}
                    >
                      {item.dayNumber}
                    </span>

                    {exception && (
                      <span
                        title={exception.description}
                        className="truncate text-[10px] font-bold text-amber-700 bg-amber-100 px-1 py-0.5 rounded"
                      >
                        {exception.description || 'Feriado'}
                      </span>
                    )}
                  </div>

                  {/* Lista de tarefas do dia */}
                  <div className="mt-1.5 space-y-1 flex-1 overflow-y-auto max-h-[85px] no-scrollbar">
                    {dayTasks.map((t) => {
                      const isOverdue = t.cycle?.overdue;
                      const isCompleted = t.cycle?.status === 'COMPLETED';

                      let badgeClass = 'bg-brand-50 text-brand-900 border border-brand-200';
                      if (isCompleted) {
                        badgeClass = 'bg-emerald-50 text-emerald-800 border border-emerald-200';
                      } else if (isOverdue) {
                        badgeClass = 'bg-rose-50 text-rose-800 border border-rose-300 font-bold';
                      }

                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTaskId(t.id)}
                          className={`w-full text-left rounded-lg p-1 text-[11px] leading-tight transition-all hover:scale-[1.02] shadow-xs truncate block ${badgeClass}`}
                          title={`#${t.publicNumber} - ${t.cycle?.title}`}
                        >
                          <span className="font-bold">#{t.publicNumber}</span> {t.cycle?.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Visão Semanal Detalhada */
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const dayTasks = tasksByDate.get(day.dateString) ?? [];
            const exception = exceptionsByDate.get(day.dateString);

            return (
              <div
                key={day.dateString}
                className={`flex flex-col rounded-2xl border p-3.5 bg-white shadow-xs ${
                  day.isToday ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div>
                    <span className="text-xs font-bold text-muted uppercase">{day.dayName}</span>
                    <p className={`text-base font-extrabold ${day.isToday ? 'text-brand-700' : 'text-text'}`}>
                      {day.dayNumber}
                    </p>
                  </div>
                  {exception && (
                    <span
                      title={exception.description}
                      className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded max-w-[80px] truncate"
                    >
                      {exception.description || 'Feriado'}
                    </span>
                  )}
                </div>

                <div className="mt-3 space-y-2 flex-1">
                  {dayTasks.length ? (
                    dayTasks.map((t) => (
                      <article
                        key={t.id}
                        onClick={() => setSelectedTaskId(t.id)}
                        className={`cursor-pointer rounded-xl p-2.5 text-xs shadow-xs transition-all hover:shadow-md ${
                          statusClasses[t.cycle?.status || 'PENDING']
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-extrabold text-brand-800">#{t.publicNumber}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              priorityBadges[t.cycle?.priority || 'NORMAL']
                            }`}
                          >
                            {t.cycle?.priority}
                          </span>
                        </div>
                        <p className="font-semibold line-clamp-2 text-text">{t.cycle?.title}</p>
                        <p className="mt-1.5 text-[11px] text-muted truncate">
                          {t.cycle?.assignment?.user?.name || 'Sem responsável'}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-[11px] text-muted/60 text-center py-6">Sem prazos</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Detalhes da Tarefa Integrado */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={() => void loadCalendar()}
        />
      )}
    </div>
  );
}

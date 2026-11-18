import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { EmptyTasks, TaskCard } from '../tasks/task-ui.tsx';
import { useTasks } from '../tasks/useTasks.ts';
import { useTaskColors } from '../tasks/useTaskColors.ts';
import { kanbanColumns, kanbanFilterKeys, taskQuery } from '../tasks/kanban.ts';
import { TaskDetailModal } from '../tasks/TaskDetailModal.tsx';
import { TaskCreateModal } from '../tasks/TaskCreateModal.tsx';

export function KanbanPage() {
  const { request, user, features } = useAuth();
  const location = useLocation();
  const isMyTasksRoute = location.pathname.startsWith('/minhas-tarefas');
  const managerial = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER'].includes(user.role.code);
  const canCreateTask =
    user.role.code === 'ADMIN_MASTER' ? features?.adminTaskCreation === true : managerial;
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(kanbanFilterKeys.map((key) => [key, params.get(key) ?? '']));
  const [expanded, setExpanded] = useState(false);
  const [options, setOptions] = useState({ teams: [], users: [], error: '' });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const createTaskTriggerRef = useRef<HTMLElement | null>(null);
  const lastFocusedCardRef = useRef<HTMLElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Estados para Drag and Drop
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<Record<string, string[]>>({});
  const [completingTask, setCompletingTask] = useState<any | null>(null);
  const [reopeningTask, setReopeningTask] = useState<any | null>(null);
  const [dndBusy, setDndBusy] = useState(false);
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleOpenTask = (id: string, element?: HTMLElement) => {
    lastFocusedCardRef.current = element || (document.activeElement as HTMLElement);
    setSelectedTaskId(id);
  };

  const handleCloseTask = () => {
    setSelectedTaskId(null);
  };

  const personal = useTasks(taskQuery('/my-tasks', filters, pageNumber(params.get('personalPage'))));
  const operational = useTasks(
    !isMyTasksRoute && managerial
      ? taskQuery('/kanban', filters, pageNumber(params.get('teamPage')))
      : null,
  );
  const completedOperational = useTasks(
    !isMyTasksRoute && managerial
      ? taskQuery('/task-history', { ...filters, status: 'COMPLETED' }, pageNumber(params.get('completedPage')))
      : null,
  );

  const active = Object.values(filters).filter(Boolean).length;
  const scrollKey = `seaf-kanban:${user.id}:${params.toString()}`;

  useEffect(() => {
    if (!managerial || !expanded) return;
    let cancelled = false;
    const load = async () => {
      try {
        const responses = await Promise.all([request('/teams'), request('/users')]);
        const [teams, users] = await Promise.all(responses.map((response) => response.json()));
        if (responses.some((response) => !response.ok)) {
          throw new Error('Não foi possível carregar as opções de filtros.');
        }
        if (!cancelled) setOptions({ teams: teams.data.teams, users: users.data.users, error: '' });
      } catch (cause: any) {
        if (!cancelled) setOptions((s) => ({ ...s, error: cause.message }));
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [expanded, managerial, request]);

  useEffect(() => {
    try {
      if (boardRef.current) {
        boardRef.current.scrollLeft = Number(sessionStorage.getItem(scrollKey) ?? 0);
      }
    } catch {
      /* Storage can be disabled */
    }
  }, [scrollKey]);

  // Limpeza automática de toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const change = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(name, String(value));
        else next.delete(name);
        next.delete('personalPage');
        next.delete('teamPage');
        next.delete('completedPage');
        return next;
      },
      { replace: true },
    );
  };

  const pagination = (key: string, page: number) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set(key, String(page));
      return next;
    });

  const search = params.toString() ? `?${params}` : '';

  // Combina e deduplica as tarefas autorizadas
  const rawTasks = isMyTasksRoute
    ? (personal.tasks || []).filter((task: any) => task.cycle?.assignment?.userId === user.id)
    : managerial
    ? [
        ...(operational.tasks || []),
        ...(completedOperational?.tasks || []),
        ...(personal.tasks || []),
      ]
    : personal.tasks || [];

  const tasksMap = new Map<string, any>();
  for (const task of rawTasks) {
    if (task?.id && !tasksMap.has(task.id)) {
      tasksMap.set(task.id, task);
    }
  }
  const allTasks = Array.from(tasksMap.values());
  const taskIds = useMemo(() => allTasks.map((t) => t.id), [allTasks]);
  const { colors, setColor } = useTaskColors(taskIds);

  const columns = kanbanColumns.map(([status, label]) => {
    const rawItems = allTasks.filter((task) => task.cycle?.status === status);
    const order = customOrder[status];
    let items = rawItems;
    if (order && order.length > 0) {
      items = [...rawItems].sort((a, b) => {
        const idxA = order.indexOf(a.id);
        const idxB = order.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }
    return {
      status,
      label,
      items,
    };
  });

  const activeTask = activeTaskId ? allTasks.find((t) => t.id === activeTaskId) : null;

  const isSearchActive = Boolean(filters.search && filters.search.trim());
  const pendingSearchResults =
    isSearchActive && managerial && !isMyTasksRoute
      ? allTasks.filter((task) => task.cycle?.status === 'PENDING')
      : [];

  const isLoading =
    personal.loading ||
    (managerial && !isMyTasksRoute && (operational.loading || completedOperational?.loading));
  const errorMessage = personal.error || operational.error || completedOperational?.error;
  const reloadAll = () => {
    personal.reload();
    operational.reload();
    completedOperational?.reload();
  };

  const filterStatusOptions = kanbanColumns;

  // Lógica de movimentação por Drag and Drop
  const findColumnOfItem = (id: string): string | null => {
    if (['AWAITING_ACCEPTANCE', 'IN_PROGRESS', 'COMPLETED'].includes(id)) {
      return id;
    }
    const t = allTasks.find((item) => item.id === id);
    return t?.cycle?.status ?? null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
    setOverId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over ? String(event.over.id) : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTaskId(null);
    setOverId(null);
    if (!over) return;

    const draggedTaskId = String(active.id);
    const draggedTask = allTasks.find((t) => t.id === draggedTaskId);
    if (!draggedTask) return;

    const sourceStatus = draggedTask.cycle?.status;
    const targetStatus = findColumnOfItem(String(over.id));
    if (!targetStatus) return;

    // 1. Reordenação dentro da mesma coluna
    if (sourceStatus === targetStatus) {
      if (active.id !== over.id) {
        const columnItems = columns.find((c) => c.status === sourceStatus)?.items ?? [];
        const oldIndex = columnItems.findIndex((t) => t.id === active.id);
        const newIndex = columnItems.findIndex((t) => t.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newItems = arrayMove(columnItems, oldIndex, newIndex);
          setCustomOrder((prev) => ({
            ...prev,
            [sourceStatus]: newItems.map((t) => t.id),
          }));
        }
      }
      return;
    }

    // 2. Movimentação entre colunas: Aguardando aceite -> Em andamento (Aceite)
    if (sourceStatus === 'AWAITING_ACCEPTANCE' && targetStatus === 'IN_PROGRESS') {
      const assignment = draggedTask.cycle?.assignment;
      const isAssignee = Boolean(
        assignment && (assignment.userId === user.id || assignment.user?.id === user.id),
      );
      if (!isAssignee) {
        setToast({
          type: 'error',
          message: `Somente o responsável designado (${assignment?.user?.name || 'atribuído'}) pode aceitar a tarefa.`,
        });
        return;
      }

      setDndBusy(true);
      try {
        const res = await request(`/assignments/${assignment.id}/accept`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: draggedTask.cycle.version }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error?.message ?? 'Não foi possível aceitar a tarefa.');
        }
        setToast({
          type: 'success',
          message: `Tarefa #${draggedTask.publicNumber} aceita com sucesso!`,
        });
        reloadAll();
      } catch (err: any) {
        setToast({
          type: 'error',
          message: err.message || 'Falha ao aceitar a tarefa.',
        });
        reloadAll();
      } finally {
        setDndBusy(false);
      }
      return;
    }

    // 3. Movimentação entre colunas: Em andamento -> Finalizado (Conclusão via pop-up)
    if (sourceStatus === 'IN_PROGRESS' && targetStatus === 'COMPLETED') {
      const assignment = draggedTask.cycle?.assignment;
      const isAssignee = Boolean(
        assignment && (assignment.userId === user.id || assignment.user?.id === user.id),
      );
      if (!isAssignee) {
        setToast({
          type: 'error',
          message: 'Somente o responsável atual pode concluir a tarefa.',
        });
        return;
      }
      setCompletingTask(draggedTask);
      return;
    }

    // 4. Movimentação entre colunas: Finalizado -> Em andamento (Reabertura formal via pop-up)
    if (sourceStatus === 'COMPLETED' && targetStatus === 'IN_PROGRESS') {
      if (!managerial) {
        setToast({
          type: 'error',
          message: 'Somente gestores ou secretários podem solicitar reabertura de tarefas concluídas.',
        });
        return;
      }
      setReopeningTask(draggedTask);
      return;
    }

    // 5. Transições inválidas (ex: Aguardando aceite -> Finalizado)
    setToast({
      type: 'error',
      message: 'Esta movimentação não é permitida no fluxo do Kanban.',
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-brand-700">
            {isMyTasksRoute
              ? 'Execução pessoal'
              : managerial
              ? 'Acompanhamento e execução'
              : 'Acompanhamento e execução pessoal'}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold">
            {isMyTasksRoute ? 'Minhas tarefas' : 'Kanban de tarefas'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            {isMyTasksRoute
              ? 'Tarefas sob sua responsabilidade direta atual. Abra um cartão para responder ou executar.'
              : managerial
              ? 'Acompanhamento operacional das tarefas organizadas por fluxo de execução.'
              : 'Tarefas e entregas autorizadas organizadas por fluxo de execução.'}
          </p>
        </div>
        {canCreateTask && (
          <Link
            to="/tarefas/nova"
            onClick={(e) => {
              e.preventDefault();
              createTaskTriggerRef.current = e.currentTarget;
              setIsCreateTaskOpen(true);
            }}
            className="action-primary"
          >
            <Plus size={18} />
            Nova tarefa
          </Link>
        )}
      </div>

      <section aria-label="Filtros do Kanban" className="mt-5 rounded-xl border border-border bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 basis-48 flex-1">
            <Search aria-hidden="true" size={17} className="absolute left-3 top-3.5 text-muted" />
            <input
              aria-label="Buscar tarefas"
              className="field pl-9"
              name="search"
              value={filters.search}
              onChange={change}
              placeholder="ID ou título da tarefa"
            />
          </label>
          <button
            className="action-secondary"
            aria-expanded={expanded}
            aria-controls="kanban-advanced-filters"
            onClick={() => setExpanded(!expanded)}
          >
            <Filter size={17} />
            Filtros
            {active > 0 && (
              <span aria-label={`${active} filtros ativos`} className="rounded-full bg-brand-100 px-2 py-0.5 text-xs">
                {active}
              </span>
            )}
          </button>
          {active > 0 && (
            <button
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted"
              onClick={() => setParams({}, { replace: true })}
            >
              <X size={16} />
              Limpar filtros
            </button>
          )}
        </div>
        {expanded && (
          <div id="kanban-advanced-filters" className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-3">
            {managerial && !isMyTasksRoute && (
              <>
                <FilterSelect label="Equipe" name="teamId" value={filters.teamId} change={change}>
                  <option value="">Todas as equipes</option>
                  {options.teams.map((team: any) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </FilterSelect>
                <FilterSelect label="Responsável" name="responsibleId" value={filters.responsibleId} change={change}>
                  <option value="">Todos os responsáveis</option>
                  {options.users.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </FilterSelect>
              </>
            )}
            <FilterSelect label="Prioridade" name="priority" value={filters.priority} change={change}>
              <option value="">Todas as prioridades</option>
              <option value="LOW">Baixa</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={filters.status} change={change}>
              <option value="">Todos os status</option>
              {filterStatusOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Situação de atraso" name="overdue" value={filters.overdue} change={change}>
              <option value="">Todos os prazos</option>
              <option value="true">Atrasadas</option>
              <option value="false">No prazo</option>
            </FilterSelect>
            <label className="text-xs font-bold text-muted">
              Prazo até
              <input className="field mt-1" name="deadlineTo" type="date" value={filters.deadlineTo} onChange={change} />
            </label>
            {options.error && <p role="alert" className="text-sm text-danger">{options.error}</p>}
          </div>
        )}
      </section>

      {/* Resultados de tarefas PENDING quando houver busca ativa */}
      {pendingSearchResults.length > 0 && (
        <section
          aria-label="Tarefas pendentes encontradas na busca"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 sm:p-4 text-text shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              <h3 className="text-xs sm:text-sm font-bold text-amber-950">
                {pendingSearchResults.length === 1
                  ? '1 tarefa pendente de atribuição encontrada nesta busca:'
                  : `${pendingSearchResults.length} tarefas pendentes de atribuição encontradas nesta busca:`}
              </h3>
            </div>
            <span className="text-xs text-amber-800">
              Acesse para definir responsável e prazo
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {pendingSearchResults.map((task: any) => (
              <Link
                key={task.id}
                to={`/kanban/tarefas/${task.id}${search}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleOpenTask(task.id, e.currentTarget);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 hover:border-amber-400 focus-visible:outline-2 focus-visible:outline-amber-600"
                aria-label={`Abrir tarefa pendente #${task.publicNumber}: ${task.cycle?.title || task.title}`}
              >
                <span className="font-bold text-amber-700">#{task.publicNumber}</span>
                <span className="max-w-[240px] truncate">{task.cycle?.title || task.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Três colunas oficiais do Kanban com Drag and Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveTaskId(null);
          setOverId(null);
        }}
      >
        <div
          ref={boardRef}
          role="region"
          aria-label="Colunas do Kanban"
          tabIndex={0}
          className="kanban-board-container mt-5 rounded-xl pb-3 no-scrollbar focus-visible:outline-2 focus-visible:outline-brand-700"
          onScroll={(event) => {
            try {
              sessionStorage.setItem(scrollKey, String(event.currentTarget.scrollLeft));
            } catch {
              /* Optional UI persistence */
            }
          }}
        >
          <div className="kanban-board">
            {columns.map(({ status, label, items }) => {
              const isColumnOver = overId === status || items.some((t) => t.id === overId);
              const isDraggingActive = Boolean(activeTask);
              let isValidTarget = false;
              let isInvalidTarget = false;

              if (isDraggingActive && isColumnOver && activeTask) {
                const sourceStatus = activeTask.cycle?.status;
                if (sourceStatus === status) {
                  isValidTarget = true;
                } else if (sourceStatus === 'AWAITING_ACCEPTANCE' && status === 'IN_PROGRESS') {
                  isValidTarget = true;
                } else if (sourceStatus === 'IN_PROGRESS' && status === 'COMPLETED') {
                  isValidTarget = true;
                } else if (sourceStatus === 'COMPLETED' && status === 'IN_PROGRESS') {
                  isValidTarget = managerial;
                  isInvalidTarget = !managerial;
                } else {
                  isInvalidTarget = true;
                }
              }

              return (
                <KanbanColumnDroppable
                  key={status}
                  status={status}
                  label={label}
                  count={items.length}
                  isLoading={isLoading && allTasks.length === 0}
                  isOver={isColumnOver}
                  isValidTarget={isValidTarget}
                  isInvalidTarget={isInvalidTarget}
                  errorMessage={errorMessage}
                  onReload={reloadAll}
                >
                  {isLoading && allTasks.length === 0 ? (
                    <p role="status" className="p-3 text-sm text-muted">
                      Carregando…
                    </p>
                  ) : (
                    <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3 flex-1 min-h-[60px]">
                        {items.map((task) => (
                          <SortableTaskCard
                            key={task.id}
                            task={task}
                            compact
                            personal={isMyTasksRoute || !managerial}
                            search={search}
                            color={colors[task.id]}
                            onColorChange={(newColor: string | null) => void setColor(task.id, newColor)}
                            onSelect={(selected: any, trigger?: HTMLElement) =>
                              handleOpenTask(selected.id, trigger)
                            }
                          />
                        ))}
                        {items.length === 0 && <EmptyTasks />}
                      </div>
                    </SortableContext>
                  )}
                </KanbanColumnDroppable>
              );
            })}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="rotate-1 scale-102 shadow-2xl opacity-90 cursor-grabbing pointer-events-none">
              <TaskCard
                task={activeTask}
                compact
                personal={isMyTasksRoute || !managerial}
                search={search}
                color={colors[activeTask.id]}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <PageControls
        source={managerial && !isMyTasksRoute ? operational : personal}
        label={managerial && !isMyTasksRoute ? 'Fluxo das equipes' : 'Tarefas pessoais'}
        onPage={(page) => pagination(managerial && !isMyTasksRoute ? 'teamPage' : 'personalPage', page)}
      />
      <p className="mt-2 text-xs text-muted">
        Contagens por página. Arraste pela alça para organizar ou transicionar. Cartões abrem detalhes.
      </p>

      {/* Modal de Detalhes da Tarefa */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={handleCloseTask}
          onTaskUpdated={reloadAll}
          triggerElement={lastFocusedCardRef.current}
        />
      )}

      {/* Pop-up de Criação de Tarefa */}
      {isCreateTaskOpen && (
        <TaskCreateModal
          isOpen={isCreateTaskOpen}
          onClose={() => setIsCreateTaskOpen(false)}
          onTaskCreated={async () => {
            setIsCreateTaskOpen(false);
            reloadAll();
          }}
          triggerElement={createTaskTriggerRef.current}
        />
      )}

      {/* Pop-up de Conclusão de Tarefa (disparado ao soltar em "Finalizado") */}
      {completingTask && (
        <TaskCompleteModal
          task={completingTask}
          onClose={() => setCompletingTask(null)}
          onSuccess={() => {
            setCompletingTask(null);
            setToast({
              type: 'success',
              message: `Tarefa #${completingTask.publicNumber} concluída com sucesso!`,
            });
            reloadAll();
          }}
          request={request}
          busy={dndBusy}
          setBusy={setDndBusy}
        />
      )}

      {/* Pop-up de Reabertura Formal (disparado ao soltar de "Finalizado" para "Em andamento") */}
      {reopeningTask && (
        <TaskReopenModal
          task={reopeningTask}
          onClose={() => setReopeningTask(null)}
          onSuccess={() => {
            setReopeningTask(null);
            setToast({
              type: 'success',
              message: `Tarefa #${reopeningTask.publicNumber} reaberta com sucesso!`,
            });
            reloadAll();
          }}
          request={request}
          busy={dndBusy}
          setBusy={setDndBusy}
        />
      )}

      {/* Feedback Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 rounded p-0.5 hover:bg-white/20 cursor-pointer"
            aria-label="Fechar aviso"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function pageNumber(value: string | null) {
  return /^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : 1;
}

function FilterSelect({ label, name, value, change, children }: any) {
  return (
    <label className="text-xs font-bold text-muted">
      {label}
      <select className="field mt-1" name={name} value={value} onChange={change}>
        {children}
      </select>
    </label>
  );
}

function PageControls({ source, label, onPage }: any) {
  if (!source?.meta || source.meta.totalPages <= 1) return null;
  return (
    <nav
      aria-label={`Paginação: ${label}`}
      className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"
    >
      <p>
        {label}: página {source.meta.page} de {source.meta.totalPages} · {source.meta.total} registros
      </p>
      <div className="flex gap-1">
        <button
          aria-label={`Página anterior: ${label}`}
          className="action-secondary px-2"
          disabled={source.loading || source.meta.page <= 1}
          onClick={() => onPage(source.meta.page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          aria-label={`Próxima página: ${label}`}
          className="action-secondary px-2"
          disabled={source.loading || source.meta.page >= source.meta.totalPages}
          onClick={() => onPage(source.meta.page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </nav>
  );
}

function KanbanColumnDroppable({
  status,
  label,
  count,
  isLoading,
  isOver,
  isValidTarget,
  isInvalidTarget,
  errorMessage,
  onReload,
  children,
}: any) {
  const { setNodeRef } = useDroppable({
    id: status,
    data: { status },
  });

  let statusStyle = 'border-border bg-slate-100/80';
  if (isOver && isValidTarget) {
    statusStyle = 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-400';
  } else if (isOver && isInvalidTarget) {
    statusStyle = 'border-red-400 bg-red-50/70 ring-2 ring-red-300';
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      data-column-status={status}
      className={`flex flex-col min-w-0 rounded-xl border p-3 sm:p-4 transition-colors ${statusStyle}`}
    >
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold">{label}</h2>
        <span
          aria-label={`${count} cartões nesta coluna`}
          className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-brand-900 shadow-xs"
        >
          {isLoading ? '…' : count}
        </span>
      </div>
      {errorMessage ? (
        <div role="alert" className="rounded-lg bg-white p-3 text-sm text-danger">
          <p>{errorMessage}</p>
          <button className="action-secondary mt-2" onClick={onReload}>
            Tentar novamente
          </button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function SortableTaskCard({
  task,
  compact,
  personal,
  search,
  color,
  onColorChange,
  onSelect,
}: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task, columnId: task.cycle?.status },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        compact={compact}
        personal={personal}
        search={search}
        color={color}
        onColorChange={onColorChange}
        onSelect={onSelect}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function TaskCompleteModal({
  task,
  onClose,
  onSuccess,
  request,
  busy,
  setBusy,
}: any) {
  const [completionText, setCompletionText] = useState('');
  const [checklist, setChecklist] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checklist) {
      setError('Confirme o checklist de execução para prosseguir.');
      return;
    }
    const trimmed = completionText.trim();
    if (trimmed.length < 10) {
      setError('O resultado da execução deve conter no mínimo 10 caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await request(`/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: task.cycle.version,
          completionText: trimmed,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Não foi possível concluir a tarefa.');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Falha ao concluir tarefa.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="complete-modal-title"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h3 id="complete-modal-title" className="text-base font-extrabold text-text">
                Concluir tarefa #{task.publicNumber}
              </h3>
              <p className="text-xs text-muted truncate max-w-xs sm:max-w-sm">
                {task.cycle?.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar formulário de conclusão"
            onClick={onClose}
            disabled={busy}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-danger border border-red-200"
            >
              {error}
            </div>
          )}

          <label className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-slate-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checklist}
              onChange={(e) => setChecklist(e.target.checked)}
              aria-label="Confirmação de execução de todas as etapas"
              className="mt-0.5 size-4 rounded border-border text-emerald-600 focus:ring-emerald-600"
              required
            />
            <div className="text-xs">
              <span className="font-bold text-text">Checklist obrigatório</span>
              <p className="text-muted mt-0.5">
                Confirmo que todas as atividades e entregas previstas para esta tarefa foram concluídas com êxito.
              </p>
            </div>
          </label>

          <label className="block text-xs font-bold text-muted">
            Resultado da execução (mínimo 10 caracteres)
            <textarea
              aria-label="Resultado da execução"
              value={completionText}
              onChange={(e) => setCompletionText(e.target.value)}
              required
              minLength={10}
              rows={4}
              placeholder="Descreva detalhadamente o resultado da tarefa e os arquivos gerados..."
              className="field mt-1 text-xs"
              disabled={busy}
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="action-secondary text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || !checklist || completionText.trim().length < 10}
              className="action-primary bg-emerald-600 hover:bg-emerald-700 text-xs text-white cursor-pointer"
            >
              <CheckCircle2 size={15} />
              Confirmar conclusão
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskReopenModal({
  task,
  onClose,
  onSuccess,
  request,
  busy,
  setBusy,
}: any) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError('A justificativa da reabertura deve ter no mínimo 5 caracteres.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await request(`/tasks/${task.id}/reopen`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          expectedVersion: task.cycle.version,
          reason: trimmed,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Não foi possível reabrir a tarefa.');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Falha ao reabrir tarefa.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reopen-modal-title"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
              <RotateCcw size={18} />
            </div>
            <div>
              <h3 id="reopen-modal-title" className="text-base font-extrabold text-text">
                Reabrir tarefa #{task.publicNumber}
              </h3>
              <p className="text-xs text-muted truncate max-w-xs sm:max-w-sm">
                {task.cycle?.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar formulário de reabertura"
            onClick={onClose}
            disabled={busy}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-danger border border-red-200"
            >
              {error}
            </div>
          )}

          <p className="text-xs text-muted">
            A reabertura criará um novo ciclo de execução para a tarefa, preservando todo o histórico anterior e solicitando nova atribuição de responsável.
          </p>

          <label className="block text-xs font-bold text-muted">
            Justificativa da reabertura (mínimo 5 caracteres)
            <textarea
              aria-label="Justificativa da reabertura"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
              rows={3}
              placeholder="Informe o motivo formal para reabrir esta tarefa..."
              className="field mt-1 text-xs"
              disabled={busy}
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="action-secondary text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || reason.trim().length < 5}
              className="action-primary text-xs cursor-pointer"
            >
              <RotateCcw size={15} />
              Confirmar reabertura
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

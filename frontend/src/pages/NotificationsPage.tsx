import { Bell, ArrowRight, Loader2, Check, Mail } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const { request } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0, unread: 0 });
  const [page, setPage] = useState(1);
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(new Set());
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await request(
        `/notifications?page=${page}&pageSize=${PAGE_SIZE}&unread=${unreadFilter}`,
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível carregar as notificações.');
      if (!mounted.current) return;
      setNotifications(json.data.notifications);
      setMeta(json.data.meta);
    } catch (error) {
      if (!mounted.current) return;
      setMessage(error.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [request, page, unreadFilter]);

  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => { mounted.current = false; };
  }, [load]);

  const markRead = async (id) => {
    if (marking.has(id)) return;
    setMarking((prev) => new Set([...prev, id]));
    try {
      const response = await request(`/notifications/${id}/read`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Não foi possível marcar como lida.');
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, readAt: new Date() } : item)));
      setMeta((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setMarking((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const markReadAll = async () => {
    setBusy(true);
    try {
      const response = await request('/notifications/read-all', { method: 'PATCH' });
      if (!response.ok) throw new Error('Não foi possível marcar todas como lidas.');
      setNotifications((prev) => prev.map((item) => ({ ...item, readAt: new Date() })));
      setMeta((prev) => ({ ...prev, unread: 0 }));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const openTask = (entityId) => {
    navigate(`/kanban/tarefas/${entityId}`);
  };

  const typeLabel = (type) => {
    const labels = {
      TASK_ASSIGNED: 'Nova atribuição',
      TASK_REASSIGNED: 'Reatribuição',
      ASSIGNMENT_ACCEPTED: 'Aceite',
      ASSIGNMENT_REJECTED: 'Rejeição',
      TASK_REQUEST_CREATED: 'Solicitação',
      TASK_REQUEST_APPROVED: 'Solicitação aprovada',
      TASK_REQUEST_DENIED: 'Solicitação negada',
      DEADLINE_CHANGED: 'Prazo alterado',
      TASK_COMPLETED: 'Conclusão',
      TASK_CANCELLED: 'Cancelamento',
      TASK_REOPENED: 'Reabertura',
      TASK_RESTORED: 'Restauração',
      TASK_DEADLINE_SOON: 'Prazo próximo',
      TASK_OVERDUE: 'Atraso',
    };
    return labels[type] || type;
  };

  const typeIcon = (type) => {
    if (type === 'TASK_OVERDUE') return <Mail size={16} className="text-danger" />;
    if (type === 'TASK_DEADLINE_SOON') return <Mail size={16} className="text-warning" />;
    return <Bell size={16} />;
  };

  return <div className="max-w-3xl mx-auto">
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="seaf-page-title text-text">Notificações</h1>
        <p className="seaf-page-description text-muted">Avisos sobre atribuições, solicitações, prazos e alterações das suas tarefas.</p>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={unreadFilter} onChange={(e) => { setUnreadFilter(e.target.checked); setPage(1); }} className="rounded border-brand-700 text-brand-900 focus:ring-brand-700" />
          <span className="text-sm font-semibold">Somente não lidas</span>
        </label>
        {meta.unread > 0 && <button onClick={markReadAll} disabled={busy} className="ml-3 action-primary text-xs">{busy ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}Marcar todas como lidas</button>}
      </div>
    </div>

    {message && <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-danger">{message}</p>}

    {notifications.length === 0 ? (
      <div className="mt-10 rounded-2xl border border-border bg-background p-10 text-center">
        <Bell size={48} className="mx-auto opacity-20" />
        <h2 className="mt-4 text-lg font-bold text-text">Sem notificações</h2>
        <p className="mt-1 text-sm text-muted">Não há avisos para exibir no momento.</p>
      </div>
    ) : (
      <div className="mt-6 space-y-3">
        {notifications.map((item) => (
          <article key={item.id} className={`rounded-xl border border-border bg-white p-4 shadow-sm ${!item.readAt ? 'ring-1 ring-brand-700 bg-brand-100/30' : ''}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{typeIcon(item.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-bold text-text truncate">{typeLabel(item.type)}</p>
                  <span className={`text-xs font-bold ${item.readAt ? 'text-muted' : 'text-brand-900'}`}>{!item.readAt ? 'Não lida' : 'Lida'}</span>
                </div>
                <p className="text-sm text-muted line-clamp-2">{item.body}</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-muted">{new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                  {!item.readAt && (
                    <button onClick={() => markRead(item.id)} disabled={marking.has(item.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors">
                      <Check size={14} />Marcar como lida
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => openTask(item.entityId)}
                className="shrink-0 rounded-lg p-2 text-muted hover:bg-background hover:text-brand-900 transition-colors"
                aria-label="Abrir tarefa"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    )}

    {meta.totalPages > 1 && (
      <div className="mt-8 flex items-center justify-between gap-2">
        <button disabled={page === 1 || busy} onClick={() => setPage((p) => p - 1)} className="action-secondary text-xs">Anterior</button>
        <span className="text-xs text-muted">Página {page} de {meta.totalPages}</span>
        <button disabled={page >= meta.totalPages || busy} onClick={() => setPage((p) => p + 1)} className="action-secondary text-xs">Próxima</button>
      </div>
    )}
  </div>;
}

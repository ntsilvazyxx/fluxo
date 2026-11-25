import { Bell, Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  entityId: string;
  readAt: string | null;
};

export function NotificationsMenu() {
  const { request } = useAuth();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const noticesRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await request('/notifications?page=1&pageSize=5&unread=false');
      if (!response.ok) return;
      const body = await response.json();
      setNotifications(body.data?.notifications ?? []);
      setUnread(body.data?.meta?.unread ?? 0);
    } catch {
      // Ignora falha de rede transitória
    }
  }, [request]);

  useEffect(() => {
    void loadNotifications();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadNotifications();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNoticeOpen(false);
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);

  useEffect(() => {
    if (!noticeOpen) return undefined;
    const close = (event: MouseEvent) => {
      if (noticesRef.current && !noticesRef.current.contains(event.target as Node)) {
        setNoticeOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [noticeOpen]);

  const markRead = async (id: string) => {
    try {
      const response = await request(`/notifications/${id}/read`, { method: 'PATCH' });
      if (response.ok) {
        setNotifications((items) =>
          items.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)),
        );
        setUnread((count) => Math.max(0, count - 1));
      }
    } catch {
      // Ignora erro transitório
    }
  };

  return (
    <div ref={noticesRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setNoticeOpen((value) => !value);
          void loadNotifications();
        }}
        className="relative grid min-h-9 min-w-9 sm:min-h-10 sm:min-w-10 place-items-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        aria-label="Notificações"
        aria-expanded={noticeOpen}
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold text-white shadow-xs">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {noticeOpen && (
        <section
          className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-white p-3 text-text shadow-panel"
          aria-label="Notificações recentes"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="seaf-section-title text-text">Notificações</h2>
            <Link
              to="/notificacoes"
              onClick={() => setNoticeOpen(false)}
              className="text-xs font-bold text-brand-700 hover:underline"
            >
              Ver histórico
            </Link>
          </div>

          {notifications.length ? (
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl p-2.5 transition-colors ${item.readAt ? 'bg-background/60' : 'bg-brand-100/70'}`}
                >
                  <Link
                    to={`/kanban/tarefas/${item.entityId}`}
                    onClick={() => setNoticeOpen(false)}
                    className="block text-xs sm:text-sm font-semibold hover:underline text-text"
                  >
                    {item.title}
                  </Link>
                  <p className="line-clamp-2 text-xs text-muted mt-0.5">{item.body}</p>
                  {!item.readAt && (
                    <button
                      type="button"
                      onClick={() => void markRead(item.id)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
                    >
                      <Check size={12} />
                      Marcar como lida
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="p-3 text-xs sm:text-sm text-muted text-center">Nenhuma notificação recente.</p>
          )}
        </section>
      )}
    </div>
  );
}

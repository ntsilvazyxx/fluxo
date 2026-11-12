import { Archive, Bell, CalendarDays, Columns3, Home, LogOut, Menu, ShieldCheck, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export function AppShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const managerial = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER'].includes(user.role.code);
  const administer = ['ADMIN_MASTER', 'SECRETARY'].includes(user.role.code);
  const links = [
    { to: '/', label: 'Início', icon: Home },
    ...(managerial ? [
      { to: '/kanban', label: 'Kanban', icon: Columns3 },
      { to: '/calendarios', label: 'Calendários', icon: CalendarDays },
    ] : []),
    { to: '/minhas-tarefas', label: 'Minhas tarefas', icon: ShieldCheck },
    { to: '/historico', label: 'Histórico', icon: Archive },
    { to: '/notificacoes', label: 'Notificações', icon: Bell },
    ...(administer ? [{ to: '/usuarios', label: 'Usuários', icon: UsersRound }] : []),
    { to: '/equipes', label: 'Equipes', icon: UsersRound },
  ];

  return <div className="min-h-screen bg-background text-text">
    <header className="sticky top-0 z-20 bg-brand-900 text-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <button className="min-h-11 min-w-11 p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Abrir navegação"><Menu /></button>
        <span className="grid size-9 place-items-center rounded-lg bg-white font-black text-brand-900">SE</span>
        <div className="min-w-0 flex-1"><p className="font-bold">SEAF</p><p className="truncate text-xs text-white/70">Gestão de Tarefas</p></div>
        <div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user.name}</p><p className="text-xs text-white/70">{user.role.label}</p></div>
        <button onClick={logout} className="grid min-h-11 min-w-11 place-items-center" aria-label="Sair"><LogOut size={20} /></button>
        <Link to="/notificacoes" className="grid min-h-11 min-w-11 place-items-center text-white/90 hover:text-white" aria-label="Notificações"><Bell size={20} /></Link>
      </div>
    </header>
    <div className="mx-auto flex max-w-7xl">
      <aside className={`${open ? 'block' : 'hidden'} fixed inset-x-0 top-16 z-10 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border bg-white p-3 md:static md:block md:min-h-[calc(100vh-4rem)] md:w-60 md:border-b-0 md:border-r md:p-5`}>
        {links.map(({ to, label, icon: Icon }) => <NavLink onClick={() => setOpen(false)} end={to === '/'} className={({ isActive }) => `mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${isActive ? 'bg-brand-100 text-brand-900' : 'text-muted hover:bg-background'}`} key={to} to={to}><Icon size={19} />{label}</NavLink>)}
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><Outlet /></main>
    </div>
  </div>;
}

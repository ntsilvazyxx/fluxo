import { Archive, Columns3, ListTodo, Users, UsersRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.tsx';
import { NavItem } from './NavItem.tsx';

export function NavHorizontal() {
  const { user } = useAuth();
  const roleCode = user?.role?.code;

  const isTechnician = roleCode === 'TECHNICIAN';
  const canManageUsers = ['ADMIN_MASTER', 'SECRETARY'].includes(roleCode);

  const items = [
    { to: '/kanban', label: 'Kanban', icon: Columns3, end: true },
    ...(isTechnician ? [{ to: '/minhas-tarefas', label: 'Minhas Tarefas', icon: ListTodo }] : []),
    { to: '/historico', label: 'Arquivadas', icon: Archive },
    ...(canManageUsers ? [{ to: '/usuarios', label: 'Usuários', icon: Users }] : []),
    { to: '/equipes', label: 'Equipes', icon: UsersRound },
  ];

  return (
    <nav aria-label="Navegação principal" className="w-full flex justify-center overflow-x-auto no-scrollbar">
      <ul className="flex items-center justify-center gap-2 sm:gap-3 md:gap-5 min-w-max mx-auto px-4 sm:px-6">
        {items.map((item) => (
          <li key={item.to}>
            <NavItem to={item.to} label={item.label} icon={item.icon} end={item.end} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

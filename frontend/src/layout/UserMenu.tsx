import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.tsx';
import { getRoleLabel } from '../auth/roles.ts';

function getInitials(name?: string) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="flex items-center gap-2 sm:gap-2.5">
      <div
        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-700 border border-white/30 flex items-center justify-center text-white font-bold text-xs shadow-inner shrink-0"
        aria-hidden="true"
        title={user.name}
      >
        {getInitials(user.name)}
      </div>

      <div className="hidden sm:flex flex-col text-left max-w-[130px] md:max-w-[180px]">
        <span className="text-xs sm:text-sm font-semibold text-white truncate leading-tight">
          {user.name}
        </span>
        <span className="text-[10px] text-slate-300 font-medium truncate leading-tight">
          {getRoleLabel(user.role)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => void logout()}
        className="grid min-h-9 min-w-9 place-items-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        title="Sair do sistema"
        aria-label="Sair"
      >
        <LogOut size={18} />
      </button>
    </div>
  );
}

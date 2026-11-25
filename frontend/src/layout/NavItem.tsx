import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface NavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export function NavItem({ to, label, icon: Icon, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        `group flex flex-col items-center justify-center min-w-[5rem] sm:min-w-[5.75rem] px-3.5 sm:px-4 py-2 rounded-xl text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
          isActive
            ? 'bg-white/20 text-white font-semibold shadow-xs border border-white/25'
            : 'text-slate-300 hover:text-white hover:bg-white/10 font-medium'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={20}
            className={`transition-colors duration-150 ${isActive ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}
            aria-hidden="true"
          />
          <span className="seaf-label mt-1 whitespace-nowrap">
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

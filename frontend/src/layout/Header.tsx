import logo from '../../../docs/sdds/assets/logomarca-seaf-original.png';
import { NavHorizontal } from './NavHorizontal.tsx';
import { NotificationsMenu } from './NotificationsMenu.tsx';
import { UserMenu } from './UserMenu.tsx';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-brand-900 text-white shadow-md border-b border-brand-700/40 rounded-b-2xl">
      {/* Área superior — Identificação e usuário */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="SEAF - Governo de Mato Grosso"
            className="h-9 sm:h-10 w-auto rounded bg-white p-1 object-contain shrink-0 shadow-xs"
          />
          <div className="h-7 w-px bg-white/20 hidden sm:block" aria-hidden="true" />
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-extrabold tracking-wide text-white leading-tight">
              SEAF
            </span>
            <span className="text-[10px] sm:text-xs text-slate-300 font-medium leading-none">
              Gestão de tarefas
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationsMenu />
          <UserMenu />
        </div>
      </div>

      {/* Área inferior — Navegação principal */}
      <NavHorizontal />
    </header>
  );
}

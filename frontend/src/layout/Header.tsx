import logo from '../../../docs/sdds/assets/logomarca-seaf-original.png';
import { NavHorizontal } from './NavHorizontal.tsx';
import { NotificationsMenu } from './NotificationsMenu.tsx';
import { UserMenu } from './UserMenu.tsx';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-brand-900 text-white shadow-md border-b border-brand-700/40 rounded-b-2xl">
      {/* 1. Barra superior — Cabeçalho institucional */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        {/* Esquerda: logotipo SEAF e Governo de Mato Grosso */}
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={logo}
            alt="SEAF - Governo de Mato Grosso"
            className="h-9 sm:h-10 w-auto rounded bg-white p-1 object-contain shrink-0 shadow-xs"
          />
          <div className="h-7 w-px bg-white/20 hidden sm:block shrink-0" aria-hidden="true" />
          <div className="flex flex-col min-w-0">
            <span className="text-base sm:text-lg font-extrabold tracking-wide text-white leading-tight truncate">
              SEAF
            </span>
            <span className="text-[10px] sm:text-xs text-slate-300 font-medium leading-none truncate">
              Gestão de tarefas
            </span>
          </div>
        </div>

        {/* Direita: notificações, avatar, nome, perfil e botão de sair */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <NotificationsMenu />
          <UserMenu />
        </div>
      </div>

      {/* 2. Segunda barra — Navegação principal dedicada e centralizada */}
      <div className="w-full border-t border-white/10 bg-brand-900/80 py-1.5 sm:py-2">
        <NavHorizontal />
      </div>
    </header>
  );
}

import { Outlet } from 'react-router-dom';
import { Header } from './Header.tsx';

export function AppShell() {
  return (
    <div className="app-shell min-h-screen overflow-x-hidden bg-background text-text flex flex-col">
      <Header />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}

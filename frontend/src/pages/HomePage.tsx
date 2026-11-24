import { useAuth } from '../auth/AuthContext.tsx';
import { getRoleLabel } from '../auth/roles.ts';

export function HomePage() {
  const { user } = useAuth();
  return (
    <>
      <p className="text-sm font-bold text-brand-700">Área autenticada</p>
      <h1 className="mt-2 text-3xl font-extrabold">Olá, {user.name.split(' ')[0]}</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Sua sessão está protegida e a navegação respeita o perfil {getRoleLabel(user.role)}. O módulo operacional de tarefas ainda não foi habilitado.
      </p>
    </>
  );
}

import { LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../../../docs/sdds/assets/logomarca-seaf-original.png';
import loginBg from '../assets/login-bg.jpg';
import { useAuth } from '../auth/AuthContext.tsx';

export function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try { await login(String(form.get('email') ?? ''), String(form.get('password') ?? '')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  };
  return (
    <main
      className="relative grid min-h-screen place-items-center bg-slate-50 bg-cover bg-center bg-no-repeat p-4 sm:p-6"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      <section className="w-full max-w-md rounded-2xl border border-border/80 bg-white/95 p-6 shadow-xl backdrop-blur-sm sm:p-8" aria-labelledby="login-title">
        <img src={logo} alt="Secretaria de Estado de Agricultura Familiar de Mato Grosso" className="mx-auto h-auto max-h-20 w-auto max-w-full object-contain" />
        <div className="mt-7 text-center"><p className="text-sm font-semibold text-brand-700">Sistema institucional</p><h1 id="login-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Entrar no sistema</h1><p className="mt-2 text-sm text-muted">Gestão e acompanhamento de tarefas da SEAF.</p></div>
        <form onSubmit={submit} className="mt-7 space-y-5">
          <label className="block text-sm font-semibold">E-mail<div className="relative mt-2"><Mail className="pointer-events-none absolute left-3 top-3 text-muted" size={18} /><input className="field pl-10" name="email" type="email" autoComplete="username" required /></div></label>
          <label className="block text-sm font-semibold">Senha<div className="relative mt-2"><LockKeyhole className="pointer-events-none absolute left-3 top-3 text-muted" size={18} /><input className="field pl-10" name="password" type="password" autoComplete="current-password" required /></div></label>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <button disabled={busy} className="action-primary w-full">{busy ? 'Verificando…' : 'Entrar'}</button>
        </form>
        <Link className="mt-6 block text-center text-sm font-semibold text-brand-700 hover:underline" to="/recuperar-senha">Esqueceu a senha?</Link>
      </section>
    </main>
  );
}

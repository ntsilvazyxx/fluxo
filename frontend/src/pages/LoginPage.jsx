import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
export function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget);
    try {
      await login(form.get('email'), form.get('password'));
    } catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <main className="grid min-h-screen bg-background lg:grid-cols-2">
    <section className="hidden bg-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between"><div className="font-bold">SEAF · Governo de Mato Grosso</div><div><p className="text-sm font-bold uppercase tracking-widest text-blue-200">Ambiente seguro</p><h1 className="mt-5 text-5xl font-extrabold">Gestão pública com clareza, responsabilidade e histórico.</h1></div><p className="text-xs text-white/60">Sistema de Gestão e Acompanhamento de Tarefas</p></section>
    <section className="flex items-center justify-center p-5"><div className="w-full max-w-md rounded-3xl border border-border bg-white p-7 shadow-card"><span className="grid size-11 place-items-center rounded-xl bg-brand-900 font-black text-white">SE</span><p className="mt-7 text-sm font-bold text-brand-700">Acesso institucional</p>
      <h1 className="mt-2 text-3xl font-extrabold">Entrar no sistema</h1>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block text-sm font-bold">E-mail<input className="field mt-2" name="email" type="email" autoComplete="username" required /></label>
        <label className="block text-sm font-bold">Senha<input className="field mt-2" name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
        <button disabled={busy} className="action-primary w-full">{busy ? 'Verificando…' : 'Entrar'}</button>
      </form><Link className="mt-6 block text-center text-sm font-bold text-brand-700" to="/recuperar-senha">Recuperar acesso</Link>
    </div></section>
  </main>;
}

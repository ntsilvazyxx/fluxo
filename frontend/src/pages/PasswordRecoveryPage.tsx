import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api/v1';
export function PasswordRecoveryPage() {
  const route = useLocation();
  const [token, setToken] = useState(() => new URLSearchParams(route.hash.slice(1)).get('token'));
  useEffect(() => {
    const incoming = new URLSearchParams(route.hash.slice(1)).get('token');
    if (incoming) {
      // Synchronize a new link opened while the recovery page is already mounted.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(incoming);
      history.replaceState(null, '', route.pathname);
    }
  }, [route.hash, route.pathname]);
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage(''); const form = new FormData(event.currentTarget);
    try {
      const result = await fetch(`${API}/auth/password/${token ? 'reset' : 'forgot'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(token ? { token, password: form.get('password') } : { email: form.get('email') }) });
      const json = result.status === 204 ? null : await result.json();
      setMessage(result.ok ? token ? 'Senha redefinida. Entre novamente com seu e-mail e senha.' : json.data.message : json.error?.message ?? 'Não foi possível concluir a solicitação.');
    } catch { setMessage('Não foi possível acessar o serviço. Tente novamente.'); } finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-lg p-6"><h1 className="text-2xl font-extrabold">{token ? 'Redefinir senha' : 'Recuperar acesso'}</h1><form className="mt-6 space-y-4" onSubmit={submit}>
    {token ? <label className="block font-bold">Nova senha<input className="field mt-2" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><span className="text-sm font-normal">Use pelo menos 12 caracteres, maiúscula, minúscula e número.</span></label> : <label className="block font-bold">E-mail<input className="field mt-2" name="email" type="email" autoComplete="username" required /></label>}
    <button className="action-primary" disabled={busy}>{busy ? 'Aguarde…' : token ? 'Salvar nova senha' : 'Solicitar recuperação'}</button>{message && <p role="status" className="rounded-xl bg-brand-100 p-3">{message}</p>}
  </form><Link to="/login" className="mt-6 inline-block font-bold text-brand-700">Voltar ao login</Link></main>;
}

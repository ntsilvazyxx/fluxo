import { Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';

type Team = { id: string; name: string; isActive: boolean };

export function TeamsPage() {
  const { request, user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const response = await request('/teams'); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível carregar as equipes.'); setTeams(body.data?.teams ?? []); }, [request]);
  useEffect(() => { void Promise.resolve().then(load).catch((error) => setMessage(error instanceof Error ? error.message : 'Erro ao carregar equipes.')); }, [load]);
  const filtered = useMemo(() => teams.filter((team) => team.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR').trim())), [query, teams]);
  const canCreate = ['ADMIN_MASTER', 'SECRETARY'].includes(user.role.code);
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const response = await request('/teams', { method: 'POST', body: JSON.stringify({ name }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível cadastrar a equipe.'); setTeams((current) => [...current, body.data.team].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))); setName(''); setOpen(false); setMessage('Equipe cadastrada com sucesso.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível cadastrar a equipe.'); }
    finally { setBusy(false); }
  };
  return <section className="mx-auto max-w-4xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">Equipes</h1><p className="mt-2 text-sm text-muted">Consulte e cadastre equipes do sistema.</p></div>{canCreate && <button onClick={() => setOpen(true)} className="action-primary"><Plus size={18} />Nova equipe</button>}</div>
    <label className="relative mt-7 block"><Search className="absolute left-3 top-3 text-muted" size={18} /><input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar equipes pelo nome" aria-label="Pesquisar equipes" /></label>
    {message && <p role="status" className="mt-4 rounded-xl bg-brand-100 p-3 text-sm text-brand-900">{message}</p>}
    <div className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">{filtered.length ? filtered.map((team) => <article key={team.id} className="flex min-h-16 items-center justify-between gap-4 px-4 py-3"><h2 className="font-semibold">{team.name}</h2><span className={`text-xs font-semibold ${team.isActive ? 'text-success' : 'text-muted'}`}>{team.isActive ? 'Ativa' : 'Inativa'}</span></article>) : <p className="p-8 text-center text-sm text-muted">Nenhuma equipe encontrada.</p>}</div>
    {open && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="new-team-title"><form onSubmit={create} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-panel"><div className="flex items-center justify-between gap-4"><h2 id="new-team-title" className="text-lg font-bold">Nova equipe</h2><button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-lg text-muted hover:bg-background" aria-label="Fechar"><X size={19} /></button></div><label className="mt-5 block text-sm font-semibold">Nome da equipe<input className="field mt-2" value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={160} required autoFocus /></label><div className="mt-6 flex justify-end gap-2"><button type="button" className="action-secondary" onClick={() => setOpen(false)}>Cancelar</button><button disabled={busy} className="action-primary">{busy ? 'Salvando…' : 'Cadastrar equipe'}</button></div></form></div>}
  </section>;
}

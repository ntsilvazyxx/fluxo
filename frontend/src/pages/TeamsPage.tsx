import { Pencil, Plus, Power, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';

type Team = { id: string; name: string; isActive: boolean };

export function TeamsPage() {
  const { request, user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [deactivating, setDeactivating] = useState<Team | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await request('/teams');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível carregar as equipes.');
    setTeams(body.data?.teams ?? []);
  }, [request]);

  useEffect(() => {
    void Promise.resolve().then(load).catch((cause) => setError(cause instanceof Error ? cause.message : 'Erro ao carregar equipes.'));
  }, [load]);

  const filtered = useMemo(
    () => teams.filter((team) => team.name.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR').trim())),
    [query, teams],
  );
  const canManage = ['ADMIN_MASTER', 'SECRETARY'].includes(user.role.code);

  const openCreate = () => { setName(''); setEditing(null); setError(''); setMessage(''); setCreating(true); };
  const openEdit = (team: Team) => { setName(team.name); setEditing(team); setError(''); setMessage(''); setCreating(true); };
  const closeForm = () => { setCreating(false); setEditing(null); setName(''); };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await request(editing ? `/teams/${editing.id}` : '/teams', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ name }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível salvar a equipe.');
      setTeams((current) => editing
        ? current.map((team) => team.id === editing.id ? body.data.team : team)
        : [...current, body.data.team].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setMessage(editing ? 'Equipe atualizada com sucesso.' : 'Equipe cadastrada com sucesso.');
      closeForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a equipe.');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!deactivating) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await request(`/teams/${deactivating.id}/deactivate`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível inativar a equipe.');
      setTeams((current) => current.map((team) => team.id === deactivating.id ? body.data.team : team));
      setMessage('Equipe inativada. Tarefas, vínculos e histórico foram preservados.');
      setDeactivating(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível inativar a equipe.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipes</h1>
          <p className="mt-2 text-sm text-muted">Consulte, edite e inative equipes do sistema.</p>
        </div>
        {canManage && <button onClick={openCreate} className="action-primary"><Plus size={18} />Nova equipe</button>}
      </div>

      <label className="relative mt-7 block">
        <Search className="absolute left-3 top-3 text-muted" size={18} />
        <input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar equipes pelo nome" aria-label="Pesquisar equipes" />
      </label>

      {message && <p role="status" className="mt-4 rounded-xl bg-brand-100 p-3 text-sm text-brand-900">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
        {filtered.length ? filtered.map((team) => (
          <article key={team.id} className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-semibold">{team.name}</h2>
              <span className={`mt-1 inline-block text-xs font-semibold ${team.isActive ? 'text-success' : 'text-muted'}`}>{team.isActive ? 'Ativa' : 'Inativa'}</span>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <button className="action-secondary px-3" aria-label={`Editar ${team.name}`} onClick={() => openEdit(team)}><Pencil size={16} />Editar</button>
                {team.isActive && <button className="action-secondary px-3 text-danger" aria-label={`Inativar ${team.name}`} onClick={() => { setDeactivating(team); setError(''); setMessage(''); }}><Power size={16} />Inativar</button>}
              </div>
            )}
          </article>
        )) : <p className="p-8 text-center text-sm text-muted">Nenhuma equipe encontrada.</p>}
      </div>

      {creating && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="team-form-title">
          <form onSubmit={save} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between gap-4">
              <h2 id="team-form-title" className="text-lg font-bold">{editing ? 'Editar equipe' : 'Nova equipe'}</h2>
              <button type="button" onClick={closeForm} className="grid size-10 place-items-center rounded-lg text-muted hover:bg-background" aria-label="Fechar"><X size={19} /></button>
            </div>
            <label className="mt-5 block text-sm font-semibold">Nome da equipe
              <input className="field mt-2" value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={160} required autoFocus />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="action-secondary" onClick={closeForm}>Cancelar</button>
              <button disabled={busy} className="action-primary">{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar equipe'}</button>
            </div>
          </form>
        </div>
      )}

      {deactivating && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="team-deactivate-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-panel">
            <h2 id="team-deactivate-title" className="text-lg font-bold">Inativar equipe</h2>
            <p className="mt-3 text-sm text-muted">A equipe <strong>{deactivating.name}</strong> deixará de aceitar novos encaminhamentos. Tarefas, usuários, vínculos e histórico serão preservados.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="action-secondary" onClick={() => setDeactivating(null)}>Cancelar</button>
              <button type="button" disabled={busy} className="action-primary" onClick={deactivate}>{busy ? 'Inativando…' : 'Inativar equipe'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

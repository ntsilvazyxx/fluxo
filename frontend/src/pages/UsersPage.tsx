import { KeyRound, Pencil, Plus, Search, UserCheck, UserX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';
import { getRoleLabel, getSelectableRoles } from '../auth/roles.ts';

type User = { id: string; name: string; email: string; isActive: boolean; role: { code: string; label: string } };

export function UsersPage() {
  const { request, user: actor, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [changingStatus, setChangingStatus] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusResultUncertain, setStatusResultUncertain] = useState(false);
  const statusSubmissionInFlight = useRef(false);

  const load = useCallback(async () => {
    const response = await request('/users');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível carregar usuários.');
    setUsers(body.data?.users ?? []);
  }, [request]);

  useEffect(() => {
    void Promise.resolve().then(load).catch((cause) => setError(cause instanceof Error ? cause.message : 'Erro ao carregar usuários.'));
  }, [load]);

  const visible = useMemo(
    () => users.filter((item) => `${item.name} ${item.email}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR').trim())),
    [query, users],
  );
  const canCreate = ['ADMIN_MASTER', 'SECRETARY'].includes(actor.role.code);
  const canEdit = actor.role.code === 'ADMIN_MASTER';
  const selectableRoles = useMemo(() => getSelectableRoles(actor.role.code), [actor.role.code]);

  const replaceUser = (updated: User) => setUsers((items) => items.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
  const closeModals = () => { setFormMode(null); setEditing(null); setResetting(null); setChangingStatus(null); setStatusResultUncertain(false); };

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = editing
      ? { name: String(form.get('name') ?? ''), roleCode: String(form.get('roleCode') ?? ''), reason: String(form.get('reason') ?? '') }
      : { name: String(form.get('name') ?? ''), email: String(form.get('email') ?? ''), password: String(form.get('password') ?? ''), roleCode: String(form.get('roleCode') ?? '') };
    try {
      const response = await request(editing ? `/users/${editing.id}` : '/users', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível salvar o usuário.');
      if (editing) replaceUser(body.data.user);
      else setUsers((items) => [...items, body.data.user].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setMessage(editing ? 'Usuário atualizado com sucesso.' : 'Usuário cadastrado com sucesso.');
      closeModals();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o usuário.');
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetting) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirmation') ?? '');
    setError(''); setMessage('');
    if (password !== confirmation) { setError('A confirmação da senha não coincide.'); return; }
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('A senha deve ter ao menos 12 caracteres, com letra minúscula, maiúscula e número.');
      return;
    }
    setBusy(true);
    try {
      const response = await request(`/users/${resetting.id}/password-reset`, {
        method: 'POST',
        body: JSON.stringify({ password, reason: String(form.get('reason') ?? '') }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível redefinir a senha.');
      const target = resetting;
      setResetting(null);
      if (target.id === actor.id) {
        await logout();
      } else {
        setMessage(`Senha de ${target.name} redefinida. As sessões ativas foram encerradas.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível redefinir a senha.');
    } finally {
      setBusy(false);
    }
  };

  const submitStatus = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!changingStatus || statusSubmissionInFlight.current) return;
    statusSubmissionInFlight.current = true;
    const form = new FormData(event.currentTarget);
    const desiredIsActive = !changingStatus.isActive;
    setBusy(true); setError(''); setMessage('');
    try {
      let response: Response;
      try {
        response = await request(`/users/${changingStatus.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: desiredIsActive, reason: String(form.get('reason') ?? '') }),
        });
      } catch {
        setStatusResultUncertain(true);
        setError('Não foi possível confirmar a alteração por uma falha de conexão. Verifique a situação atual antes de tentar novamente.');
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? `Não foi possível alterar a situação do usuário (HTTP ${response.status}).`);
      if (!body?.data?.user) {
        setStatusResultUncertain(true);
        setError('O servidor respondeu, mas não foi possível confirmar o resultado. Verifique a situação atual antes de tentar novamente.');
        return;
      }
      replaceUser(body.data.user);
      setMessage(changingStatus.isActive ? 'Usuário inativado. Sessões ativas foram encerradas.' : 'Usuário reativado com sucesso.');
      setChangingStatus(null);
      setStatusResultUncertain(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a situação do usuário.');
    } finally {
      statusSubmissionInFlight.current = false;
      setBusy(false);
    }
  };

  const verifyStatus = async () => {
    if (!changingStatus || statusSubmissionInFlight.current) return;
    statusSubmissionInFlight.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await request(`/users/${changingStatus.id}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? `Não foi possível consultar a situação do usuário (HTTP ${response.status}).`);
      if (!body?.data?.user) throw new Error('O servidor retornou uma resposta inválida ao consultar o usuário.');
      const current = body.data.user as User;
      replaceUser(current);
      if (current.isActive !== changingStatus.isActive) {
        setMessage(changingStatus.isActive ? 'A consulta confirmou que o usuário foi inativado.' : 'A consulta confirmou que o usuário foi reativado.');
        setChangingStatus(null);
        setStatusResultUncertain(false);
      } else {
        setStatusResultUncertain(false);
        setError(`A consulta confirmou que o usuário continua ${current.isActive ? 'ativo' : 'inativo'}. Você pode tentar novamente.`);
      }
    } catch (cause) {
      setStatusResultUncertain(true);
      setError(cause instanceof TypeError
        ? 'Ainda não foi possível consultar o servidor. Não repita a alteração até confirmar a situação atual.'
        : cause instanceof Error ? cause.message : 'Não foi possível consultar a situação atual do usuário.');
    } finally {
      statusSubmissionInFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
          <p className="mt-2 text-sm text-muted">Consulte e administre usuários autorizados.</p>
        </div>
        {canCreate && <button className="action-primary" onClick={() => { setEditing(null); setFormMode('create'); setError(''); setMessage(''); }}><Plus size={18} />Novo usuário</button>}
      </div>

      <label className="relative mt-7 block">
        <Search className="absolute left-3 top-3 text-muted" size={18} />
        <input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por nome ou e-mail" aria-label="Pesquisar usuários" />
      </label>

      {message && <p role="status" className="mt-4 rounded-xl bg-brand-100 p-3 text-sm text-brand-900">{message}</p>}
      {error && !changingStatus && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
        {visible.length ? visible.map((item) => (
          <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-semibold">{item.name}</p>
              <p className="truncate text-sm text-muted">{item.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-semibold ${item.isActive ? 'text-brand-900' : 'text-muted'}`}>{getRoleLabel(item.role)} · {item.isActive ? 'Ativo' : 'Inativo'}</span>
              {canEdit && <>
                <button className="grid min-h-11 min-w-11 place-items-center rounded-lg text-brand-700 hover:bg-brand-100" aria-label={`Editar ${item.name}`} onClick={() => { setEditing(item); setFormMode('edit'); setError(''); setMessage(''); }}><Pencil size={17} /></button>
                <button className="grid min-h-11 min-w-11 place-items-center rounded-lg text-brand-700 hover:bg-brand-100" aria-label={`Redefinir senha de ${item.name}`} onClick={() => { setResetting(item); setError(''); setMessage(''); }}><KeyRound size={17} /></button>
                {item.id !== actor.id && <button className={`grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-brand-100 ${item.isActive ? 'text-danger' : 'text-success'}`} aria-label={item.isActive ? `Inativar ${item.name}` : `Reativar ${item.name}`} onClick={() => { setChangingStatus(item); setStatusResultUncertain(false); setError(''); setMessage(''); }}>{item.isActive ? <UserX size={17} /> : <UserCheck size={17} />}</button>}
              </>}
            </div>
          </article>
        )) : <p className="p-8 text-center text-sm text-muted">Nenhum usuário encontrado.</p>}
      </div>

      {formMode && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="user-form-title">
          <form onSubmit={submitForm} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <h2 id="user-form-title" className="text-lg font-bold">{editing ? 'Editar usuário' : 'Novo usuário'}</h2>
              <button type="button" onClick={closeModals} className="grid size-10 place-items-center rounded-lg hover:bg-background" aria-label="Fechar"><X size={19} /></button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold">Nome<input className="field mt-1" name="name" defaultValue={editing?.name ?? ''} minLength={3} maxLength={160} required autoFocus /></label>
              {!editing && <>
                <label className="block text-sm font-semibold">E-mail<input className="field mt-1" name="email" type="email" required /></label>
                <label className="block text-sm font-semibold">Senha<input className="field mt-1" name="password" type="password" minLength={12} required /><span className="mt-1 block text-xs font-normal text-muted">Mínimo de 12 caracteres, com maiúscula, minúscula e número.</span></label>
              </>}
              <label htmlFor="user-role-select" className="block text-sm font-semibold">Perfil</label>
              <select id="user-role-select" aria-label="Perfil" className="field mt-1" name="roleCode" defaultValue={editing?.role.code ?? selectableRoles[0]?.code ?? 'TECHNICIAN'}>{selectableRoles.map((role) => <option key={role.code} value={role.code}>{role.label}</option>)}</select>
              {editing && <label className="block text-sm font-semibold">Justificativa<textarea className="field mt-1" name="reason" minLength={5} required /></label>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="action-secondary" onClick={closeModals}>Cancelar</button>
              <button disabled={busy} className="action-primary">{busy ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}

      {resetting && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="password-reset-title">
          <form onSubmit={submitReset} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <h2 id="password-reset-title" className="text-lg font-bold">Redefinir senha</h2>
              <button type="button" onClick={closeModals} className="grid size-10 place-items-center rounded-lg hover:bg-background" aria-label="Fechar"><X size={19} /></button>
            </div>
            <p className="mt-3 text-sm text-muted">Defina uma nova senha para <strong>{resetting.name}</strong>. A senha atual nunca é exibida e todas as sessões ativas serão encerradas.</p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold">Nova senha<input className="field mt-1" name="password" type="password" minLength={12} required autoFocus /><span className="mt-1 block text-xs font-normal text-muted">Mínimo de 12 caracteres, com maiúscula, minúscula e número.</span></label>
              <label className="block text-sm font-semibold">Confirmar nova senha<input className="field mt-1" name="confirmation" type="password" minLength={12} required /></label>
              <label className="block text-sm font-semibold">Justificativa<textarea className="field mt-1" name="reason" minLength={5} required /></label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="action-secondary" onClick={closeModals}>Cancelar</button>
              <button disabled={busy} className="action-primary">{busy ? 'Redefinindo…' : 'Redefinir senha'}</button>
            </div>
          </form>
        </div>
      )}

      {changingStatus && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="status-title">
          <form onSubmit={submitStatus} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <h2 id="status-title" className="text-lg font-bold">{changingStatus.isActive ? 'Inativar usuário' : 'Reativar usuário'}</h2>
              <button type="button" onClick={closeModals} disabled={busy} className="grid size-10 place-items-center rounded-lg hover:bg-background" aria-label="Fechar"><X size={19} /></button>
            </div>
            <p className="mt-3 text-sm text-muted">
              {changingStatus.isActive
                ? <>O usuário <strong>{changingStatus.name}</strong> não poderá entrar nem receber novas atribuições. Tarefas, histórico e vínculos serão preservados, e as sessões ativas serão encerradas.</>
                : <>O usuário <strong>{changingStatus.name}</strong> poderá voltar a entrar no sistema e receber atribuições.</>}
            </p>
            <label className="mt-5 block text-sm font-semibold">Justificativa<textarea className="field mt-1" name="reason" minLength={5} required autoFocus /></label>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="action-secondary" onClick={closeModals} disabled={busy}>Cancelar</button>
              {statusResultUncertain && <button type="button" className="action-secondary" onClick={() => void verifyStatus()} disabled={busy}>{busy ? 'Verificando…' : 'Verificar situação atual'}</button>}
              <button disabled={busy} className="action-primary">{busy ? 'Salvando…' : changingStatus.isActive ? 'Inativar usuário' : 'Reativar usuário'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

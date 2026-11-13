/* eslint-disable react-hooks/set-state-in-effect */
import { CalendarDays, Check, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';

const weekdays = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const idempotencyKey = () => crypto.randomUUID();
const minutes = (time) => { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins; };
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const localInput = (value) => value ? new Date(value).toISOString().slice(0, 16) : '';
const initialSchedules = () => [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, start: '08:00', end: '12:00' },
  { weekday, start: '13:00', end: '17:00' },
]);

export function CalendarPage() {
  const { request, user } = useAuth();
  const canEdit = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER'].includes(user.role.code);
  const [calendars, setCalendars] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [calendar, setCalendar] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    const response = await request('/calendars');
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message);
    setCalendars(json.data.calendars);
    setSelectedId((current) => current || json.data.calendars[0]?.id || '');
  }, [request]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return setCalendar(null);
    const response = await request(`/calendars/${id}`);
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message);
    setCalendar(json.data.calendar);
  }, [request]);

  useEffect(() => {
    loadList().catch((cause) => setError(cause.message));
    if (canEdit) request('/teams').then((response) => response.json()).then((json) => setTeams(json.data?.teams ?? []));
  }, [loadList, request, canEdit]);
  useEffect(() => { loadDetail(selectedId).catch((cause) => setError(cause.message)); }, [selectedId, loadDetail]);

  const mutate = async (path, body, method = 'POST') => {
    setBusy(true);
    setError('');
    try {
      const response = await request(path, { method, headers: { 'idempotency-key': idempotencyKey() }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível salvar o calendário.');
      await loadList();
      setSelectedId(json.data.calendar.id);
      setCalendar(json.data.calendar);
      return true;
    } catch (cause) {
      setError(cause.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const availableTeams = teams.filter((team) => !calendars.some((item) => item.team.id === team.id));
  return <div className="max-w-6xl">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-bold text-brand-700">Configuração por equipe</p><h1 className="mt-1 text-3xl font-extrabold">Calendários de trabalho</h1><p className="mt-2 text-muted">Expedientes, intervalos, feriados e vigências históricas.</p></div>
      <CalendarDays className="text-brand-700" size={38} />
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-danger">{error}</p>}
    <div className="mt-6 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-4">
        {canEdit && availableTeams.length > 0 && <CreateCalendar teams={availableTeams} busy={busy} onSubmit={(body) => mutate('/calendars', body)} />}
        <section className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 className="font-extrabold">Equipes configuradas</h2>
          <div className="mt-3 space-y-2">{calendars.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`min-h-11 w-full rounded-xl px-3 text-left text-sm font-bold ${selectedId === item.id ? 'bg-brand-900 text-white' : 'bg-background text-text'}`}>{item.team.name}</button>)}{!calendars.length && <p className="text-sm text-muted">Nenhum calendário cadastrado.</p>}</div>
        </section>
      </aside>
      <div className="min-w-0">{calendar && <CalendarDetail calendar={calendar} canEdit={canEdit} busy={busy} mutate={mutate} />}</div>
    </div>
  </div>;
}

function CreateCalendar({ teams, busy, onSubmit }) {
  return <form className="rounded-2xl border border-border bg-white p-4 shadow-card" onSubmit={(event) => { event.preventDefault(); onSubmit(Object.fromEntries(new FormData(event.currentTarget))); }}>
    <h2 className="font-extrabold">Novo calendário</h2>
    <select name="teamId" required className="field mt-3"><option value="">Selecione a equipe</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
    <input name="timezone" required defaultValue="America/Cuiaba" className="field mt-3" aria-label="Fuso horário IANA" />
    <button disabled={busy} className="action-primary mt-3 w-full"><Plus size={18} />Criar calendário</button>
  </form>;
}

function CalendarDetail({ calendar, canEdit, busy, mutate }) {
  const drafts = calendar.versions.filter((version) => !version.publishedAt);
  const published = calendar.versions.filter((version) => version.publishedAt);
  const firstDraftId = drafts[0]?.id;
  const [editingId, setEditingId] = useState(firstDraftId ?? 'new');
  const editing = drafts.find((version) => version.id === editingId);
  useEffect(() => { setEditingId(firstDraftId ?? 'new'); }, [calendar.id, firstDraftId]);
  return <div className="space-y-5">
    <section className="rounded-2xl border border-border bg-white p-5 shadow-card">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-extrabold">{calendar.team.name}</h2><p className="text-sm text-muted">{calendar.timezone} · controle de versão {calendar.version}</p></div><span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-900">{published.length ? 'Calendário ativo' : 'Sem versão publicada'}</span></div>
    </section>
    {canEdit && <section className="rounded-2xl border border-border bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-extrabold">Configurar versão</h2><select className="field max-w-xs" value={editingId} onChange={(event) => setEditingId(event.target.value)}><option value="new">Nova versão</option>{drafts.map((version) => <option key={version.id} value={version.id}>Rascunho v{version.versionNumber}</option>)}</select></div>
      <VersionForm key={`${calendar.id}-${editingId}-${calendar.version}`} calendar={calendar} version={editing} busy={busy} mutate={mutate} />
    </section>}
    <section className="rounded-2xl border border-border bg-white p-5 shadow-card">
      <h2 className="text-xl font-extrabold">Histórico imutável</h2>
      <div className="mt-4 space-y-3">{published.map((version) => <VersionSummary key={version.id} version={version} active={calendar.activeVersionId === version.id} />)}{!published.length && <p className="text-sm text-muted">Publique uma versão vigente para iniciar a contabilização por expediente.</p>}</div>
    </section>
  </div>;
}

function VersionForm({ calendar, version, busy, mutate }) {
  const [effectiveFrom, setEffectiveFrom] = useState(localInput(version?.effectiveFrom) || new Date().toISOString().slice(0, 16));
  const [schedules, setSchedules] = useState(version ? version.schedules.map((item) => ({ ...item, start: clock(item.startMinute), end: clock(item.endMinute) })) : initialSchedules());
  const [exceptions, setExceptions] = useState(version ? version.exceptions.map((item) => ({ ...item, start: item.startMinute == null ? '08:00' : clock(item.startMinute), end: item.endMinute == null ? '17:00' : clock(item.endMinute) })) : []);
  const payload = () => ({
    expectedVersion: calendar.version,
    ...(version ? {} : { effectiveFrom: new Date(effectiveFrom).toISOString() }),
    schedules: schedules.map(({ weekday, start, end }) => ({ weekday: Number(weekday), startMinute: minutes(start), endMinute: minutes(end) })),
    exceptions: exceptions.map(({ localDate, type, start, end, description }) => ({ localDate, type, description, ...(type === 'WORKING_PERIOD' ? { startMinute: minutes(start), endMinute: minutes(end) } : {}) })),
  });
  const save = (event) => { event.preventDefault(); mutate(`/calendars/${calendar.id}/versions${version ? `/${version.id}` : ''}`, payload(), version ? 'PUT' : 'POST'); };
  return <form className="mt-5 space-y-6" onSubmit={save}>
    {!version && <label className="block text-sm font-bold">Início da vigência<input type="datetime-local" required value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="field mt-2" /></label>}
    {version && <p className="text-sm text-muted">Vigência planejada: {new Date(version.effectiveFrom).toLocaleString('pt-BR')}. O início não muda depois da criação do rascunho.</p>}
    <div><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">Expediente semanal</h3><button type="button" className="action-secondary" onClick={() => setSchedules([...schedules, { weekday: 1, start: '08:00', end: '12:00' }])}><Plus size={17} />Período</button></div><div className="mt-3 space-y-2">{schedules.map((row, index) => <div className="grid grid-cols-2 sm:grid-cols-[1fr_6.5rem_6.5rem_2.75rem] gap-2" key={index}><select className="field" value={row.weekday} onChange={(event) => setSchedules(schedules.map((item, position) => position === index ? { ...item, weekday: Number(event.target.value) } : item))}>{weekdays.map((day, position) => <option key={day} value={position + 1}>{day}</option>)}</select><input className="field" type="time" value={row.start} onChange={(event) => setSchedules(schedules.map((item, position) => position === index ? { ...item, start: event.target.value } : item))} /><input className="field" type="time" value={row.end} onChange={(event) => setSchedules(schedules.map((item, position) => position === index ? { ...item, end: event.target.value } : item))} /><button type="button" aria-label="Remover período" className="grid min-h-11 place-items-center rounded-xl text-danger" onClick={() => setSchedules(schedules.filter((_, position) => position !== index))}><Trash2 size={18} /></button></div>)}</div></div>
    <div><div className="flex items-center justify-between"><div><h3 className="font-extrabold">Exceções</h3><p className="text-xs text-muted">Feriados sempre anulam todo o dia.</p></div><button type="button" className="action-secondary" onClick={() => setExceptions([...exceptions, { localDate: '', type: 'HOLIDAY', start: '08:00', end: '17:00', description: '' }])}><Plus size={17} />Exceção</button></div><div className="mt-3 space-y-3">{exceptions.map((row, index) => <div className="grid gap-2 rounded-xl bg-background p-3 sm:grid-cols-2" key={index}><input className="field" required type="date" value={row.localDate} onChange={(event) => setExceptions(exceptions.map((item, position) => position === index ? { ...item, localDate: event.target.value } : item))} /><select className="field" value={row.type} onChange={(event) => setExceptions(exceptions.map((item, position) => position === index ? { ...item, type: event.target.value } : item))}><option value="HOLIDAY">Feriado / sem expediente</option><option value="WORKING_PERIOD">Período excepcional</option></select>{row.type === 'WORKING_PERIOD' && <><input className="field" type="time" value={row.start} onChange={(event) => setExceptions(exceptions.map((item, position) => position === index ? { ...item, start: event.target.value } : item))} /><input className="field" type="time" value={row.end} onChange={(event) => setExceptions(exceptions.map((item, position) => position === index ? { ...item, end: event.target.value } : item))} /></>}<input className="field sm:col-span-1" value={row.description} placeholder="Descrição" onChange={(event) => setExceptions(exceptions.map((item, position) => position === index ? { ...item, description: event.target.value } : item))} /><button type="button" className="action-danger" onClick={() => setExceptions(exceptions.filter((_, position) => position !== index))}><Trash2 size={17} />Remover</button></div>)}</div></div>
    <div className="flex flex-wrap gap-3"><button disabled={busy || !schedules.length} className="action-primary"><Check size={18} />Salvar rascunho</button>{version && <button type="button" disabled={busy || new Date(version.effectiveFrom) > new Date()} className="action-secondary" onClick={() => mutate(`/calendars/${calendar.id}/versions/${version.id}/publish`, { expectedVersion: calendar.version })}><CalendarDays size={18} />Publicar versão</button>}</div>
    {version && new Date(version.effectiveFrom) > new Date() && <p className="text-sm font-semibold text-warning">Esta versão futura permanecerá em rascunho até a publicação manual na data de vigência.</p>}
  </form>;
}

function VersionSummary({ version, active }) {
  return <article className="rounded-xl border border-border p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-extrabold">Versão {version.versionNumber}</p>{active && <span className="text-xs font-bold text-success">ATIVA</span>}</div><p className="mt-1 text-sm text-muted">De {new Date(version.effectiveFrom).toLocaleString('pt-BR')} {version.effectiveTo ? `até ${new Date(version.effectiveTo).toLocaleString('pt-BR')}` : 'em diante'}</p><p className="mt-2 text-sm">{version.schedules.length} período(s) semanais · {version.exceptions.length} exceção(ões)</p></article>;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';

type Team = { id: string; name: string; isActive: boolean };
type User = { id: string; name: string; isActive: boolean; role: { code: string; label?: string } };
type StagedFile = { id: string; originalName: string; mimeType: string; sizeBytes: number; file: File };
const acceptanceOptions = [[60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [480, '8 horas'], [720, '12 horas'], [1440, '24 horas']];
const executionOptions = [[720, 'Meio dia (12 horas)'], [1440, '1 dia (24 horas)'], [2880, '2 dias'], [4320, '3 dias'], [7200, '5 dias']];
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx'];
const extensionOf = (name: string) => `.${name.split('.').pop()?.toLowerCase() ?? ''}`;

export function TaskFormPage() {
  const { request, upload, user } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const submitted = useRef(false);

  const loadOptions = useCallback(async () => {
    try {
      const [teamResponse, userResponse] = await Promise.all([request('/teams'), request('/users')]);
      const teamBody: any = await teamResponse.json();
      const userBody: any = await userResponse.json();
      setTeams(teamBody.data?.teams ?? []);
      setAllUsers(userBody.data?.users ?? []);
    } catch {
      setError('Não foi possível carregar os dados do formulário.');
    }
  }, [request]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadOptions(); }, [loadOptions]);

  const eligibleUsers = (teamId: string) => allUsers.filter((item) => item.isActive && (!teamId || true));

  const selectFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const invalid = selected.find((file) => !allowedExtensions.includes(extensionOf(file.name)));
    if (invalid) {
      setError(`Formato não permitido: ${invalid.name}. Use JPG, JPEG, PNG, WEBP, PDF, DOC ou DOCX.`);
      event.target.value = '';
      return;
    }
    setError('');
    setStagedFiles((current) => [...current, ...selected.map((file) => ({ id: crypto.randomUUID(), originalName: file.name, mimeType: file.type, sizeBytes: file.size, file }))]);
    event.target.value = '';
  };

  const removeStaged = (id: string) => setStagedFiles((current) => current.filter((item) => item.id !== id));

  const sendStaged = async () => {
    if (stagedFiles.length === 0) return [];
    setBusy(true);
    setError('');
    try {
      const ids: string[] = [];
      for (const staged of stagedFiles) {
        const form = new FormData();
        form.append('attachment', staged.file);
        const response = await upload('/task-uploads/staged', form, {
          headers: { 'idempotency-key': crypto.randomUUID() },
          onProgress: (value) => setUploadProgress((current) => ({ ...current, [staged.id]: value })),
        });
        const json: any = await response.json();
        if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível enviar o anexo.');
        ids.push(json.data.id);
      }
      setUploadProgress({});
      return ids;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao enviar anexos iniciais.');
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError('');
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const teamId = String(raw.teamId);
    const responsibleUsers = eligibleUsers(teamId);
    const responsible = responsibleUsers.find((item) => item.id === String(raw.userId));
    if (!responsible) { setError('Responsável inválido para a equipe selecionada.'); submitted.current = false; setBusy(false); return; }
    try {
      const attachmentIds = await sendStaged();
      const body = {
        title: String(raw.title),
        description: String(raw.description),
        teamId,
        userId: String(raw.userId),
        priority: String(raw.priority),
        acceptanceDurationMinutes: Number(raw.acceptanceDurationMinutes),
        executionDurationMinutes: Number(raw.executionDurationMinutes),
        initialAttachmentIds: attachmentIds,
        ...(raw.reason ? { reason: String(raw.reason) } : {}),
      };
      const response = await request('/tasks', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível criar a tarefa.');
      navigate(`/kanban/tarefas/${json.data.task.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar tarefa.');
      submitted.current = false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="text-sm font-bold text-brand-700">Nova tarefa</p>
      <h1 className="mt-1 text-3xl font-extrabold">Criar e encaminhar tarefa</h1>
      {user.role.code === 'ADMIN_MASTER' && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-warning">Criação excepcional habilitada somente neste ambiente de testes. A ação será registrada na auditoria.</p>}
      <form onSubmit={submit} className="mt-7 space-y-5 rounded-2xl border border-border bg-white p-5 sm:p-7">
        {user.role.code === 'ADMIN_MASTER' && (
          <Field label="Justificativa administrativa">
            <textarea aria-label="Justificativa administrativa" name="reason" required minLength={5} maxLength={2000} placeholder="Informe o motivo da intervenção do ADMIN MASTER" className="field" />
          </Field>
        )}
        <Field label="Título">
          <input aria-label="Título" name="title" required minLength={3} maxLength={255} className="field" />
        </Field>
        <Field label="Descrição">
          <textarea aria-label="Descrição" name="description" required minLength={3} rows={5} className="field" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Equipe">
            <select aria-label="Equipe" name="teamId" required className="field" onChange={(event) => { setSelectedTeamId(event.target.value); setStagedFiles([]); setUploadProgress({}); }}>
              <option value="">Selecione</option>
              {teams.filter((team) => team.isActive).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}
            </select>
          </Field>
          <Field label="Responsável">
            <select aria-label="Responsável" name="userId" required className="field">
              <option value="">Selecione</option>
              {eligibleUsers(selectedTeamId).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.role.label}</option>)}
            </select>
          </Field>
          <Field label="Prioridade">
            <select aria-label="Prioridade" name="priority" defaultValue="NORMAL" className="field">
              <option value="LOW">Baixa</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </select>
          </Field>
          <Field label="Prazo para aceite">
            <select aria-label="Prazo para aceite" name="acceptanceDurationMinutes" defaultValue="240" className="field">
              {acceptanceOptions.map(([value, label]) => <option key={value} value={String(value)}>{label}</option>)}
            </select>
          </Field>
          <Field label="Prazo de execução">
            <select aria-label="Prazo de execução" name="executionDurationMinutes" defaultValue="1440" className="field">
              {executionOptions.map(([value, label]) => <option key={value} value={String(value)}>{label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Anexos iniciais (opcional)">
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 font-normal text-sm hover:bg-brand-50 focus-within:ring-2 focus-within:ring-brand-700">
              <span>Selecionar arquivos</span>
              <input className="sr-only" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx" onChange={selectFiles} disabled={busy} />
            </label>
            <p className="text-xs text-muted">JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX. Sem limite fixo de quantidade ou tamanho.</p>
          </div>
          {stagedFiles.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {stagedFiles.map((staged) => (
                <article key={staged.id} className="overflow-hidden rounded-xl border border-border bg-white p-2">
                  <div className="flex items-center gap-2"><span className="text-xs font-bold truncate">{staged.originalName}</span>{uploadProgress[staged.id] != null && <span className="text-xs text-muted">({uploadProgress[staged.id]}%)</span>}</div>
                  <button type="button" onClick={() => removeStaged(staged.id)} className="mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-danger"><span>Remover</span></button>
                </article>
              ))}
            </div>
          )}
        </Field>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
        <button disabled={busy} className="action-primary"><span>Criar e encaminhar tarefa</span></button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <div className="mt-2 [&>*]:min-h-11 [&>*]:w-full [&>*]:rounded-xl [&>*]:border [&>*]:border-border [&>*]:px-3 [&>*]:py-2 [&>*]:font-normal [&>*]:outline-none focus-within:[&>*]:ring-2 focus-within:[&>*]:ring-brand-700">{children}</div>
    </label>
  );
}

/* eslint-disable react-hooks/set-state-in-effect */
import {
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';

type Team = { id: string; name: string; isActive: boolean };
type User = {
  id: string;
  name: string;
  isActive: boolean;
  role: { code: string; label?: string };
};
export type StagedFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  file: File;
  uploadedId?: string;
};

const acceptanceOptions = [
  [60, '1 hora'],
  [120, '2 horas'],
  [240, '4 horas'],
  [480, '8 horas'],
  [720, '12 horas'],
  [1440, '24 horas'],
];
const executionOptions = [
  [720, 'Meio dia (12 horas)'],
  [1440, '1 dia (24 horas)'],
  [2880, '2 dias'],
  [4320, '3 dias'],
  [7200, '5 dias'],
];
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx'];
const extensionOf = (name: string) => `.${name.split('.').pop()?.toLowerCase() ?? ''}`;

export const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export interface TaskCreateFormProps {
  onSuccess: (task: any) => void;
  onCancel?: () => void;
  isModal?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function TaskCreateForm({
  onSuccess,
  onCancel,
  isModal = false,
  onBusyChange,
}: TaskCreateFormProps) {
  const { request, upload, user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [hasSigadoc, setHasSigadoc] = useState(false);
  const [sigadocNumber, setSigadocNumber] = useState('');
  const [sigadocLink, setSigadocLink] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const submitted = useRef(false);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const loadOptions = useCallback(async () => {
    try {
      const [teamResponse, userResponse] = await Promise.all([
        request('/teams'),
        request('/users'),
      ]);
      const teamBody: any = await teamResponse.json();
      const userBody: any = await userResponse.json();
      setTeams(teamBody.data?.teams ?? []);
      setAllUsers(userBody.data?.users ?? []);
    } catch {
      setError('Não foi possível carregar os dados do formulário.');
    }
  }, [request]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const eligibleUsers = (teamId: string) =>
    allUsers.filter((item) => item.isActive && (!teamId || true));

  const selectFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) return;

    // 1. Validação de formato/extensão permitida
    const invalid = selected.find(
      (file) => !allowedExtensions.includes(extensionOf(file.name)),
    );
    if (invalid) {
      setError(
        `Formato não permitido: "${invalid.name}". Use JPG, JPEG, PNG, WEBP, PDF, DOC ou DOCX.`,
      );
      event.target.value = '';
      return;
    }

    // 2. Validação de limite de tamanho (máximo 50 MB por anexo)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    const oversized = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      setError(
        `O arquivo "${oversized.name}" (${formatBytes(oversized.size)}) excede o limite máximo de 50 MB.`,
      );
      event.target.value = '';
      return;
    }

    setError('');
    // 3. Deduplicação inteligente de arquivos já selecionados
    setStagedFiles((current) => {
      const fileKey = (name: string, size: number) => `${name}::${size}`;
      const existingKeys = new Set(current.map((item) => fileKey(item.originalName, item.sizeBytes)));
      const novel = selected.filter((file) => !existingKeys.has(fileKey(file.name, file.size)));
      if (novel.length === 0) return current;

      return [
        ...current,
        ...novel.map((file) => ({
          id: crypto.randomUUID(),
          originalName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          file,
        })),
      ];
    });
    event.target.value = '';
  };

  const removeStaged = (id: string) => {
    setStagedFiles((current) => current.filter((item) => item.id !== id));
  };

  const sendStaged = async () => {
    if (stagedFiles.length === 0) return [];
    setBusy(true);
    setError('');
    const ids: string[] = [];

    for (const staged of stagedFiles) {
      if (staged.uploadedId) {
        ids.push(staged.uploadedId);
        continue;
      }
      try {
        const form = new FormData();
        form.append('attachment', staged.file);
        const response = await upload('/task-uploads/staged', form, {
          headers: { 'idempotency-key': crypto.randomUUID() },
          onProgress: (value) =>
            setUploadProgress((current) => ({ ...current, [staged.id]: value })),
        });
        const json: any = await response.json();
        if (!response.ok) {
          throw new Error(
            json.error?.message ?? `Falha ao processar anexo "${staged.originalName}".`,
          );
        }
        staged.uploadedId = json.data.id;
        ids.push(json.data.id);
      } catch (cause: any) {
        const message = `Não foi possível enviar o anexo "${staged.originalName}": ${
          cause.message || 'Erro desconhecido.'
        }`;
        setError(message);
        throw new Error(message);
      }
    }

    setUploadProgress({});
    return ids;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitted.current || busy) return;
    submitted.current = true;
    setBusy(true);
    setError('');

    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const teamId = String(raw.teamId);
    const responsibleUsers = eligibleUsers(teamId);
    const responsible = responsibleUsers.find((item) => item.id === String(raw.userId));
    if (!responsible) {
      setError('Responsável inválido para a equipe selecionada.');
      submitted.current = false;
      setBusy(false);
      return;
    }

    if (hasSigadoc) {
      const trimmedNumber = sigadocNumber.trim();
      const trimmedLink = sigadocLink.trim();
      if (!trimmedNumber) {
        setError('Informe o número do processo SIGADOC.');
        submitted.current = false;
        setBusy(false);
        return;
      }
      let isValidUrl = false;
      try {
        const parsed = new URL(trimmedLink);
        isValidUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        isValidUrl = false;
      }
      if (!isValidUrl) {
        setError('O link do processo SIGADOC deve ser uma URL válida com protocolo HTTP ou HTTPS.');
        submitted.current = false;
        setBusy(false);
        return;
      }
    }

    try {
      // 1. Upload temporário em staging dos arquivos anexados (se houver)
      const attachmentIds = await sendStaged();

      // 2. Criação da tarefa vinculando os anexos via transaction
      const body = {
        title: String(raw.title),
        description: String(raw.description),
        teamId,
        userId: String(raw.userId),
        priority: String(raw.priority),
        acceptanceDurationMinutes: Number(raw.acceptanceDurationMinutes),
        executionDurationMinutes: Number(raw.executionDurationMinutes),
        initialAttachmentIds: attachmentIds,
        ...(hasSigadoc
          ? {
              sigadocProcessNumber: sigadocNumber.trim(),
              sigadocProcessLink: sigadocLink.trim(),
            }
          : {}),
        ...(raw.reason ? { reason: String(raw.reason) } : {}),
      };

      const response = await request('/tasks', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error?.message ?? 'Não foi possível criar a tarefa.');
      }

      onSuccess(json.data.task);
    } catch (cause: any) {
      setError(cause.message || 'Falha ao criar tarefa.');
      submitted.current = false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className={`space-y-4 ${
        isModal ? '' : 'mt-7 rounded-2xl border border-border bg-white p-5 sm:p-7'
      }`}
    >
      {user.role.code === 'ADMIN_MASTER' && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-xs sm:text-sm font-semibold text-warning"
        >
          Criação excepcional habilitada somente neste ambiente de testes. A ação será registrada na
          auditoria.
        </p>
      )}

      {user.role.code === 'ADMIN_MASTER' && (
        <FormField label="Justificativa administrativa">
          <textarea
            aria-label="Justificativa administrativa"
            name="reason"
            required
            minLength={5}
            maxLength={2000}
            placeholder="Informe o motivo da intervenção do ADMIN MASTER"
            className="field"
          />
        </FormField>
      )}

      <FormField label="Título">
        <input
          aria-label="Título"
          name="title"
          required
          minLength={3}
          maxLength={255}
          placeholder="Título descritivo da tarefa"
          className="field"
        />
      </FormField>

      <FormField label="Descrição">
        <textarea
          aria-label="Descrição"
          name="description"
          required
          minLength={3}
          rows={3}
          placeholder="Descreva com detalhes o objetivo e entregas esperadas"
          className="field"
        />
      </FormField>

      {/* ======================================================== */}
      {/* SEÇÃO COMPACTA DE VÍNCULO COM O SIGADOC                  */}
      {/* ======================================================== */}
      <div className="rounded-xl border border-border/80 bg-slate-50/50 p-3 space-y-2.5">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hasSigadoc}
            onChange={(e) => {
              setHasSigadoc(e.target.checked);
              if (!e.target.checked) {
                setSigadocNumber('');
                setSigadocLink('');
              }
            }}
            className="size-4 rounded border-border text-brand-700 focus:ring-brand-700"
            aria-label="Vincular processo do SIGADOC"
          />
          <div className="flex items-center gap-1.5 text-xs font-bold text-text">
            <Link2 size={14} className="text-brand-700" />
            <span>Vincular processo do SIGADOC</span>
          </div>
        </label>

        {hasSigadoc && (
          <div className="pt-1 grid grid-cols-1 gap-2.5 sm:grid-cols-2 animate-in fade-in duration-150">
            <FormField label="Número do processo SIGADOC">
              <input
                aria-label="Número do processo SIGADOC"
                name="sigadocProcessNumber"
                value={sigadocNumber}
                onChange={(e) => setSigadocNumber(e.target.value)}
                required={hasSigadoc}
                maxLength={128}
                placeholder="Informe o número do processo"
                className="field text-xs"
                disabled={busy}
              />
            </FormField>

            <FormField label="Link do processo SIGADOC">
              <input
                aria-label="Link do processo SIGADOC"
                type="url"
                name="sigadocProcessLink"
                value={sigadocLink}
                onChange={(e) => setSigadocLink(e.target.value)}
                required={hasSigadoc}
                maxLength={2048}
                placeholder="https://..."
                className="field text-xs"
                disabled={busy}
              />
            </FormField>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* SEÇÃO COMPACTA E DISCRETA DE ANEXOS                       */}
      {/* ======================================================== */}
      <div className="space-y-2 rounded-xl border border-border/80 bg-slate-50/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            <Paperclip size={14} className="text-brand-700" />
            <span>Anexos</span>
            <span className="text-[11px] font-normal text-muted lowercase">(opcional)</span>
          </div>

          <label className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer select-none">
            <Plus size={13} />
            <span>Adicionar arquivos</span>
            <input
              aria-label="Adicionar arquivos"
              className="sr-only"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
              onChange={selectFiles}
              disabled={busy}
            />
          </label>
        </div>

        {stagedFiles.length === 0 ? (
          <p className="text-[11px] text-muted">
            Nenhum arquivo anexado. Formatos suportados: JPG, PNG, WEBP, PDF, DOC, DOCX.
          </p>
        ) : (
          <div className="space-y-1.5 pt-1">
            {stagedFiles.map((staged) => (
              <div
                key={staged.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-white px-2.5 py-1.5 text-xs shadow-2xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={15} className="text-brand-700 shrink-0" />
                  <span
                    className="font-medium text-text truncate max-w-[200px] sm:max-w-xs"
                    title={staged.originalName}
                  >
                    {staged.originalName}
                  </span>
                  <span className="text-[11px] text-muted shrink-0">
                    ({formatBytes(staged.sizeBytes)})
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {uploadProgress[staged.id] != null && uploadProgress[staged.id] < 100 && (
                    <span className="text-[11px] font-semibold text-brand-700">
                      {uploadProgress[staged.id]}%
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeStaged(staged.id)}
                    aria-label={`Remover ${staged.originalName}`}
                    className="text-muted hover:text-danger transition-colors p-0.5 rounded cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Equipe">
          <select
            aria-label="Equipe"
            name="teamId"
            required
            className="field"
            onChange={(event) => {
              setSelectedTeamId(event.target.value);
            }}
          >
            <option value="">Selecione a equipe</option>
            {teams
              .filter((team) => team.isActive)
              .map((team) => (
                <option value={team.id} key={team.id}>
                  {team.name}
                </option>
              ))}
          </select>
        </FormField>

        <FormField label="Responsável">
          <select aria-label="Responsável" name="userId" required className="field">
            <option value="">Selecione o responsável</option>
            {eligibleUsers(selectedTeamId).map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {item.role.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Prioridade">
          <select
            aria-label="Prioridade"
            name="priority"
            defaultValue="NORMAL"
            className="field"
          >
            <option value="LOW">Baixa</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
        </FormField>

        <FormField label="Prazo para aceite">
          <select
            aria-label="Prazo para aceite"
            name="acceptanceDurationMinutes"
            defaultValue="240"
            className="field"
          >
            {acceptanceOptions.map(([value, label]) => (
              <option key={value} value={String(value)}>
                {label}
              </option>
            ))}
          </select>
        </FormField>

        <div className="sm:col-span-2">
          <FormField label="Prazo de execução">
            <select
              aria-label="Prazo de execução"
              name="executionDurationMinutes"
              defaultValue="1440"
              className="field"
            >
              {executionOptions.map(([value, label]) => (
                <option key={value} value={String(value)}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-danger border border-red-200"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-border">
        {onCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="action-secondary text-xs sm:text-sm"
          >
            Voltar
          </button>
        )}
        <button
          disabled={busy}
          className="action-primary text-xs sm:text-sm"
          aria-label="Criar tarefa"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          <span>Criar tarefa</span>
        </button>
      </div>
    </form>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs sm:text-sm font-bold text-text">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: (task: any) => void;
  triggerElement?: HTMLElement | null;
}

export function TaskCreateModal({
  isOpen,
  onClose,
  onTaskCreated,
  triggerElement,
}: TaskCreateModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Foco inicial no primeiro campo ao abrir
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (modalRef.current) {
        const firstInput = modalRef.current.querySelector<HTMLElement>(
          'input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
        );
        firstInput?.focus();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen]);

  // Retorno de foco ao gatilho quando o modal fecha
  useEffect(() => {
    return () => {
      if (triggerElement && typeof triggerElement.focus === 'function') {
        triggerElement.focus();
      }
    };
  }, [triggerElement]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!isSubmitting) {
          onClose();
        }
        return;
      }
      if (event.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (!isSubmitting && e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-modal-title"
        tabIndex={-1}
        className="relative flex flex-col w-full max-w-[540px] max-h-[90vh] rounded-2xl border border-border bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-left"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-white/95">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
              <Plus size={18} />
            </div>
            <div>
              <h2 id="create-task-modal-title" className="text-base font-extrabold text-text">
                Nova tarefa
              </h2>
              <p className="text-xs text-muted">Criar e encaminhar tarefa</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            aria-label="Fechar criação de tarefa"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-brand-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo com rolagem interna */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <TaskCreateForm
            isModal
            onSuccess={onTaskCreated}
            onCancel={onClose}
            onBusyChange={setIsSubmitting}
          />
        </div>
      </div>
    </div>
  );
}

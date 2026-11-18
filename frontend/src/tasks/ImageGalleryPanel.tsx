import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  Image as ImageIcon,
  ImagePlus,
  LoaderCircle,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthContext.tsx';

const MAX_BYTES = 10 * 1024 * 1024;
const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
const idempotencyKey = () => crypto.randomUUID();
const extension = (name: string) => `.${name.split('.').pop()?.toLowerCase() ?? ''}`;

export interface ImageGalleryPanelProps {
  taskId: string;
  cycleVersion: number;
  initialExpanded?: boolean;
}

export function ImageGalleryPanel({
  taskId,
  cycleVersion,
  initialExpanded = false,
}: ImageGalleryPanelProps) {
  const { request, upload } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [permissions, setPermissions] = useState({ canUpload: false, maxActiveImages: 10 });
  const [files, setFiles] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<any>(null);
  const [removing, setRemoving] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [isOpen, setIsOpen] = useState(initialExpanded);

  const objectUrls = useRef<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const activeCurrent = useMemo(
    () => items.filter((item) => item.isCurrentCycle).length,
    [items],
  );

  const currentIndex = items.findIndex((i) => i.id === expanded?.id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < items.length - 1;

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setExpanded(items[currentIndex - 1]);
    }
  }, [currentIndex, items]);

  const goToNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < items.length - 1) {
      setExpanded(items[currentIndex + 1]);
    }
  }, [currentIndex, items]);

  useEffect(() => {
    if (!expanded && !removing) return;
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = (): HTMLElement[] =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), textarea, a[href], [tabindex="0"]',
        ),
      );

    focusable()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(null);
        setRemoving(null);
        return;
      }
      if (expanded) {
        if (event.key === 'ArrowLeft' && hasPrevious) {
          event.preventDefault();
          goToPrevious();
          return;
        }
        if (event.key === 'ArrowRight' && hasNext) {
          event.preventDefault();
          goToNext();
          return;
        }
      }
      if (event.key !== 'Tab') return;
      const focusableItems = focusable();
      if (focusableItems.length === 0) return;
      if (event.shiftKey && document.activeElement === focusableItems[0]) {
        event.preventDefault();
        focusableItems[focusableItems.length - 1]?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === focusableItems[focusableItems.length - 1]
      ) {
        event.preventDefault();
        focusableItems[0]?.focus();
      }
    };

    dialog.addEventListener('keydown', onKey);
    return () => {
      dialog.removeEventListener('keydown', onKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [expanded, removing, hasPrevious, hasNext, goToPrevious, goToNext]);

  const load = useCallback(async () => {
    const previousUrls = [...objectUrls.current];
    const response = await request(`/tasks/${taskId}/images`);
    const json = await response.json();
    if (!response.ok) throw new Error(messageFrom(json, 'Não foi possível carregar as imagens.'));
    const loaded = await Promise.all(
      json.data.images.map(async (image: any) => {
        const content = await request(`/images/${image.id}/content`);
        if (!content.ok) return image;
        const url = URL.createObjectURL(await content.blob());
        objectUrls.current.add(url);
        return { ...image, url };
      }),
    );
    previousUrls.forEach((url) => {
      URL.revokeObjectURL(url);
      objectUrls.current.delete(url);
    });
    setItems(loaded);
    setPermissions(json.data.permissions);
  }, [request, taskId]);

  useEffect(() => {
    const urls = objectUrls.current;
    load().catch((error) => setMessage(error.message));
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [load, cycleVersion]);

  useEffect(
    () => () => files.forEach((file) => URL.revokeObjectURL(file.preview)),
    [files],
  );

  const selectFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const remaining = permissions.maxActiveImages - activeCurrent;
    const invalid = selected.find(
      (file) => !allowed.includes(extension(file.name)) || file.size > MAX_BYTES,
    );
    if (invalid) {
      setMessage('Use somente JPG, JPEG, PNG ou WEBP, com até 10 MB por imagem.');
      event.target.value = '';
      return;
    }
    if (selected.length > remaining) {
      setMessage(`Este ciclo permite mais ${remaining} imagem(ns) ativa(s).`);
      event.target.value = '';
      return;
    }
    files.forEach((file) => URL.revokeObjectURL(file.preview));
    setFiles(selected.map((file) => ({ file, preview: URL.createObjectURL(file) })));
    setMessage('');
  };

  const sendFiles = async () => {
    setBusy(true);
    setMessage('');
    try {
      for (const selected of files) {
        const form = new FormData();
        form.append('image', selected.file);
        form.append('expectedVersion', String(cycleVersion));
        const response = await upload(`/tasks/${taskId}/images`, form, {
          headers: { 'idempotency-key': idempotencyKey() },
          onProgress: (value: number) =>
            setProgress((current) => ({ ...current, [selected.file.name]: value })),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(messageFrom(json, 'Não foi possível enviar a imagem.'));
      }
      files.forEach((file) => URL.revokeObjectURL(file.preview));
      setFiles([]);
      setProgress({});
      setMessage('Imagens enviadas com segurança.');
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoval = async () => {
    if (reason.trim().length < 5) return;
    setBusy(true);
    try {
      const response = await request(`/images/${removing.id}`, {
        method: 'DELETE',
        headers: { 'idempotency-key': idempotencyKey() },
        body: JSON.stringify({ expectedVersion: cycleVersion, reason }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(messageFrom(json, 'Não foi possível remover a imagem.'));
      setRemoving(null);
      setReason('');
      setMessage('Imagem removida do ciclo. O histórico foi preservado.');
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-border bg-white p-3.5 sm:p-4 shadow-2xs"
      aria-labelledby="task-images-title"
    >
      {/* Cabeçalho compacto alinhado com "Anexos da tarefa" e "Percurso" */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen((prev) => !prev);
            }
          }}
          className="flex items-center gap-2 cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-brand-700 rounded-lg p-0.5"
        >
          <ImageIcon size={17} className="text-brand-700 shrink-0" />
          <h3 id="task-images-title" className="text-sm font-extrabold text-text">
            Imagens da tarefa ({items.length})
          </h3>
          {permissions.maxActiveImages > 0 && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 border border-brand-200">
              {activeCurrent}/{permissions.maxActiveImages} no ciclo
            </span>
          )}
        </div>

        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="task-images-content"
          aria-label={isOpen ? 'Recolher imagens da tarefa' : 'Expandir imagens da tarefa'}
          onClick={() => setIsOpen((prev) => !prev)}
          className="text-xs font-semibold text-brand-700 hover:text-brand-900 inline-flex items-center gap-1 cursor-pointer select-none"
        >
          <span>{isOpen ? 'Recolher' : 'Expandir'}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Conteúdo exibido apenas quando expandido */}
      {isOpen && (
        <div id="task-images-content" className="mt-3 space-y-3 animate-in fade-in duration-150">
          <p className="text-xs text-muted">Evidências protegidas e vinculadas ao ciclo de execução.</p>

          {permissions.canUpload && (
            <div className="rounded-xl border border-dashed border-brand-700 bg-brand-100/40 p-3.5">
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-brand-700 shadow-2xs focus-within:ring-2 focus-within:ring-brand-700 hover:bg-brand-50 transition-colors">
                <ImagePlus size={16} />
                <span>Selecionar imagens</span>
                <input
                  className="sr-only"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  multiple
                  onChange={selectFiles}
                  disabled={busy}
                />
              </label>
              <p className="mt-1.5 text-[11px] text-muted">
                Formatos aceitos: JPG, JPEG, PNG ou WEBP. Até 10 MB por arquivo.
              </p>

              {files.length > 0 && (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                    {files.map(({ file, preview }) => (
                      <article
                        key={`${file.name}-${file.lastModified}`}
                        className="overflow-hidden rounded-xl border border-border bg-white shadow-2xs"
                      >
                        <img
                          src={preview}
                          alt={`Pré-visualização de ${file.name}`}
                          className="aspect-square w-full object-cover"
                        />
                        <div className="p-2">
                          <p className="truncate text-xs font-bold">{file.name}</p>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-100">
                            <div
                              className="h-full bg-brand-700 transition-all"
                              style={{ width: `${progress[file.name] ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={sendFiles}
                    className="action-primary mt-3 text-xs"
                  >
                    {busy ? (
                      <LoaderCircle className="animate-spin" size={15} />
                    ) : (
                      <Upload size={15} />
                    )}
                    <span>Enviar {files.length} imagem(ns)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {message && (
            <p role="status" className="rounded-xl bg-brand-100 p-2.5 text-xs font-semibold text-brand-900">
              {message}
            </p>
          )}

          {items.length === 0 ? (
            <p className="rounded-xl bg-slate-50/70 p-3 text-center text-xs text-muted border border-border/60">
              Nenhuma imagem anexada.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-border bg-white shadow-2xs flex flex-col justify-between"
                >
                  <button
                    type="button"
                    onClick={() => item.url && setExpanded(item)}
                    className="group relative block w-full focus-visible:outline-2 focus-visible:outline-brand-700"
                    disabled={!item.url}
                  >
                    <div className="aspect-square bg-slate-100">
                      {item.url ? (
                        <img
                          src={item.url}
                          alt={`Imagem enviada por ${item.uploadedBy.name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-xs text-muted">
                          Indisponível
                        </div>
                      )}
                    </div>
                    <span className="absolute inset-0 hidden place-items-center bg-brand-900/65 text-white group-hover:grid group-focus:grid transition-all">
                      <Eye size={22} />
                      <span className="sr-only">Ampliar imagem</span>
                    </span>
                  </button>

                  <div className="p-2.5">
                    <p className="truncate text-xs font-bold text-text">{item.uploadedBy.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      Ciclo {item.cycleNumber} · {new Date(item.createdAt).toLocaleString('pt-BR')}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-1 border-t border-border/70 pt-1.5">
                      {item.url && (
                        <a
                          href={item.url}
                          download={item.originalName || `imagem-${item.id}.jpg`}
                          aria-label={`Baixar imagem enviada por ${item.uploadedBy.name}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-900 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download size={13} />
                          <span>Baixar</span>
                        </a>
                      )}
                      {item.canDelete && (
                        <button
                          type="button"
                          onClick={() => setRemoving(item)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-danger hover:text-red-700 transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>Remover</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Visualização ampliada com navegação e download */}
      {expanded && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Visualização ampliada"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/85 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setExpanded(null)}
        >
          <div className="relative flex flex-col items-center max-w-full max-h-full">
            <div className="absolute top-2 right-2 sm:-top-10 sm:right-0 flex items-center gap-2 z-10">
              {expanded.url && (
                <a
                  href={expanded.url}
                  download={expanded.originalName || `imagem-${expanded.id}.jpg`}
                  aria-label="Baixar imagem ampliada"
                  className="grid size-9 place-items-center rounded-full bg-white/90 text-brand-900 shadow-md hover:bg-white transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={18} />
                </a>
              )}
              <button
                type="button"
                className="grid size-9 place-items-center rounded-full bg-white/90 text-brand-900 shadow-md hover:bg-white transition-colors cursor-pointer"
                onClick={() => setExpanded(null)}
              >
                <X size={18} />
                <span className="sr-only">Fechar</span>
              </button>
            </div>

            {hasPrevious && (
              <button
                type="button"
                aria-label="Imagem anterior"
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrevious();
                }}
                className="absolute left-2 sm:-left-12 top-1/2 -translate-y-1/2 grid size-10 place-items-center rounded-full bg-white/90 text-brand-900 shadow-md hover:bg-white transition-colors cursor-pointer z-10"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            {hasNext && (
              <button
                type="button"
                aria-label="Próxima imagem"
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-2 sm:-right-12 top-1/2 -translate-y-1/2 grid size-10 place-items-center rounded-full bg-white/90 text-brand-900 shadow-md hover:bg-white transition-colors cursor-pointer z-10"
              >
                <ChevronRight size={22} />
              </button>
            )}

            <img
              src={expanded.url}
              alt={`Imagem enviada por ${expanded.uploadedBy.name}`}
              className="max-h-[82vh] max-w-full rounded-xl object-contain shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />

            <div
              className="mt-2 rounded-lg bg-black/60 px-3 py-1 text-center text-xs text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <span>{expanded.uploadedBy.name}</span>
              <span className="mx-1.5">•</span>
              <span>{currentIndex + 1} de {items.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up de confirmação de remoção */}
      {removing && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-image-title"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl">
            <h3 id="remove-image-title" className="text-base font-extrabold text-text">
              Remover esta imagem?
            </h3>
            <p className="mt-1 text-xs text-muted">
              Ela deixará de aparecer na galeria, mas o arquivo e a auditoria serão preservados.
            </p>
            <label className="block text-xs font-bold text-muted mt-3">
              Justificativa obrigatória (mínimo 5 caracteres)
              <textarea
                className="field mt-1 text-xs"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={5}
                rows={3}
                placeholder="Informe a justificativa da remoção..."
                aria-label="Justificativa da remoção"
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="action-secondary"
                onClick={() => {
                  setRemoving(null);
                  setReason('');
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="action-danger"
                disabled={busy || reason.trim().length < 5}
                onClick={confirmRemoval}
              >
                <Trash2 size={16} />
                Confirmar remoção
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function messageFrom(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback;
  const error = (value as { error?: { message?: unknown } }).error;
  return typeof error?.message === 'string' ? error.message : fallback;
}

import { Eye, ImagePlus, LoaderCircle, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../auth/AuthContext.jsx';

const MAX_BYTES = 10 * 1024 * 1024;
const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
const idempotencyKey = () => crypto.randomUUID();
const extension = (name) => `.${name.split('.').pop()?.toLowerCase()}`;

export function ImageGalleryPanel({ taskId, cycleVersion }) {
  const { request, upload } = useAuth();
  const [items, setItems] = useState([]);
  const [permissions, setPermissions] = useState({ canUpload: false, maxActiveImages: 10 });
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [reason, setReason] = useState('');
  const objectUrls = useRef(new Set());
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!expanded && !removing) return;
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled), textarea, [tabindex="0"]')];
    focusable()[0]?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { setExpanded(null); setRemoving(null); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    };
    dialog.addEventListener('keydown', onKey);
    return () => { dialog.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [expanded, removing]);

  const load = useCallback(async () => {
    const previousUrls = [...objectUrls.current];
    const response = await request(`/tasks/${taskId}/images`);
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível carregar as imagens.');
    const loaded = await Promise.all(json.data.images.map(async (image) => {
      const content = await request(`/images/${image.id}/content`);
      if (!content.ok) return image;
      const url = URL.createObjectURL(await content.blob());
      objectUrls.current.add(url);
      return { ...image, url };
    }));
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

  useEffect(() => () => files.forEach((file) => URL.revokeObjectURL(file.preview)), [files]);

  const activeCurrent = useMemo(
    () => items.filter((item) => item.isCurrentCycle).length,
    [items],
  );

  const selectFiles = (event) => {
    const selected = [...event.target.files];
    const remaining = permissions.maxActiveImages - activeCurrent;
    const invalid = selected.find((file) => !allowed.includes(extension(file.name)) || file.size > MAX_BYTES);
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
          onProgress: (value) => setProgress((current) => ({ ...current, [selected.file.name]: value })),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível enviar a imagem.');
      }
      files.forEach((file) => URL.revokeObjectURL(file.preview));
      setFiles([]);
      setProgress({});
      setMessage('Imagens enviadas com segurança.');
      await load();
    } catch (error) {
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
      if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível remover a imagem.');
      setRemoving(null);
      setReason('');
      setMessage('Imagem removida do ciclo. O histórico foi preservado.');
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="mt-7 rounded-2xl border border-border bg-white p-5 sm:p-6" aria-labelledby="task-images-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="task-images-title" className="text-xl font-extrabold">Imagens da tarefa</h2><p className="mt-1 text-sm text-muted">Evidências protegidas e vinculadas ao ciclo de execução.</p></div>
      <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-900">{activeCurrent}/{permissions.maxActiveImages} no ciclo atual</span>
    </div>

    {permissions.canUpload && <div className="mt-5 rounded-xl border border-dashed border-brand-700 bg-brand-100/40 p-4">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 font-bold text-brand-700 shadow-sm focus-within:ring-2 focus-within:ring-brand-700">
        <ImagePlus size={19} />Selecionar imagens
        <input className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp" multiple onChange={selectFiles} disabled={busy} />
      </label>
      <p className="mt-2 text-xs text-muted">JPG, JPEG, PNG ou WEBP. Até 10 MB por arquivo.</p>
      {files.length > 0 && <div className="mt-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">{files.map(({ file, preview }) => <article key={`${file.name}-${file.lastModified}`} className="overflow-hidden rounded-xl border border-border bg-white"><img src={preview} alt={`Pré-visualização de ${file.name}`} className="aspect-square w-full object-cover" /><div className="p-2"><p className="truncate text-xs font-bold">{file.name}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100"><div className="h-full bg-brand-700 transition-all" style={{ width: `${progress[file.name] ?? 0}%` }} /></div></div></article>)}</div>
        <button type="button" disabled={busy} onClick={sendFiles} className="action-primary mt-4">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <Upload size={18} />}Enviar {files.length} imagem(ns)</button>
      </div>}
    </div>}

    {message && <p role="status" className="mt-4 rounded-xl bg-brand-100 p-3 text-sm font-semibold text-brand-900">{message}</p>}
    {items.length === 0 ? <p className="mt-5 rounded-xl bg-background p-5 text-center text-sm text-muted">Nenhuma imagem anexada.</p> : <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <button type="button" onClick={() => item.url && setExpanded(item)} className="group relative block w-full" disabled={!item.url}><div className="aspect-square bg-background">{item.url ? <img src={item.url} alt={`Imagem enviada por ${item.uploadedBy.name}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-sm text-muted">Indisponível</div>}</div><span className="absolute inset-0 hidden place-items-center bg-brand-900/65 text-white group-hover:grid group-focus:grid"><Eye size={24} /><span className="sr-only">Ampliar imagem</span></span></button>
      <div className="p-3"><p className="truncate text-sm font-bold">{item.uploadedBy.name}</p><p className="mt-1 text-xs text-muted">Ciclo {item.cycleNumber} · {new Date(item.createdAt).toLocaleString('pt-BR')}</p>{item.canDelete && <button type="button" onClick={() => setRemoving(item)} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-danger"><Trash2 size={17} />Remover</button>}</div>
    </article>)}</div>}

    {expanded && <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Visualização ampliada" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/85 p-4" onClick={() => setExpanded(null)}><button type="button" className="absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white text-brand-900" onClick={() => setExpanded(null)}><X /><span className="sr-only">Fechar</span></button><img src={expanded.url} alt={`Imagem enviada por ${expanded.uploadedBy.name}`} className="max-h-[85vh] max-w-full rounded-xl object-contain" onClick={(event) => event.stopPropagation()} /></div>}

    {removing && <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="remove-image-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h3 id="remove-image-title" className="text-lg font-extrabold">Remover esta imagem?</h3><p className="mt-2 text-sm text-muted">Ela deixará de aparecer na galeria, mas o arquivo e a auditoria serão preservados.</p><textarea className="field mt-4" value={reason} onChange={(event) => setReason(event.target.value)} minLength="5" placeholder="Justificativa obrigatória" aria-label="Justificativa da remoção" /><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="action-secondary" onClick={() => { setRemoving(null); setReason(''); }}>Cancelar</button><button type="button" className="action-danger" disabled={busy || reason.trim().length < 5} onClick={confirmRemoval}><Trash2 size={18} />Confirmar remoção</button></div></div></div>}
  </section>;
}

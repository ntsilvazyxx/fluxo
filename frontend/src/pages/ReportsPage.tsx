import { periodQuery } from '../tasks/period-query.ts';
import { ArrowUpDown, Download, FileSpreadsheet, FileText, Printer, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';

const statusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  AWAITING_ACCEPTANCE: 'Aguardando aceite',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const priorityLabel: Record<string, string> = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export function ReportsPage() {
  const { request } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 0, total: 0 });
  const [filters, setFilters] = useState<any>({
    page: 1,
    pageSize: 20,
    search: '',
    sortBy: 'openedAt',
    sortDirection: 'desc',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = periodQuery(filters);
      const response = await request(`/reports?${query}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? 'Não foi possível carregar o relatório.');
      setRows(json.data.rows);
      setMeta(json.data.meta);
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [filters, request]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((current: any) => ({ ...current, page: 1, [event.target.name]: event.target.value }));

  const sort = (sortBy: string) =>
    setFilters((current: any) => ({
      ...current,
      page: 1,
      sortBy,
      sortDirection: current.sortBy === sortBy && current.sortDirection === 'desc' ? 'asc' : 'desc',
    }));

  const exportExcel = async () => {
    setExporting(true);
    setError('');
    try {
      const query = periodQuery({ ...filters, page: undefined, pageSize: undefined });
      const response = await request(`/reports/export?${query}`);
      if (!response.ok) throw new Error('Não foi possível gerar a planilha de exportação.');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-tarefas-seaf-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const headings = [
    ['publicNumber', 'Nº'],
    ['openedAt', 'Tarefa'],
    ['priority', 'Prioridade'],
    ['deadlineAt', 'Prazo'],
    ['status', 'Status'],
  ];

  const emitDate = new Date().toLocaleString('pt-BR');

  return (
    <div className="space-y-6">
      {/* Cabeçalho Institucional de Impressão (visível apenas na impressão) */}
      <div className="hidden print:block mb-6 border-b-2 border-brand-900 pb-4">
        <h2 className="text-xl font-extrabold text-brand-900">
          SEAF — Secretaria de Estado de Agricultura Familiar
        </h2>
        <p className="text-xs text-slate-600">Governo do Estado de Mato Grosso</p>
        <p className="mt-2 text-sm font-bold text-text">
          Relatório de Tarefas — Emitido em: {emitDate} ({meta.total || rows.length} registros)
        </p>
      </div>

      {/* Cabeçalho de Tela (oculto na impressão) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <p className="seaf-eyebrow text-brand-700">Visão gerencial</p>
          <h1 className="mt-1 seaf-page-title text-text">Relatório de tarefas</h1>
          <p className="mt-1 seaf-page-description text-muted">
            Consulta consolidada de tarefas dentro do seu escopo, com filtros temporais e exportação.
          </p>
        </div>

        {/* Botões de Ação de Exportação */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={exportExcel}
            disabled={exporting || loading}
            className="action-secondary inline-flex items-center gap-1.5 text-xs font-bold py-2 px-3.5"
            title="Exportar dados formatados em planilha compatível com Microsoft Excel"
          >
            <FileSpreadsheet size={15} className="text-emerald-700" />
            {exporting ? 'Exportando…' : 'Exportar Excel'}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            className="action-secondary inline-flex items-center gap-1.5 text-xs font-bold py-2 px-3.5"
            title="Imprimir ou salvar em PDF"
          >
            <Printer size={15} className="text-brand-700" />
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Seção de Filtros (oculto na impressão) */}
      <section className="grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 print:hidden shadow-xs">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-3 text-muted" />
          <input
            aria-label="Buscar tarefas"
            name="search"
            className="field pl-9"
            placeholder="Número ou título"
            value={filters.search}
            onChange={update}
          />
        </label>

        <select className="field" aria-label="Status" name="status" onChange={update}>
          <option value="">Todos os status</option>
          {Object.entries(statusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select className="field" aria-label="Prioridade" name="priority" onChange={update}>
          <option value="">Todas as prioridades</option>
          {Object.entries(priorityLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <input
          className="field"
          type="date"
          name="periodStart"
          onChange={update}
          aria-label="Início do período"
        />

        <input
          className="field"
          type="date"
          name="periodEnd"
          onChange={update}
          aria-label="Fim do período"
        />
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-danger text-sm font-semibold">
          {error}
        </p>
      )}

      {/* Tabela de Dados */}
      <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-panel">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-border text-xs text-muted font-bold">
              <tr>
                {headings.map(([field, label]) => (
                  <th key={field} className="p-3.5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-bold text-text hover:text-brand-700"
                      onClick={() => sort(field)}
                    >
                      {label}
                      <ArrowUpDown size={12} className="opacity-60" />
                    </button>
                  </th>
                ))}
                <th className="p-3.5">Equipe / responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr className="hover:bg-slate-50/60 transition-colors" key={row.id}>
                  <td className="p-3.5 font-bold text-brand-800">#{row.publicNumber}</td>
                  <td className="p-3.5">
                    <Link
                      className="font-semibold text-brand-700 hover:underline block"
                      to={`/kanban/tarefas/${row.id}`}
                    >
                      {row.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      Aberta: {new Date(row.openedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </td>
                  <td className="p-3.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 font-semibold text-slate-700">
                      {priorityLabel[row.priority] ?? row.priority}
                    </span>
                  </td>
                  <td className={`p-3.5 text-xs ${row.overdue ? 'font-bold text-danger' : 'text-slate-700'}`}>
                    {row.deadlineAt ? new Date(row.deadlineAt).toLocaleString('pt-BR') : 'Sem prazo'}
                  </td>
                  <td className="p-3.5">
                    <span className="text-xs font-semibold">{statusLabel[row.status] ?? row.status}</span>
                  </td>
                  <td className="p-3.5 text-xs">
                    <p className="font-semibold text-text">{row.team?.name}</p>
                    <p className="text-muted">{row.responsible?.name ?? 'Não atribuído'}</p>
                  </td>
                </tr>
              ))}

              {!loading && !rows.length && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted">
                    <FileText className="mx-auto mb-2 opacity-40" size={32} />
                    Nenhuma tarefa encontrada no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {loading && <p className="text-sm text-muted">Carregando relatório…</p>}

      {/* Paginação (oculta na impressão) */}
      <div className="flex items-center justify-between print:hidden">
        <button
          type="button"
          className="action-secondary text-xs"
          disabled={meta.page <= 1 || loading}
          onClick={() => setFilters((current: any) => ({ ...current, page: current.page - 1 }))}
        >
          Anterior
        </button>
        <span className="text-xs font-semibold text-muted">
          Página {meta.page} de {meta.totalPages || 1} ({meta.total || rows.length} tarefas)
        </span>
        <button
          type="button"
          className="action-secondary text-xs"
          disabled={meta.page >= meta.totalPages || loading}
          onClick={() => setFilters((current: any) => ({ ...current, page: current.page + 1 }))}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

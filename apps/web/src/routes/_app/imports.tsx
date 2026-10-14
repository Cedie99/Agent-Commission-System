import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { ImportBatchView, ImportRowError, ImportType } from '@ocs/shared';
import { Peso, Qty, StatusBadge } from '@/components/app/format';
import { Button } from '@/components/ui/button';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Field, PageHeader, Select } from '@/components/ui/primitives';
import { api, download, type Paged } from '@/lib/api';
import { can } from '@/lib/auth';
import { cn, fmtDate, fmtDateTime } from '@/lib/utils';

export const Route = createFileRoute('/_app/imports')({ component: ImportsPage });

interface Mapping {
  id: string;
  name: string;
  importType: ImportType;
  isDefault: boolean;
}
interface StagedRow {
  rowNo: number;
  raw: Record<string, unknown>;
  parsed: Record<string, unknown> | null;
  errors: ImportRowError[];
  isDuplicate: boolean;
}

const BUSY = ['UPLOADED', 'VALIDATING'];

function ImportsPage() {
  const qc = useQueryClient();
  const canWrite = can('imports:write');
  const [type, setType] = useState<ImportType>('SALES');
  const [mappingId, setMappingId] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'errors' | 'duplicates' | 'valid'>('all');
  const [page, setPage] = useState(1);

  const mappings = useQuery({ queryKey: ['mappings', type], queryFn: () => api<Mapping[]>(`/settings/import-mappings?type=${type}`) });
  const history = useQuery({
    queryKey: ['imports'],
    queryFn: () => api<ImportBatchView[]>('/imports'),
    refetchInterval: (q) => (q.state.data?.some((b) => BUSY.includes(b.status)) ? 1000 : false),
  });
  const batch = useQuery({
    queryKey: ['import', selected],
    queryFn: () => api<ImportBatchView>(`/imports/${selected}`),
    enabled: !!selected,
    refetchInterval: (q) => (q.state.data && BUSY.includes(q.state.data.status) ? 800 : false),
  });
  const ready = batch.data && !BUSY.includes(batch.data.status);
  const rows = useQuery({
    queryKey: ['import-rows', selected, filter, page, batch.data?.status],
    queryFn: () => api<Paged<StagedRow>>(`/imports/${selected}/rows?filter=${filter}&page=${page}&pageSize=200`),
    enabled: !!selected && !!ready,
  });

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Choose a file first');
      const fd = new FormData();
      fd.append('type', type);
      if (mappingId) fd.append('mappingId', mappingId);
      fd.append('file', file);
      return api<ImportBatchView>('/imports', { method: 'POST', body: fd });
    },
    onSuccess: (b) => {
      setSelected(b.id);
      setFilter('all');
      setPage(1);
      if (fileRef.current) fileRef.current.value = '';
      void qc.invalidateQueries({ queryKey: ['imports'] });
    },
  });
  const action = useMutation({
    mutationFn: (a: 'commit' | 'discard') => api<ImportBatchView>(`/imports/${selected}/${a}`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['imports'] });
      void qc.invalidateQueries({ queryKey: ['import', selected] });
    },
  });

  const b = batch.data;
  const fieldsShown = b?.type === 'COLLECTIONS' ? COLLECTION_COLS : SALES_COLS;
  const rowColumns = useMemo<ColumnDef<StagedRow>[]>(
    () => [
      { header: 'Row', accessorKey: 'rowNo', meta: { numeric: true } },
      {
        header: 'Status',
        id: 'st',
        cell: ({ row }) =>
          row.original.errors.length ? <Badge tone="danger">Error</Badge> : row.original.isDuplicate ? <Badge tone="outline">Duplicate</Badge> : <Badge tone="success">OK</Badge>,
      },
      ...fieldsShown,
      {
        header: 'Problems / warnings',
        id: 'problems',
        cell: ({ row }) => {
          const msgs = [
            ...row.original.errors.map((e) => e.message),
            ...(row.original.isDuplicate && !row.original.errors.length ? ['Already imported — will be skipped'] : []),
          ];
          const warns = ((row.original.parsed?.warnings as string[] | undefined) ?? []).filter(Boolean);
          return (
            <div className="max-w-[420px] whitespace-normal">
              {msgs.map((m, i) => (
                <div key={i} className="text-destructive">
                  {m}
                </div>
              ))}
              {warns.map((w, i) => (
                <div key={`w${i}`} className="text-warning">
                  {w}
                </div>
              ))}
            </div>
          );
        },
      },
    ],
    [fieldsShown],
  );

  const historyCols: ColumnDef<ImportBatchView>[] = [
    { header: 'Uploaded', accessorKey: 'createdAt', cell: ({ getValue }) => fmtDateTime(getValue<string>()) },
    { header: 'Type', accessorKey: 'type' },
    { header: 'File', accessorKey: 'fileName' },
    { header: 'Status', accessorKey: 'status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
    { header: 'Rows', accessorKey: 'rowCount', meta: { numeric: true } },
    { header: 'Valid', accessorKey: 'validCount', meta: { numeric: true } },
    { header: 'Errors', accessorKey: 'errorCount', meta: { numeric: true } },
    { header: 'Dup', accessorKey: 'duplicateCount', meta: { numeric: true } },
    { header: 'By', accessorKey: 'uploadedBy' },
  ];

  return (
    <>
      <PageHeader title="Imports" description="Upload ERIC6 sales and collections exports (.xlsx / .csv). Rows are validated, previewed, then committed." />
      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="Report type">
              <Select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as ImportType);
                  setMappingId('');
                }}
              >
                <option value="SALES">Sales (invoice lines)</option>
                <option value="COLLECTIONS">Collections (OR / checks)</option>
              </Select>
            </Field>
            <Field label="Column mapping" hint="Config-driven. Edit mappings in Settings when the real ERIC6 headers are known.">
              <Select value={mappingId} onChange={(e) => setMappingId(e.target.value)}>
                <option value="">Default</option>
                {mappings.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="File">
              <input ref={fileRef} type="file" accept=".xlsx,.csv" className="text-xs file:mr-2 file:rounded file:border file:border-input file:bg-card file:px-2 file:py-1" />
            </Field>
            {upload.error && <Alert>{upload.error.message}</Alert>}
            <Button onClick={() => upload.mutate()} disabled={!canWrite || upload.isPending}>
              <Upload /> {upload.isPending ? 'Uploading…' : 'Upload & validate'}
            </Button>
            <p className="text-[11px] text-muted-foreground">Sample templates are in /samples (sales-template.xlsx, collections-template.xlsx).</p>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{b ? `${b.type} · ${b.fileName}` : 'Preview'}</CardTitle>
            {b && (
              <div className="flex items-center gap-2">
                <StatusBadge status={b.status} />
                <Button variant="outline" size="sm" onClick={() => void download(`/imports/${b.id}/error-report`, 'errors.xlsx')} disabled={!ready || (b.errorCount === 0 && b.duplicateCount === 0)}>
                  <Download /> Error report
                </Button>
                {canWrite && b.status === 'VALIDATED' && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => action.mutate('discard')} disabled={action.isPending}>
                      Discard
                    </Button>
                    <Button size="sm" onClick={() => action.mutate('commit')} disabled={action.isPending}>
                      Commit {b.validCount} row{b.validCount === 1 ? '' : 's'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!b && <div className="py-8 text-center text-muted-foreground">Upload a file or pick one from the history below.</div>}
            {b && BUSY.includes(b.status) && <div className="py-8 text-center text-muted-foreground">Validating…</div>}
            {b && ready && (
              <>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
                  <span>
                    <b>{b.rowCount}</b> rows
                  </span>
                  <span className="text-success">
                    <b>{b.validCount}</b> valid
                  </span>
                  <span className="text-destructive">
                    <b>{b.errorCount}</b> errors
                  </span>
                  <span className="text-muted-foreground">
                    <b>{b.duplicateCount}</b> already imported
                  </span>
                  <div className="ml-auto flex gap-1">
                    {(['all', 'errors', 'duplicates', 'valid'] as const).map((f) => (
                      <button
                        key={f}
                        className={cn('rounded border border-border px-2 py-0.5 capitalize', filter === f && 'border-primary bg-accent text-primary')}
                        onClick={() => {
                          setFilter(f);
                          setPage(1);
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                {b.errors.length > 0 && (
                  <Alert tone={b.status === 'FAILED' ? 'danger' : 'warning'} className="mb-2">
                    {b.errors.map((e, i) => (
                      <div key={i}>{e.message}</div>
                    ))}
                  </Alert>
                )}
                {action.error && <Alert className="mb-2">{action.error.message}</Alert>}
                <DataTable columns={rowColumns} data={rows.data?.items ?? []} loading={rows.isLoading} maxHeight="420px" rowClassName={(r) => (r.errors.length ? 'bg-red-50/50' : undefined)} />
                {rows.data && <Pager page={page} pageSize={rows.data.pageSize} total={rows.data.total} onPage={setPage} />}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-2 mt-4 text-sm font-semibold">History</h2>
      <DataTable
        columns={historyCols}
        data={history.data ?? []}
        loading={history.isLoading}
        onRowClick={(r) => {
          setSelected(r.id);
          setFilter('all');
          setPage(1);
        }}
        rowClassName={(r) => (r.id === selected ? 'bg-accent' : undefined)}
        maxHeight="320px"
      />
    </>
  );
}

const p = (k: string) => (r: StagedRow) => (r.parsed?.[k] ?? r.raw[k] ?? null) as string | null;

const SALES_COLS: ColumnDef<StagedRow>[] = [
  { header: 'Invoice', id: 'inv', accessorFn: p('invoiceNo') },
  { header: 'Line', id: 'line', accessorFn: p('lineNo'), meta: { numeric: true } },
  { header: 'Date', id: 'date', accessorFn: p('invoiceDate'), cell: ({ getValue }) => fmtDate(getValue<string>()) },
  { header: 'Customer', id: 'cust', accessorFn: p('customerCode') },
  { header: 'Item', id: 'item', accessorFn: p('productCode') },
  { header: 'Ch', id: 'ch', accessorFn: p('channel') },
  { header: 'Terms', id: 'terms', accessorFn: p('statedTermDays'), meta: { numeric: true } },
  { header: 'Qty', id: 'qty', accessorFn: p('qty'), cell: ({ getValue }) => <Qty value={valueOrNull(getValue())} /> , meta: { numeric: true } },
  { header: 'Liters', id: 'liters', accessorFn: p('liters'), cell: ({ getValue }) => <Qty value={valueOrNull(getValue())} />, meta: { numeric: true } },
  { header: 'Unit price', id: 'price', accessorFn: p('unitPrice'), cell: ({ getValue }) => <Peso value={valueOrNull(getValue())} />, meta: { numeric: true } },
  { header: 'SRP', id: 'srp', accessorFn: p('pricelistPrice'), cell: ({ getValue }) => <Peso value={valueOrNull(getValue())} />, meta: { numeric: true } },
];

const COLLECTION_COLS: ColumnDef<StagedRow>[] = [
  { header: 'Invoice', id: 'inv', accessorFn: p('invoiceNo') },
  { header: 'OR / CR', id: 'ref', accessorFn: p('reference') },
  { header: 'Check', id: 'chk', accessorFn: p('checkNo') },
  { header: 'Amount', id: 'amt', accessorFn: p('amount'), cell: ({ getValue }) => <Peso value={valueOrNull(getValue())} />, meta: { numeric: true } },
  { header: 'Cleared', id: 'clr', accessorFn: p('clearedDate'), cell: ({ getValue }) => fmtDate(getValue<string>()) },
  { header: 'Status', id: 'cst', accessorFn: p('status') },
];

/** Only decimal strings reach the money formatter; raw invalid cells are shown as text. */
function valueOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}

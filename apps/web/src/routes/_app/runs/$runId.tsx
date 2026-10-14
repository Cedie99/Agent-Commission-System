import { createFileRoute, Link } from '@tanstack/react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDecimal, formatPercent, formatRate, TERM_BUCKETS, type ComputeRunView, type ResultLineView, type RunStatus } from '@ocs/shared';
import { bucketLabel, Peso, Qty, StatusBadge } from '@/components/app/format';
import { Button } from '@/components/ui/button';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Sheet } from '@/components/ui/dialog';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, type Paged } from '@/lib/api';
import { can } from '@/lib/auth';
import { cn, fmtDate, fmtDateTime } from '@/lib/utils';

export const Route = createFileRoute('/_app/runs/$runId')({ component: RunDetailPage });

type RunDetail = ComputeRunView & { allowedTransitions: { to: RunStatus; label: string }[] };

function RunDetailPage() {
  const { runId } = Route.useParams();
  const qc = useQueryClient();
  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api<RunDetail>(`/compute-runs/${runId}`),
    refetchInterval: (q) => (q.state.data && ['QUEUED', 'COMPUTING'].includes(q.state.data.status) ? 800 : false),
  });
  const [filters, setFilters] = useState<{ status: string; payeeId: string; termBucket: string; q: string }>({ status: '', payeeId: '', termBucket: '', q: '' });
  const [page, setPage] = useState(1);
  const [lineId, setLineId] = useState<string | null>(null);
  const ready = run.data && !['QUEUED', 'COMPUTING'].includes(run.data.status);

  const qs = new URLSearchParams({ page: String(page), pageSize: '200', ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).toString();
  const results = useQuery({
    queryKey: ['run-results', runId, qs, run.data?.status, run.data?.rulesetHash],
    queryFn: () => api<Paged<ResultLineView>>(`/compute-runs/${runId}/results?${qs}`),
    enabled: !!ready,
    placeholderData: keepPreviousData,
  });

  const transition = useMutation({
    mutationFn: (to: RunStatus) => api(`/compute-runs/${runId}/transition`, { method: 'POST', json: { to } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['run', runId] });
      void qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });
  const recompute = useMutation({
    mutationFn: () => api(`/compute-runs/${runId}/recompute`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['run', runId] }),
  });

  const r = run.data;
  const t = r?.totals;
  const selected = results.data?.items.find((x) => x.id === lineId) ?? null;
  const showDays = results.data?.items.some((x) => x.actualDays !== undefined) ?? false; // only present for Finance/Admin

  const cols = useMemo<ColumnDef<ResultLineView>[]>(
    () => [
      { header: 'Invoice', id: 'inv', accessorFn: (x) => `${x.invoiceNo}#${x.lineNo}`, cell: ({ row }) => <span className="font-mono">{row.original.invoiceNo}<span className="text-muted-foreground">#{row.original.lineNo}</span></span> },
      { header: 'Inv. date', accessorKey: 'invoiceDate', cell: ({ getValue }) => fmtDate(getValue<string>()) },
      { header: 'Customer', accessorKey: 'customerName', cell: ({ row }) => <span title={row.original.customerCode} className="block max-w-[200px] truncate">{row.original.customerName}</span> },
      { header: 'Ch', accessorKey: 'channel' },
      { header: 'Item', accessorKey: 'productCode', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
      { header: 'Liters', accessorKey: 'liters', cell: ({ getValue }) => <Qty value={getValue<string>()} />, meta: { numeric: true } },
      { header: 'Status', accessorKey: 'status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
      { header: 'Collected', accessorKey: 'recognitionDate', cell: ({ getValue }) => fmtDate(getValue<string | null>()) },
      ...(showDays ? [{ header: 'Days', accessorKey: 'actualDays', meta: { numeric: true } } as ColumnDef<ResultLineView>] : []),
      { header: 'Term', accessorKey: 'termBucket', cell: ({ getValue }) => bucketLabel(getValue<string | null>()) },
      { header: 'Pricing', accessorKey: 'pricingType', cell: ({ getValue }) => (getValue<string | null>() === 'NON_STANDARD' ? 'Non-Std' : getValue<string | null>() === 'STANDARD' ? 'Std' : '—') },
      { header: 'Volume', id: 'vol', accessorFn: (x) => x.components.find((c) => c.type === 'VOLUME')?.amount ?? null, cell: ({ getValue }) => <Peso value={getValue<string | null>()} />, meta: { numeric: true } },
      { header: 'Price', id: 'price', accessorFn: (x) => x.components.find((c) => c.type === 'PRICE')?.amount ?? null, cell: ({ getValue }) => <Peso value={getValue<string | null>()} />, meta: { numeric: true } },
      { header: 'Total', accessorKey: 'totalAmount', cell: ({ getValue }) => <Peso value={getValue<string>()} className="font-semibold" />, meta: { numeric: true } },
      {
        header: 'Issue',
        id: 'issue',
        cell: ({ row }) => row.original.exceptions[0] && <span className="block max-w-[220px] truncate text-destructive" title={row.original.exceptions.map((e) => e.message).join('\n')}>{row.original.exceptions[0].code}</span>,
      },
    ],
    [showDays],
  );

  if (run.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (run.error) return <Alert>{run.error.message}</Alert>;
  if (!r) return null;

  return (
    <>
      <PageHeader
        title={`${r.runType.replace('_', ' ')} · ${fmtDate(r.periodStart)} – ${fmtDate(r.periodEnd)}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            <span>
              Created {fmtDateTime(r.createdAt)} by {r.createdBy}
            </span>
            {r.rulesetHash && <span className="font-mono text-[11px]" title="RuleSet hash (snapshot stored with the run)">rules {r.rulesetHash.slice(0, 10)}</span>}
            {r.engineVersion && <span className="text-[11px]">engine v{r.engineVersion}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/runs">
                <ArrowLeft /> Runs
              </Link>
            </Button>
            {can('runs:create') && ['DRAFT', 'FAILED'].includes(r.status) && (
              <Button variant="outline" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
                <RefreshCw /> Recompute
              </Button>
            )}
            {r.allowedTransitions.map((tr) => (
              <Button
                key={tr.to}
                variant={tr.to === 'DRAFT' ? 'outline' : 'default'}
                onClick={() => {
                  if (tr.to === 'LOCKED' && !window.confirm('Lock this run? Locked runs cannot be changed or recomputed.')) return;
                  transition.mutate(tr.to);
                }}
                disabled={transition.isPending}
              >
                {tr.label}
              </Button>
            ))}
          </>
        }
      />
      {(transition.error || recompute.error) && <Alert className="mb-3">{(transition.error ?? recompute.error)!.message}</Alert>}
      {r.status === 'FAILED' && <Alert className="mb-3">Computation failed: {r.error}</Alert>}
      {!ready && <Alert tone="info" className="mb-3">Computing… this page refreshes automatically.</Alert>}

      {t && (
        <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Grand total" value={<Peso value={t.grandTotal} className="text-base font-semibold" />} />
            <Stat label="Computed lines" value={t.computed} />
            <Stat label="Pending collection" value={t.pending} />
            <Stat label="Exceptions" value={<span className={cn(t.exceptions > 0 && 'text-destructive')}>{t.exceptions}</span>} />
            {Object.entries(t.byType).map(([k, v]) => (
              <Stat key={k} label={`${k.toLowerCase()} commission`} value={<Peso value={v} />} />
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>By payee</CardTitle>
            </CardHeader>
            <table className="w-full text-[12.5px]">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-1 text-left">Payee</th>
                  <th className="px-3 py-1 text-right">Lines</th>
                  <th className="px-3 py-1 text-right">Volume</th>
                  <th className="px-3 py-1 text-right">Price</th>
                  <th className="px-3 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {t.byPayee.map((p) => (
                  <tr
                    key={p.payeeId}
                    className={cn('cursor-pointer border-t border-border hover:bg-accent/50', filters.payeeId === p.payeeId && 'bg-accent')}
                    onClick={() => {
                      setFilters((f) => ({ ...f, payeeId: f.payeeId === p.payeeId ? '' : p.payeeId }));
                      setPage(1);
                    }}
                  >
                    <td className="px-3 py-1">
                      {p.payeeName} <Badge tone="outline">{p.payeeRole}</Badge>
                    </td>
                    <td className="num px-3 py-1">{p.lineCount}</td>
                    <td className="px-3 py-1 text-right">
                      <Peso value={p.volume} />
                    </td>
                    <td className="px-3 py-1 text-right">
                      <Peso value={p.price} />
                    </td>
                    <td className="px-3 py-1 text-right font-semibold">
                      <Peso value={p.total} />
                    </td>
                  </tr>
                ))}
                {t.byPayee.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">
                      No commission computed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Input placeholder="Search invoice / customer…" value={filters.q} onChange={(e) => (setFilters({ ...filters, q: e.target.value }), setPage(1))} className="w-56" />
        <Select value={filters.status} onChange={(e) => (setFilters({ ...filters, status: e.target.value }), setPage(1))} className="w-44">
          <option value="">All statuses</option>
          <option value="COMPUTED">Computed</option>
          <option value="PENDING_COLLECTION">Pending collection</option>
          <option value="EXCEPTION">Exception</option>
        </Select>
        <Select value={filters.termBucket} onChange={(e) => (setFilters({ ...filters, termBucket: e.target.value }), setPage(1))} className="w-40">
          <option value="">All terms</option>
          {TERM_BUCKETS.map((b) => (
            <option key={b} value={b}>
              {bucketLabel(b)}
            </option>
          ))}
        </Select>
        {filters.payeeId && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({ ...filters, payeeId: '' })}>
            Clear payee filter
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">Click a line to see how each peso was computed.</span>
      </div>
      <DataTable
        columns={cols}
        data={results.data?.items ?? []}
        loading={!ready || results.isLoading}
        onRowClick={(x) => setLineId(x.id)}
        rowClassName={(x) => (x.status === 'EXCEPTION' ? 'bg-red-50/40' : x.status === 'PENDING_COLLECTION' ? 'text-muted-foreground' : undefined)}
      />
      {results.data && <Pager page={page} pageSize={results.data.pageSize} total={results.data.total} onPage={setPage} />}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setLineId(null)} title={selected ? `${selected.invoiceNo} · line ${selected.lineNo}` : ''} description={selected ? `${selected.customerName} (${selected.customerCode})` : ''}>
        {selected && <LineDrilldown line={selected} />}
      </Sheet>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="px-3 py-2">
        <div className="text-[11px] capitalize text-muted-foreground">{label}</div>
        <div className="text-[15px] font-medium">{value}</div>
      </CardContent>
    </Card>
  );
}

function LineDrilldown({ line }: { line: ResultLineView }) {
  const facts: [string, React.ReactNode][] = [
    ['Status', <StatusBadge key="s" status={line.status} />],
    ['Invoice date', fmtDate(line.invoiceDate)],
    ['Channel', line.channel],
    ['Item', <span key="i" className="font-mono">{line.productCode}</span>],
    ['Quantity', <Qty key="q" value={line.qty} />],
    ['Liters', <Qty key="l" value={line.liters} suffix="L" />],
    ['Unit price', <Peso key="u" value={line.unitPrice} />],
    ['Pricelist price (SRP)', <Peso key="p" value={line.pricelistPrice} />],
    ['Invoice total', <Peso key="t" value={line.invoiceTotal} />],
    ['Collected (cleared)', <Peso key="c" value={line.collectedAmount} />],
    ['Fully collected on', line.recognitionDate ? fmtDate(line.recognitionDate) : 'not yet'],
    ...(line.actualDays !== undefined && line.actualDays !== null ? ([['Actual days (Finance only)', line.actualDays]] as [string, React.ReactNode][]) : []),
    ['Term bucket', bucketLabel(line.termBucket)],
    ['Pricing type', line.pricingType === 'STANDARD' ? 'Standard' : line.pricingType === 'NON_STANDARD' ? 'Non-Standard' : '—'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[180px_1fr] gap-x-3 gap-y-1 text-[13px]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {line.exceptions.length > 0 && (
        <Alert>
          <div className="mb-1 font-medium">Held — no commission until resolved</div>
          {line.exceptions.map((e, i) => (
            <div key={i}>
              <span className="font-mono text-[12px]">{e.code}</span>: {e.message}
            </div>
          ))}
        </Alert>
      )}
      {line.status === 'PENDING_COLLECTION' && <Alert tone="info">Commission is earned only when the invoice is fully collected. Cleared so far: {formatPhpInline(line.collectedAmount)} of {formatPhpInline(line.invoiceTotal)}.</Alert>}

      <div>
        <h3 className="mb-2 text-[13px] font-semibold">Commission components</h3>
        {line.components.length === 0 && <div className="text-muted-foreground">None.</div>}
        <div className="flex flex-col gap-2">
          {line.components.map((c) => (
            <Card key={c.id}>
              <CardContent className="px-3 py-2">
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone="primary">{c.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {c.payeeName} ({c.payeeRole})
                    </span>
                  </div>
                  <Peso value={c.amount} className="text-[14px] font-semibold" />
                </div>
                <div className="font-mono text-[12.5px]">{c.explanation}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  basis {c.type === 'VOLUME' ? `${formatDecimal(c.basis, 2)} L` : formatPhpInline(c.basis)} · rate {c.type === 'PRICE' ? formatPercent(c.rate) : `₱${formatRate(c.rate)}/L`}
                </div>
                {c.internalNotes && <div className="mt-1 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">Finance only: {c.internalNotes}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <div className="flex justify-between border-t border-border pt-2 text-[13px] font-semibold">
        <span>Line total</span>
        <Peso value={line.totalAmount} />
      </div>
    </div>
  );
}

function formatPhpInline(v: string) {
  return <Peso value={v} />;
}

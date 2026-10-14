import { createFileRoute, Link } from '@tanstack/react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { StatusBadge } from '@/components/app/format';
import { Button } from '@/components/ui/button';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Badge, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { can } from '@/lib/auth';
import { fmtDateTime } from '@/lib/utils';

export const Route = createFileRoute('/_app/exceptions')({ component: ExceptionsPage });

interface ExceptionRow {
  id: string;
  code: string;
  message: string;
  invoiceNo: string | null;
  lineNo: number | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  run: { id: string; runType: string; period: string; status: string } | null;
}
interface ExceptionList {
  items: ExceptionRow[];
  total: number;
  page: number;
  pageSize: number;
  openByCode: Record<string, number>;
}

function ExceptionsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const [code, setCode] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<ExceptionRow | null>(null);
  const [form, setForm] = useState({ status: 'RESOLVED', resolution: '' });

  const params = new URLSearchParams({ page: String(page), pageSize: '100', ...(status && { status }), ...(code && { code }), ...(q && { q }) });
  const list = useQuery({ queryKey: ['exceptions', params.toString()], queryFn: () => api<ExceptionList>(`/exceptions?${params}`), placeholderData: keepPreviousData });

  const resolve = useMutation({
    mutationFn: () => api(`/exceptions/${resolving!.id}/resolve`, { method: 'POST', json: form }),
    onSuccess: () => {
      setResolving(null);
      void qc.invalidateQueries({ queryKey: ['exceptions'] });
    },
  });

  const cols: ColumnDef<ExceptionRow>[] = [
    { header: 'Code', accessorKey: 'code', cell: ({ getValue }) => <span className="font-mono text-[12px]">{getValue<string>()}</span> },
    { header: 'Invoice', id: 'inv', accessorFn: (r) => (r.invoiceNo ? `${r.invoiceNo}#${r.lineNo}` : '—') },
    { header: 'Message', accessorKey: 'message', cell: ({ getValue }) => <span className="block max-w-[460px] whitespace-normal">{getValue<string>()}</span> },
    {
      header: 'Run',
      id: 'run',
      cell: ({ row }) =>
        row.original.run && (
          <Link to="/runs/$runId" params={{ runId: row.original.run.id }} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.original.run.runType} {row.original.run.period}
          </Link>
        ),
    },
    { header: 'Status', accessorKey: 'status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
    { header: 'Resolution', accessorKey: 'resolution', cell: ({ getValue }) => <span className="block max-w-[260px] truncate">{getValue<string | null>() ?? ''}</span> },
    { header: 'Raised', accessorKey: 'createdAt', cell: ({ getValue }) => fmtDateTime(getValue<string>()) },
    {
      header: '',
      id: 'act',
      cell: ({ row }) =>
        can('exceptions:resolve') &&
        row.original.status === 'OPEN' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setForm({ status: 'RESOLVED', resolution: '' });
              setResolving(row.original);
            }}
          >
            Resolve
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Exceptions"
        description="Lines held instead of guessed. Fix the underlying data (pricelist, rate table, customer) and recompute the draft run; record the decision here."
      />
      <div className="mb-2 flex flex-wrap gap-1">
        {Object.entries(list.data?.openByCode ?? {}).map(([c, n]) => (
          <button key={c} onClick={() => (setCode(code === c ? '' : c), setPage(1))}>
            <Badge tone={code === c ? 'primary' : 'danger'}>
              {c} · {n}
            </Badge>
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        <Input placeholder="Search invoice / message…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} className="w-60" />
        <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} className="w-36">
          <option value="">All</option>
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="WAIVED">Waived</option>
        </Select>
      </div>
      <DataTable columns={cols} data={list.data?.items ?? []} loading={list.isLoading} empty="No exceptions." />
      {list.data && <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent title={`Resolve ${resolving?.code ?? ''}`} description={resolving?.message}>
          <div className="flex flex-col gap-3">
            <Field label="Outcome">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="RESOLVED">Resolved (data fixed; recompute the draft run)</option>
                <option value="WAIVED">Waived (no commission for this line)</option>
              </Select>
            </Field>
            <Field label="Resolution note">
              <Input value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} placeholder="What was decided and why" />
            </Field>
            {resolve.error && <Alert>{resolve.error.message}</Alert>}
            <Button onClick={() => resolve.mutate()} disabled={form.resolution.trim().length < 3 || resolve.isPending}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

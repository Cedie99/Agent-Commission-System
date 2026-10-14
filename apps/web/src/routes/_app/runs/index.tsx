import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { ComputeRunView, RunType } from '@ocs/shared';
import { Peso, StatusBadge } from '@/components/app/format';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { can } from '@/lib/auth';
import { fmtDate, fmtDateTime, todayIso } from '@/lib/utils';

export const Route = createFileRoute('/_app/runs/')({ component: RunsPage });

/** Last full Mon–Sun week (AS weekly cutoff is open question 9). */
function lastWeek() {
  const t = new Date(`${todayIso()}T00:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7; // Mon = 0
  const lastSun = new Date(t.getTime() - (dow + 1) * 86400000);
  const lastMon = new Date(lastSun.getTime() - 6 * 86400000);
  return { start: lastMon.toISOString().slice(0, 10), end: lastSun.toISOString().slice(0, 10) };
}

function RunsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const runs = useQuery({
    queryKey: ['runs'],
    queryFn: () => api<ComputeRunView[]>('/compute-runs'),
    refetchInterval: (q) => (q.state.data?.some((r) => ['QUEUED', 'COMPUTING'].includes(r.status)) ? 1000 : false),
  });
  const [open, setOpen] = useState(false);
  const wk = lastWeek();
  const [form, setForm] = useState<{ runType: RunType; periodStart: string; periodEnd: string; notes: string }>({ runType: 'AS_WEEKLY', periodStart: wk.start, periodEnd: wk.end, notes: '' });

  const create = useMutation({
    mutationFn: () => api<ComputeRunView>('/compute-runs', { method: 'POST', json: { ...form, notes: form.notes || undefined } }),
    onSuccess: (r) => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['runs'] });
      void navigate({ to: '/runs/$runId', params: { runId: r.id } });
    },
  });

  const cols: ColumnDef<ComputeRunView>[] = [
    { header: 'Type', accessorKey: 'runType' },
    { header: 'Period', id: 'period', accessorFn: (r) => r.periodStart, cell: ({ row }) => `${fmtDate(row.original.periodStart)} – ${fmtDate(row.original.periodEnd)}` },
    { header: 'Status', accessorKey: 'status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
    { header: 'Computed', id: 'c', accessorFn: (r) => r.totals?.computed ?? 0, meta: { numeric: true } },
    { header: 'Pending', id: 'p', accessorFn: (r) => r.totals?.pending ?? 0, meta: { numeric: true } },
    { header: 'Exceptions', id: 'e', accessorFn: (r) => r.totals?.exceptions ?? 0, meta: { numeric: true } },
    { header: 'Total', id: 't', accessorFn: (r) => r.totals?.grandTotal ?? null, cell: ({ getValue }) => <Peso value={getValue<string | null>()} />, meta: { numeric: true } },
    { header: 'Created', accessorKey: 'createdAt', cell: ({ row }) => `${fmtDateTime(row.original.createdAt)} · ${row.original.createdBy}` },
  ];

  return (
    <>
      <PageHeader
        title="Compute Runs"
        description="Each run snapshots the rules it used. Draft → Submitted → Approved → Locked; locked runs are immutable."
        actions={
          can('runs:create') && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> New run
            </Button>
          )
        }
      />
      <DataTable columns={cols} data={runs.data ?? []} loading={runs.isLoading} onRowClick={(r) => void navigate({ to: '/runs/$runId', params: { runId: r.id } })} empty="No runs yet." />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New compute run" description="Includes lines fully collected (last cleared payment) within the period, plus lines still pending collection.">
          <div className="flex flex-col gap-3">
            <Field label="Run type">
              <Select value={form.runType} onChange={(e) => setForm({ ...form, runType: e.target.value as RunType })}>
                <option value="AS_WEEKLY">AS weekly (Volume + Price commission)</option>
                <option value="SP_MONTHLY">SP monthly (not implemented yet)</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Period start">
                <Input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
              </Field>
              <Field label="Period end">
                <Input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <p className="text-[11px] text-muted-foreground">Sample data: use 2026-10-05 → 2026-10-11.</p>
            {create.error && <Alert>{create.error.message}</Alert>}
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create & compute'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

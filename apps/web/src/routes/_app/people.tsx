import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PERSON_STATUSES, ROLE_CODES, ROLE_LABELS } from '@ocs/shared';
import { StatusBadge } from '@/components/app/format';
import { Button } from '@/components/ui/button';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Badge, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, type Paged } from '@/lib/api';
import { can } from '@/lib/auth';

export const Route = createFileRoute('/_app/people')({ component: PeoplePage });

interface Person {
  id: string;
  code: string;
  fullName: string;
  role: string;
  managerId: string | null;
  managerName: string | null;
  status: string;
  email: string | null;
  startDate: string | null;
  endDate: string | null;
  customerCount: number;
  reportCount: number;
}

interface Form {
  code: string;
  fullName: string;
  role: string;
  managerId: string | null;
  status: string;
  email: string | null;
  startDate: string | null;
  endDate: string | null;
}
const EMPTY: Form = { code: '', fullName: '', role: 'AS', managerId: null, status: 'ACTIVE', email: null, startDate: null, endDate: null };

function PeoplePage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const params = new URLSearchParams({ page: String(page), pageSize: '100', ...(q && { q }), ...(role && { role }) });
  const list = useQuery({ queryKey: ['people', params.toString()], queryFn: () => api<Paged<Person>>(`/people?${params}`), placeholderData: keepPreviousData });
  const everyone = useQuery({ queryKey: ['people-all'], queryFn: () => api<Paged<Person>>('/people?pageSize=500') });

  const save = useMutation({
    mutationFn: () => api(editing!.id ? `/people/${editing!.id}` : '/people', { method: editing!.id ? 'PUT' : 'POST', json: editing!.form }),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['people'] });
      void qc.invalidateQueries({ queryKey: ['people-all'] });
    },
  });

  const cols: ColumnDef<Person>[] = [
    { header: 'Code', accessorKey: 'code', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
    { header: 'Name', accessorKey: 'fullName' },
    { header: 'Role', accessorKey: 'role', cell: ({ getValue }) => <Badge tone="primary">{getValue<string>()}</Badge> },
    { header: 'Reports to', accessorKey: 'managerName' },
    { header: 'Status', accessorKey: 'status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
    { header: 'Customers (AS)', accessorKey: 'customerCount', meta: { numeric: true } },
    { header: 'Direct reports', accessorKey: 'reportCount', meta: { numeric: true } },
    { header: 'Email', accessorKey: 'email' },
  ];

  const f = editing?.form;
  const set = (patch: Partial<Form>) => setEditing((e) => e && { ...e, form: { ...e.form, ...patch } });
  const managers = (everyone.data?.items ?? []).filter((p) => p.id !== editing?.id);

  return (
    <>
      <PageHeader
        title="People"
        description="Account Specialists and Sales Personnel with their reporting line."
        actions={
          can('people:write') && (
            <Button onClick={() => (save.reset(), setEditing({ id: null, form: EMPTY }))}>
              <Plus /> New person
            </Button>
          )
        }
      />
      <div className="mb-2 flex gap-2">
        <Input placeholder="Search code / name…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} className="w-60" />
        <Select value={role} onChange={(e) => (setRole(e.target.value), setPage(1))} className="w-36">
          <option value="">All roles</option>
          {ROLE_CODES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </div>
      <DataTable
        columns={cols}
        data={list.data?.items ?? []}
        loading={list.isLoading}
        onRowClick={
          can('people:write')
            ? (p) => (
                save.reset(),
                setEditing({ id: p.id, form: { code: p.code, fullName: p.fullName, role: p.role, managerId: p.managerId, status: p.status, email: p.email, startDate: p.startDate, endDate: p.endDate } })
              )
            : undefined
        }
      />
      {list.data && <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? 'Edit person' : 'New person'} className="max-w-2xl">
          {f && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Code" hint="As in ERIC6, e.g. AS-001">
                <Input value={f.code} onChange={(e) => set({ code: e.target.value })} />
              </Field>
              <Field label="Full name">
                <Input value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} />
              </Field>
              <Field label="Role">
                <Select value={f.role} onChange={(e) => set({ role: e.target.value })}>
                  {ROLE_CODES.map((r) => (
                    <option key={r} value={r}>
                      {r} · {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reports to">
                <Select value={f.managerId ?? ''} onChange={(e) => set({ managerId: e.target.value || null })}>
                  <option value="">— nobody —</option>
                  {managers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.fullName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>
                  {PERSON_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Email">
                <Input type="email" value={f.email ?? ''} onChange={(e) => set({ email: e.target.value || null })} />
              </Field>
              <Field label="Start date">
                <Input type="date" value={f.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} />
              </Field>
              <Field label="End date">
                <Input type="date" value={f.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} />
              </Field>
              {save.error && <Alert className="sm:col-span-2">{save.error.message}</Alert>}
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

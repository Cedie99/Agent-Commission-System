import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { ACCOUNT_TYPES, CHANNEL_LABELS, CHANNELS } from '@ocs/shared';
import { Button } from '@/components/ui/button';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, type Paged } from '@/lib/api';
import { can } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';

export const Route = createFileRoute('/_app/customers')({ component: CustomersPage });

interface Customer {
  id: string;
  eric6Code: string;
  name: string;
  channel: string;
  accountType: string;
  asId: string | null;
  asName: string | null;
  ssId: string | null;
  ssName: string | null;
  smId: string | null;
  smName: string | null;
  hasCIS: boolean;
  hasCAS: boolean;
  casCosignedBySM: boolean;
  lastOrderDate: string | null;
  active: boolean;
}
interface Person {
  id: string;
  code: string;
  fullName: string;
  role: string;
}

type Form = Omit<Customer, 'id' | 'asName' | 'ssName' | 'smName'>;
const EMPTY: Form = { eric6Code: '', name: '', channel: 'EU', accountType: 'AS_GENERATED', asId: null, ssId: null, smId: null, hasCIS: false, hasCAS: false, casCosignedBySM: false, lastOrderDate: null, active: true };

const Yes = ({ v }: { v: boolean }) => (v ? <Check className="size-3.5 text-success" /> : <span className="text-muted-foreground">—</span>);

function CustomersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const params = new URLSearchParams({ page: String(page), pageSize: '100', ...(q && { q }), ...(channel && { channel }) });
  const list = useQuery({ queryKey: ['customers', params.toString()], queryFn: () => api<Paged<Customer>>(`/customers?${params}`), placeholderData: keepPreviousData });
  const people = useQuery({ queryKey: ['people-all'], queryFn: () => api<Paged<Person>>('/people?pageSize=500') });

  const save = useMutation({
    mutationFn: () => {
      const f = editing!.form;
      return api(editing!.id ? `/customers/${editing!.id}` : '/customers', { method: editing!.id ? 'PUT' : 'POST', json: f });
    },
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  const cols: ColumnDef<Customer>[] = [
    { header: 'ERIC6 code', accessorKey: 'eric6Code', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
    { header: 'Name', accessorKey: 'name' },
    { header: 'Channel', accessorKey: 'channel', cell: ({ getValue }) => <span title={CHANNEL_LABELS[getValue<keyof typeof CHANNEL_LABELS>()]}>{getValue<string>()}</span> },
    { header: 'Account type', accessorKey: 'accountType' },
    { header: 'AS', accessorKey: 'asName' },
    { header: 'SS', accessorKey: 'ssName' },
    { header: 'SM', accessorKey: 'smName' },
    { header: 'CIS', accessorKey: 'hasCIS', cell: ({ getValue }) => <Yes v={getValue<boolean>()} /> },
    { header: 'CAS', accessorKey: 'hasCAS', cell: ({ getValue }) => <Yes v={getValue<boolean>()} /> },
    { header: 'CAS SM', accessorKey: 'casCosignedBySM', cell: ({ getValue }) => <Yes v={getValue<boolean>()} /> },
    { header: 'Last order', accessorKey: 'lastOrderDate', cell: ({ getValue }) => fmtDate(getValue<string | null>()) },
  ];

  const personOptions = (roles: string[]) => people.data?.items.filter((p) => roles.includes(p.role)) ?? [];
  const f = editing?.form;
  const set = (patch: Partial<Form>) => setEditing((e) => e && { ...e, form: { ...e.form, ...patch } });

  return (
    <>
      <PageHeader
        title="Customers"
        description="Customer master. Channel, account type and AS assignment are snapshotted onto each imported invoice line."
        actions={
          can('customers:write') && (
            <Button onClick={() => setEditing({ id: null, form: EMPTY })}>
              <Plus /> New customer
            </Button>
          )
        }
      />
      <div className="mb-2 flex gap-2">
        <Input placeholder="Search code / name…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} className="w-60" />
        <Select value={channel} onChange={(e) => (setChannel(e.target.value), setPage(1))} className="w-44">
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c} · {CHANNEL_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>
      <DataTable
        columns={cols}
        data={list.data?.items ?? []}
        loading={list.isLoading}
        onRowClick={can('customers:write') ? (c) => setEditing({ id: c.id, form: { ...EMPTY, ...c } }) : undefined}
      />
      {list.data && <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? 'Edit customer' : 'New customer'} className="max-w-2xl">
          {f && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ERIC6 code">
                <Input value={f.eric6Code} onChange={(e) => set({ eric6Code: e.target.value })} />
              </Field>
              <Field label="Name">
                <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Channel">
                <Select value={f.channel} onChange={(e) => set({ channel: e.target.value })}>
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c} · {CHANNEL_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Account type">
                <Select value={f.accountType} onChange={(e) => set({ accountType: e.target.value })}>
                  {ACCOUNT_TYPES.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </Select>
              </Field>
              {(
                [
                  ['asId', 'Account Specialist (AS)', ['AS']],
                  ['ssId', 'Sales Specialist (SS)', ['SS', 'RSR']],
                  ['smId', 'Sales Manager (SM)', ['SM', 'RSRM', 'NSM']],
                ] as const
              ).map(([key, label, roles]) => (
                <Field key={key} label={label}>
                  <Select value={f[key] ?? ''} onChange={(e) => set({ [key]: e.target.value || null })}>
                    <option value="">— none —</option>
                    {personOptions([...roles]).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.fullName}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
              <Field label="Last order date">
                <Input type="date" value={f.lastOrderDate ?? ''} onChange={(e) => set({ lastOrderDate: e.target.value || null })} />
              </Field>
              <div className="flex flex-wrap gap-4 sm:col-span-2">
                {(
                  [
                    ['hasCIS', 'Has CIS'],
                    ['hasCAS', 'Has CAS'],
                    ['casCosignedBySM', 'CAS co-signed by SM'],
                    ['active', 'Active'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5 text-[13px]">
                    <input type="checkbox" checked={f[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {label}
                  </label>
                ))}
              </div>
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

import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { commissionTeam, ROLE_CODES, ROLE_LABELS, type RoleCode, type UserView } from '@ocs/shared';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Badge, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, type Paged } from '@/lib/api';
import { can, getSession } from '@/lib/auth';
import { fmtDateTime } from '@/lib/utils';

export const Route = createFileRoute('/_app/users')({ component: UsersPage });

interface Person {
  id: string;
  code: string;
  fullName: string;
  role: string;
}
interface Form {
  email: string;
  password: string;
  roles: RoleCode[];
  personId: string | null;
  isActive: boolean;
}
const EMPTY: Form = { email: '', password: '', roles: [], personId: null, isActive: true };

function UsersPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<UserView[]>('/users') });
  const people = useQuery({ queryKey: ['people-all'], queryFn: () => api<Paged<Person>>('/people?pageSize=500') });
  const myId = getSession()?.user.id;

  const save = useMutation({
    mutationFn: () => {
      const { password, ...account } = editing!.form;
      return editing!.id ? api(`/users/${editing!.id}`, { method: 'PUT', json: account }) : api('/users', { method: 'POST', json: { ...account, password } });
    },
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });
  const reset = useMutation({
    mutationFn: () => api(`/users/${editing!.id}/password`, { method: 'POST', json: { password: newPassword } }),
    onSuccess: () => setNewPassword(''),
  });

  const open = (id: string | null, form: Form) => {
    save.reset();
    reset.reset();
    setNewPassword('');
    setEditing({ id, form });
  };

  const cols: ColumnDef<UserView>[] = [
    { header: 'Email', accessorKey: 'email' },
    {
      header: 'Role',
      id: 'roles',
      accessorFn: (u) => u.roles.join(','),
      cell: ({ row }) => {
        const team = commissionTeam(row.original.roles);
        return (
          <span className="flex flex-wrap items-center gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} tone="primary" title={ROLE_LABELS[r]}>
                {r}
              </Badge>
            ))}
            {team && <span className="text-xs text-muted-foreground">{team}</span>}
          </span>
        );
      },
    },
    { header: 'Person', id: 'person', accessorFn: (u) => (u.personCode ? `${u.personCode} · ${u.personName}` : '—') },
    { header: 'Last sign-in', accessorKey: 'lastLoginAt', cell: ({ getValue }) => (getValue<string | null>() ? fmtDateTime(getValue<string>()) : <span className="text-muted-foreground">never</span>) },
    { header: 'Status', accessorKey: 'isActive', cell: ({ getValue }) => (getValue<boolean>() ? <Badge tone="success">Active</Badge> : <Badge tone="outline">Disabled</Badge>) },
  ];

  const f = editing?.form;
  const set = (patch: Partial<Form>) => setEditing((e) => e && { ...e, form: { ...e.form, ...patch } });
  const toggleRole = (r: RoleCode) => f && set({ roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] });
  const isSelf = !!editing?.id && editing.id === myId;
  const needsPerson = !!f && commissionTeam(f.roles) !== null && !f.personId;
  // One account per person: hide people who already have someone else's account.
  const takenBy = new Map((users.data ?? []).filter((u) => u.personId).map((u) => [u.personId!, u.id]));
  const personOptions = (people.data?.items ?? []).filter((p) => !takenBy.has(p.id) || takenBy.get(p.id) === editing?.id);

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in and what they can do. Role changes apply the next time the person signs in."
        actions={
          can('users:write') && (
            <Button onClick={() => open(null, EMPTY)}>
              <Plus /> New user
            </Button>
          )
        }
      />
      <DataTable
        columns={cols}
        data={users.data ?? []}
        loading={users.isLoading}
        onRowClick={can('users:write') ? (u) => open(u.id, { email: u.email, password: '', roles: u.roles, personId: u.personId, isActive: u.isActive }) : undefined}
      />
      {users.error && <Alert className="mt-3">{users.error.message}</Alert>}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? 'Edit user' : 'New user'} className="max-w-2xl">
          {f && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} autoComplete="off" />
              </Field>
              {!editing?.id && (
                <Field label="Temporary password" hint="At least 8 characters. Give it to the person directly.">
                  <Input type="text" value={f.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
                </Field>
              )}
              <Field label="Linked person" hint="Required for Sales and RSR team accounts: it decides whose commission they see." className={editing?.id ? '' : 'sm:col-span-2'}>
                <Select value={f.personId ?? ''} onChange={(e) => set({ personId: e.target.value || null })}>
                  <option value="">— none (staff account) —</option>
                  {personOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.fullName} ({p.role})
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">Roles</span>
                <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {ROLE_CODES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={f.roles.includes(r)} onChange={() => toggleRole(r)} />
                      <span className="w-14 font-mono text-[12px]">{r}</span>
                      <span className="text-muted-foreground">{ROLE_LABELS[r]}</span>
                    </label>
                  ))}
                </div>
                {needsPerson && <span className="text-xs text-warning">Sales and RSR team accounts must be linked to a person.</span>}
              </div>
              <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
                <input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Can sign in (active)
              </label>
              {isSelf && <p className="text-xs text-muted-foreground sm:col-span-2">This is your own account: you can't remove Admin from it or disable it.</p>}
              {save.error && <Alert className="sm:col-span-2">{save.error.message}</Alert>}
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {editing?.id ? 'Save' : 'Create user'}
                </Button>
              </div>

              {editing?.id && (
                <div className="flex flex-col gap-2 border-t border-border pt-3 sm:col-span-2">
                  <span className="text-[13px] font-semibold">Reset password</span>
                  <div className="flex gap-2">
                    <Input type="text" placeholder="New password (at least 8 characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                    <Button variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending || newPassword.length === 0}>
                      Set password
                    </Button>
                  </div>
                  {reset.isSuccess && <span className="text-xs text-success">Password changed. Give the new one to the person directly.</span>}
                  {reset.error && <Alert>{reset.error.message}</Alert>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

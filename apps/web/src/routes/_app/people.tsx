import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { ROLE_CODES } from '@ocs/shared';
import { StatusBadge } from '@/components/app/format';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Badge, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, type Paged } from '@/lib/api';

export const Route = createFileRoute('/_app/people')({ component: PeoplePage });

interface Person {
  id: string;
  code: string;
  fullName: string;
  role: string;
  managerName: string | null;
  status: string;
  email: string | null;
  customerCount: number;
  reportCount: number;
}

function PeoplePage() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '100', ...(q && { q }), ...(role && { role }) });
  const list = useQuery({ queryKey: ['people', params.toString()], queryFn: () => api<Paged<Person>>(`/people?${params}`), placeholderData: keepPreviousData });

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

  return (
    <>
      <PageHeader title="People" description="Account Specialists and Sales Personnel with their reporting line. (Editing: TODO — API supports POST/PUT /people.)" />
      <div className="mb-2 flex gap-2">
        <Input placeholder="Search code / name…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} className="w-60" />
        <Select value={role} onChange={(e) => (setRole(e.target.value), setPage(1))} className="w-36">
          <option value="">All roles</option>
          {ROLE_CODES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </div>
      <DataTable columns={cols} data={list.data?.items ?? []} loading={list.isLoading} />
      {list.data && <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}
    </>
  );
}

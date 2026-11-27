import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { formatDecimal, PRODUCT_CATEGORIES } from '@ocs/shared';
import { Button } from '@/components/ui/button';
import { DataTable, Pager } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, type Paged } from '@/lib/api';
import { can } from '@/lib/auth';

export const Route = createFileRoute('/_app/products')({ component: ProductsPage });

interface Product {
  id: string;
  eric6Code: string;
  name: string;
  litersPerUnit: string;
  category: string;
  active: boolean;
}
type Form = Omit<Product, 'id'>;
const EMPTY: Form = { eric6Code: '', name: '', litersPerUnit: '', category: 'LUBE', active: true };

function ProductsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const params = new URLSearchParams({ page: String(page), pageSize: '100', ...(q && { q }) });
  const list = useQuery({ queryKey: ['products', params.toString()], queryFn: () => api<Paged<Product>>(`/products?${params}`), placeholderData: keepPreviousData });

  const save = useMutation({
    mutationFn: () => api(editing!.id ? `/products/${editing!.id}` : '/products', { method: editing!.id ? 'PUT' : 'POST', json: { ...editing!.form, litersPerUnit: editing!.form.litersPerUnit.trim() } }),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const cols: ColumnDef<Product>[] = [
    { header: 'ERIC6 code', accessorKey: 'eric6Code', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
    { header: 'Name', accessorKey: 'name' },
    { header: 'Liters per unit', accessorKey: 'litersPerUnit', cell: ({ getValue }) => <span className="num">{formatDecimal(getValue<string>(), 2)}</span>, meta: { numeric: true } },
    { header: 'Category', accessorKey: 'category' },
    { header: 'Active', accessorKey: 'active', cell: ({ getValue }) => (getValue<boolean>() ? <Check className="size-3.5 text-success" /> : <span className="text-muted-foreground">—</span>) },
  ];

  const f = editing?.form;
  const set = (patch: Partial<Form>) => setEditing((e) => e && { ...e, form: { ...e.form, ...patch } });

  return (
    <>
      <PageHeader
        title="Products"
        description="Product master from ERIC6. Liters per unit turns quantities into liters; list prices (SRP) are in Rates & Pricelists."
        actions={
          can('customers:write') && (
            <Button onClick={() => (save.reset(), setEditing({ id: null, form: EMPTY }))}>
              <Plus /> New product
            </Button>
          )
        }
      />
      <div className="mb-2 flex gap-2">
        <Input placeholder="Search code / name…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} className="w-60" />
      </div>
      <DataTable
        columns={cols}
        data={list.data?.items ?? []}
        loading={list.isLoading}
        onRowClick={can('customers:write') ? (p) => (save.reset(), setEditing({ id: p.id, form: { eric6Code: p.eric6Code, name: p.name, litersPerUnit: formatDecimal(p.litersPerUnit, 4).replace(/,/g, ''), category: p.category, active: p.active } })) : undefined}
      />
      {list.data && <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing?.id ? 'Edit product' : 'New product'}>
          {f && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ERIC6 code">
                <Input value={f.eric6Code} onChange={(e) => set({ eric6Code: e.target.value })} />
              </Field>
              <Field label="Name">
                <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Liters per unit" hint="e.g. 18 for an 18 L pail">
                <Input inputMode="decimal" value={f.litersPerUnit} onChange={(e) => set({ litersPerUnit: e.target.value })} />
              </Field>
              <Field label="Category">
                <Select value={f.category} onChange={(e) => set({ category: e.target.value })}>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
                <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Active
              </label>
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

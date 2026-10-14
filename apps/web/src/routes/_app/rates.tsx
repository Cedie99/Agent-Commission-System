import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyPlus, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CHANNELS, isDecimalString, TERM_BUCKETS, TERM_BUCKET_LABELS, type RateTableView } from '@ocs/shared';
import { Peso } from '@/components/app/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Select } from '@/components/ui/primitives';
import { api, type Paged } from '@/lib/api';
import { can } from '@/lib/auth';
import { cn, fmtDate } from '@/lib/utils';

export const Route = createFileRoute('/_app/rates')({ component: RatesPage });

type Tab = 'VOLUME' | 'PRICE' | 'PRICELIST';

function RatesPage() {
  const [tab, setTab] = useState<Tab>('VOLUME');
  return (
    <>
      <PageHeader
        title="Rates & Pricelists"
        description="Effective-dated. A version used by an approved or locked run is read-only — create a new version instead, so past periods always recompute the same way."
      />
      <div className="mb-3 flex gap-1">
        {(
          [
            ['VOLUME', 'Volume Commission (₱/L)'],
            ['PRICE', 'Price Commission (%)'],
            ['PRICELIST', 'Pricelists (SRP)'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('rounded-md border border-border bg-card px-3 py-1.5 text-[13px]', tab === k && 'border-primary bg-accent font-medium text-primary')}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'PRICELIST' ? <Pricelists /> : <RateTables type={tab} key={tab} />}
    </>
  );
}

// ───────────────────────── rate tables ─────────────────────────

const VOLUME_COLS = (['STANDARD', 'NON_STANDARD'] as const).flatMap((pt) => CHANNELS.map((ch) => ({ pt, ch, key: `${ch}|${pt}` })));

interface TableDetail extends RateTableView {
  usedByFinalRuns: boolean;
}

function cellKey(ch: string | null, pt: string | null, b: string) {
  return `${ch ?? ''}|${pt ?? ''}|${b}`;
}

function RateTables({ type }: { type: 'VOLUME' | 'PRICE' }) {
  const qc = useQueryClient();
  const canWrite = can('rates:write');
  const list = useQuery({ queryKey: ['rate-tables', type], queryFn: () => api<RateTableView[]>(`/rates/tables?type=${type}`) });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const id = selectedId ?? list.data?.[0]?.id ?? null;
  const detail = useQuery({ queryKey: ['rate-table', id], queryFn: () => api<TableDetail>(`/rates/tables/${id}`), enabled: !!id });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ name: string; effectiveFrom: string; effectiveTo: string; cells: Record<string, string> }>({ name: '', effectiveFrom: '', effectiveTo: '', cells: {} });
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionFrom, setVersionFrom] = useState('');

  useEffect(() => {
    setEditing(false);
  }, [id]);

  function startEdit() {
    const t = detail.data!;
    const cells: Record<string, string> = {};
    for (const e of t.entries) cells[cellKey(e.channel, e.pricingType, e.termBucket)] = e.kind === 'FORFEIT' ? 'forfeit' : stripZeros(e.rate);
    setDraft({ name: t.name, effectiveFrom: t.effectiveFrom, effectiveTo: t.effectiveTo ?? '', cells });
    setEditing(true);
  }

  const invalid = Object.entries(draft.cells).filter(([, v]) => v.trim() !== '' && v.trim().toLowerCase() !== 'forfeit' && !isDecimalString(v));

  const save = useMutation({
    mutationFn: () => {
      const entries = Object.entries(draft.cells)
        .filter(([, v]) => v.trim() !== '')
        .map(([k, v]) => {
          const [ch, pt, b] = k.split('|');
          const forfeit = v.trim().toLowerCase() === 'forfeit';
          return { channel: ch || null, pricingType: pt || null, termBucket: b, kind: forfeit ? 'FORFEIT' : 'RATE', rate: forfeit ? '0' : v.trim() };
        });
      return api(`/rates/tables/${id}`, { method: 'PUT', json: { type, name: draft.name, effectiveFrom: draft.effectiveFrom, effectiveTo: draft.effectiveTo || null, entries } });
    },
    onSuccess: () => {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ['rate-tables'] });
      void qc.invalidateQueries({ queryKey: ['rate-table', id] });
    },
  });

  const newVersion = useMutation({
    mutationFn: () => api<RateTableView>(`/rates/tables/${id}/new-version`, { method: 'POST', json: { effectiveFrom: versionFrom } }),
    onSuccess: (t) => {
      setVersionOpen(false);
      setSelectedId(t.id);
      void qc.invalidateQueries({ queryKey: ['rate-tables'] });
    },
  });

  const t = detail.data;
  const value = (ch: string | null, pt: string | null, b: string) => {
    if (editing) return draft.cells[cellKey(ch, pt, b)] ?? '';
    const e = t?.entries.find((x) => x.channel === ch && x.pricingType === pt && x.termBucket === b);
    return e ? (e.kind === 'FORFEIT' ? 'forfeit' : e.rate) : null;
  };
  const setCell = (ch: string | null, pt: string | null, b: string, v: string) => setDraft((d) => ({ ...d, cells: { ...d.cells, [cellKey(ch, pt, b)]: v } }));

  return (
    <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
        </CardHeader>
        <div className="flex flex-col">
          {list.data?.map((v) => (
            <button key={v.id} onClick={() => setSelectedId(v.id)} className={cn('border-b border-border px-3 py-2 text-left last:border-0 hover:bg-accent/50', v.id === id && 'bg-accent')}>
              <div className="text-[13px] font-medium">{v.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {fmtDate(v.effectiveFrom)} – {v.effectiveTo ? fmtDate(v.effectiveTo) : 'open'}
              </div>
            </button>
          ))}
          {list.data?.length === 0 && <div className="p-3 text-muted-foreground">No tables.</div>}
        </div>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{t?.name ?? '—'}</CardTitle>
            {t?.usedByFinalRuns && <Badge tone="warning">Used by approved/locked run · read-only</Badge>}
          </div>
          {t && canWrite && (
            <div className="flex gap-2">
              {!editing && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setVersionOpen(true)}>
                    <CopyPlus /> New version
                  </Button>
                  <Button size="sm" onClick={startEdit} disabled={t.usedByFinalRuns}>
                    <Pencil /> Edit
                  </Button>
                </>
              )}
              {editing && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                    <X /> Cancel
                  </Button>
                  <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || invalid.length > 0}>
                    <Save /> Save
                  </Button>
                </>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {t && (
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <Field label="Name">{editing ? <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /> : <div className="h-8 leading-8">{t.name}</div>}</Field>
              <Field label="Effective from">
                {editing ? <Input type="date" value={draft.effectiveFrom} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} /> : <div className="h-8 leading-8">{fmtDate(t.effectiveFrom)}</div>}
              </Field>
              <Field label="Effective to">
                {editing ? <Input type="date" value={draft.effectiveTo} onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value })} /> : <div className="h-8 leading-8">{t.effectiveTo ? fmtDate(t.effectiveTo) : 'open'}</div>}
              </Field>
            </div>
          )}
          {save.error && <Alert className="mb-2">{save.error.message}</Alert>}
          {invalid.length > 0 && <Alert tone="warning" className="mb-2">Some cells are not valid numbers. Use e.g. 3.50, leave blank for undefined, or type “forfeit”.</Alert>}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                {type === 'VOLUME' ? (
                  <>
                    <tr>
                      <th className="border-b border-border px-2 py-1 text-left" rowSpan={2}>
                        Term
                      </th>
                      <th className="border-b border-l border-border px-2 py-1 text-center" colSpan={CHANNELS.length}>
                        Standard
                      </th>
                      <th className="border-b border-l border-border px-2 py-1 text-center" colSpan={CHANNELS.length}>
                        Non-Standard
                      </th>
                    </tr>
                    <tr>
                      {VOLUME_COLS.map((c, i) => (
                        <th key={c.key} className={cn('border-b border-border px-2 py-1 text-right', i % CHANNELS.length === 0 && 'border-l')}>
                          {c.ch}
                        </th>
                      ))}
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th className="border-b border-border px-2 py-1 text-left">Term</th>
                    <th className="border-b border-border px-2 py-1 text-right">Rate (fraction, 0.80 = 80%)</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {TERM_BUCKETS.map((b) => (
                  <tr key={b} className="border-b border-border last:border-0">
                    <td className="px-2 py-1 font-medium">{TERM_BUCKET_LABELS[b]}</td>
                    {(type === 'VOLUME' ? VOLUME_COLS : [{ ch: null, pt: null, key: 'p' }]).map((c, i) => {
                      const v = value(c.ch, c.pt, b);
                      return (
                        <td key={c.key} className={cn('px-1 py-0.5 text-right', type === 'VOLUME' && i % CHANNELS.length === 0 && 'border-l border-border')}>
                          {editing ? (
                            <input
                              value={v ?? ''}
                              onChange={(e) => setCell(c.ch, c.pt, b, e.target.value)}
                              className={cn('num h-6 w-16 rounded border border-input bg-card px-1', v && v.toLowerCase() !== 'forfeit' && !isDecimalString(v) && 'border-destructive')}
                              placeholder="—"
                            />
                          ) : v === null ? (
                            <span className="text-muted-foreground" title="Undefined → EXCEPTION">
                              —
                            </span>
                          ) : v === 'forfeit' ? (
                            <Badge tone="outline">forfeit</Badge>
                          ) : (
                            <span className="num">{type === 'PRICE' ? `${stripZeros(v)} (${pct(v)})` : stripZeros(v)}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            “—” = undefined: lines that need this rate become EXCEPTIONs (never a guessed number). “forfeit” = defined as ₱0.
            {type === 'VOLUME' && ' RM always uses Non-Standard rates.'}
            {type === 'PRICE' && ' Which channels earn Price Commission is an engine setting (EU by default; TB is a flag).'}
          </p>
        </CardContent>
      </Card>

      <Dialog open={versionOpen} onOpenChange={setVersionOpen}>
        <DialogContent title="New version" description="Copies this table. The current version is closed the day before the new effective date.">
          <div className="flex flex-col gap-3">
            <Field label="Effective from">
              <Input type="date" value={versionFrom} onChange={(e) => setVersionFrom(e.target.value)} />
            </Field>
            {newVersion.error && <Alert>{newVersion.error.message}</Alert>}
            <Button onClick={() => newVersion.mutate()} disabled={!versionFrom || newVersion.isPending}>
              Create version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function stripZeros(v: string) {
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '.00').replace(/\.(\d)$/, '.$10') : v;
}
function pct(v: string) {
  const [i, f = ''] = v.split('.');
  const shifted = `${i}${(f + '00').slice(0, 2)}.${(f + '00').slice(2)}`.replace(/^0+(?=\d)/, '').replace(/\.?0+$/, '');
  return `${shifted || '0'}%`;
}

// ───────────────────────── pricelists ─────────────────────────

interface PricelistSummary {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  itemCount: number;
}
interface PricelistDetail {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  items: { id: string; productId: string; productCode: string; productName: string; price: string }[];
}
interface Product {
  id: string;
  eric6Code: string;
  name: string;
}

function Pricelists() {
  const qc = useQueryClient();
  const canWrite = can('rates:write');
  const list = useQuery({ queryKey: ['pricelists'], queryFn: () => api<PricelistSummary[]>('/rates/pricelists') });
  const products = useQuery({ queryKey: ['products-all'], queryFn: () => api<Paged<Product>>('/products?pageSize=500') });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const id = selectedId ?? list.data?.[0]?.id ?? null;
  const detail = useQuery({ queryKey: ['pricelist', id], queryFn: () => api<PricelistDetail>(`/rates/pricelists/${id}`), enabled: !!id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ name: string; effectiveFrom: string; effectiveTo: string; items: { productId: string; price: string }[] }>({ name: '', effectiveFrom: '', effectiveTo: '', items: [] });
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionFrom, setVersionFrom] = useState('');

  useEffect(() => setEditing(false), [id]);
  const productById = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.id, p])), [products.data]);

  const save = useMutation({
    mutationFn: () => api(`/rates/pricelists/${id}`, { method: 'PUT', json: { ...draft, effectiveTo: draft.effectiveTo || null, items: draft.items.filter((i) => i.productId) } }),
    onSuccess: () => {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ['pricelists'] });
      void qc.invalidateQueries({ queryKey: ['pricelist', id] });
    },
  });
  const newVersion = useMutation({
    mutationFn: () => api<PricelistDetail>(`/rates/pricelists/${id}/new-version`, { method: 'POST', json: { effectiveFrom: versionFrom } }),
    onSuccess: (p) => {
      setVersionOpen(false);
      setSelectedId(p.id);
      void qc.invalidateQueries({ queryKey: ['pricelists'] });
    },
  });

  const d = detail.data;
  const invalid = draft.items.some((i) => !isDecimalString(i.price));

  return (
    <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Pricelists</CardTitle>
        </CardHeader>
        {list.data?.map((v) => (
          <button key={v.id} onClick={() => setSelectedId(v.id)} className={cn('block w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-accent/50', v.id === id && 'bg-accent')}>
            <div className="text-[13px] font-medium">{v.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {fmtDate(v.effectiveFrom)} – {v.effectiveTo ? fmtDate(v.effectiveTo) : 'open'} · {v.itemCount} items
            </div>
          </button>
        ))}
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{d?.name ?? '—'}</CardTitle>
          {d && canWrite && (
            <div className="flex gap-2">
              {!editing ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setVersionOpen(true)}>
                    <CopyPlus /> New version
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDraft({ name: d.name, effectiveFrom: d.effectiveFrom, effectiveTo: d.effectiveTo ?? '', items: d.items.map((i) => ({ productId: i.productId, price: stripZeros(i.price) })) });
                      setEditing(true);
                    }}
                  >
                    <Pencil /> Edit
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                    <X /> Cancel
                  </Button>
                  <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || invalid}>
                    <Save /> Save
                  </Button>
                </>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {d && (
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <Field label="Name">{editing ? <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /> : <div className="h-8 leading-8">{d.name}</div>}</Field>
              <Field label="Effective from">
                {editing ? <Input type="date" value={draft.effectiveFrom} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} /> : <div className="h-8 leading-8">{fmtDate(d.effectiveFrom)}</div>}
              </Field>
              <Field label="Effective to">
                {editing ? <Input type="date" value={draft.effectiveTo} onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value })} /> : <div className="h-8 leading-8">{d.effectiveTo ? fmtDate(d.effectiveTo) : 'open'}</div>}
              </Field>
            </div>
          )}
          {save.error && <Alert className="mb-2">{save.error.message}</Alert>}
          <div className="overflow-auto rounded-lg border border-border" style={{ maxHeight: 'calc(100vh - 330px)' }}>
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="border-b border-border px-2 py-1 text-left">Item code</th>
                  <th className="border-b border-border px-2 py-1 text-left">Product</th>
                  <th className="border-b border-border px-2 py-1 text-right">SRP</th>
                  {editing && <th className="w-8 border-b border-border" />}
                </tr>
              </thead>
              <tbody>
                {!editing &&
                  d?.items.map((i) => (
                    <tr key={i.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-1 font-mono">{i.productCode}</td>
                      <td className="px-2 py-1">{i.productName}</td>
                      <td className="px-2 py-1 text-right">
                        <Peso value={i.price} />
                      </td>
                    </tr>
                  ))}
                {editing &&
                  draft.items.map((i, idx) => (
                    <tr key={idx} className="border-b border-border last:border-0">
                      <td className="px-1 py-0.5" colSpan={2}>
                        <Select
                          value={i.productId}
                          onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === idx ? { ...x, productId: e.target.value } : x)) })}
                          className="h-7"
                        >
                          <option value="">Select product…</option>
                          {products.data?.items.map((p) => (
                            <option key={p.id} value={p.id} disabled={p.id !== i.productId && draft.items.some((x) => x.productId === p.id)}>
                              {p.eric6Code} · {p.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-1 py-0.5 text-right">
                        <input
                          value={i.price}
                          onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === idx ? { ...x, price: e.target.value } : x)) })}
                          className={cn('num h-7 w-28 rounded border border-input bg-card px-1', !isDecimalString(i.price) && 'border-destructive')}
                        />
                      </td>
                      <td className="px-1 text-center">
                        <button onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== idx) })} aria-label="Remove" className="rounded p-1 hover:bg-accent">
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {editing && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setDraft({ ...draft, items: [...draft.items, { productId: '', price: '0.00' }] })}>
              <Plus /> Add item
            </Button>
          )}
          {!editing && d && productById.size > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Products without an SRP here: {[...productById.values()].filter((p) => !d.items.some((i) => i.productId === p.id)).map((p) => p.eric6Code).join(', ') || 'none'}
            </p>
          )}
        </CardContent>
      </Card>
      <Dialog open={versionOpen} onOpenChange={setVersionOpen}>
        <DialogContent title="New pricelist version" description="Copies all items. The current version is closed the day before.">
          <div className="flex flex-col gap-3">
            <Field label="Effective from">
              <Input type="date" value={versionFrom} onChange={(e) => setVersionFrom(e.target.value)} />
            </Field>
            {newVersion.error && <Alert>{newVersion.error.message}</Alert>}
            <Button onClick={() => newVersion.mutate()} disabled={!versionFrom || newVersion.isPending}>
              Create version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

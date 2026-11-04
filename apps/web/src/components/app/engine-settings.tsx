/** Engine settings, each with a plain name, what it does, its value in words, and a simple editor. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { ACCOUNT_TYPES, CHANNEL_LABELS, CHANNELS, engineSettingProblem, formatPHP, isDecimalString, TERM_BUCKET_LABELS, TERM_BUCKETS, type TermBucket } from '@ocs/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Badge, Card, CardHeader, CardTitle, Field, Input, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { can } from '@/lib/auth';
import { fmtDate, plural, todayIso } from '@/lib/utils';

export interface EngineSetting {
  id: string;
  key: string;
  value: unknown;
  effectiveFrom: string;
  isConfidential: boolean;
  description: string | null;
}

const INFO: Record<string, { name: string; help: string }> = {
  priceCommissionChannels: { name: 'Channels that earn price commission', help: 'Price commission is paid when a line in one of these channels is sold above SRP.' },
  forceNonStandardChannels: { name: 'Channels always on Non-Standard rates', help: 'Lines in these channels always use the Non-Standard volume rates.' },
  asEligibleAccountTypes: { name: 'Account types that pay the Account Specialist', help: "Only lines from these customers' account types earn Account Specialist commission." },
  rateDateBasis: { name: 'Rate date', help: 'When rates change, this date decides which rate version a line uses.' },
  collectionTolerance: { name: 'Collection tolerance', help: 'An invoice short by this amount or less still counts as fully collected.' },
  statedTermMap: { name: 'Stated terms', help: 'The term bucket each ERIC6 stated term starts in. A stated term that isn’t listed holds the line as an exception.' },
  buckets: { name: 'Term bucket limits', help: 'The last day of each term bucket. Anything collected later falls in “beyond 120 days”.' },
  graceDays: { name: 'Grace period', help: 'Extra days allowed after a term limit before a collection moves to the next bucket.' },
};
const ORDER = Object.keys(INFO);
const ACCOUNT_TYPE_LABELS: Record<string, string> = { AS_GENERATED: 'AS-generated', SS_GENERATED: 'SS-generated', IN_HOUSE: 'In-house' };
const RATE_DATES = [
  { value: 'INVOICE_DATE', label: 'Invoice date', help: 'The rate in effect when the invoice was issued.' },
  { value: 'RECOGNITION_DATE', label: 'Date the invoice was fully paid', help: 'The rate in effect when the last payment cleared.' },
];
const LIMITED_BUCKETS = TERM_BUCKETS.slice(0, -1);

type Bucket = { bucket: TermBucket; days: number | null };
type TermRow = { days: string; bucket: string };
type Draft = string | string[] | TermRow[];

const byDays = (a: [string, unknown], b: [string, unknown]) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10);
const termLabel = (days: string) => (days === '0' ? 'COD (0 days)' : `${days} days`);
const bucketLabel = (b: string) => TERM_BUCKET_LABELS[b as TermBucket] ?? b;

/** A setting's value in words. */
function describe(key: string, v: unknown): string {
  const list = (items: unknown, label: (x: string) => string) => (Array.isArray(items) && items.length > 0 ? items.map((x) => label(String(x))).join(', ') : 'none');
  switch (key) {
    case 'graceDays':
      return `${String(v)} days`;
    case 'collectionTolerance':
      return isDecimalString(String(v)) ? formatPHP(String(v)) : String(v);
    case 'rateDateBasis':
      return RATE_DATES.find((r) => r.value === v)?.label ?? String(v);
    case 'priceCommissionChannels':
    case 'forceNonStandardChannels':
      return list(v, (c) => `${CHANNEL_LABELS[c as keyof typeof CHANNEL_LABELS] ?? c} (${c})`);
    case 'asEligibleAccountTypes':
      return list(v, (a) => ACCOUNT_TYPE_LABELS[a] ?? a);
    case 'statedTermMap':
      return Object.entries((v ?? {}) as Record<string, string>)
        .sort(byDays)
        .map(([days, b]) => `${termLabel(days)} → ${bucketLabel(b)}`)
        .join(' · ');
    case 'buckets':
      return `${(v as Bucket[])
        .filter((b) => b.days !== null)
        .map((b) => `${bucketLabel(b.bucket)} up to day ${b.days}`)
        .join(' · ')} · then beyond 120 days`;
    default:
      return JSON.stringify(v);
  }
}

function toDraft(key: string, v: unknown): Draft {
  switch (key) {
    case 'graceDays':
    case 'collectionTolerance':
    case 'rateDateBasis':
      return String(v ?? '');
    case 'priceCommissionChannels':
    case 'forceNonStandardChannels':
    case 'asEligibleAccountTypes':
      return Array.isArray(v) ? v.map(String) : [];
    case 'buckets':
      return LIMITED_BUCKETS.map((b) => String((v as Bucket[]).find((x) => x.bucket === b)?.days ?? ''));
    case 'statedTermMap':
      return Object.entries((v ?? {}) as Record<string, string>)
        .sort(byDays)
        .map(([days, bucket]) => ({ days, bucket }));
    default:
      return JSON.stringify(v, null, 2);
  }
}

const toDays = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));

/** The draft back to the stored value, or a message saying what to fix. */
function fromDraft(key: string, d: Draft): { value?: unknown; error?: string } {
  switch (key) {
    case 'graceDays':
      return { value: toDays(d as string) };
    case 'collectionTolerance':
      return { value: (d as string).trim() };
    case 'rateDateBasis':
      return { value: d };
    case 'priceCommissionChannels':
    case 'forceNonStandardChannels':
      return { value: CHANNELS.filter((c) => (d as string[]).includes(c)) };
    case 'asEligibleAccountTypes':
      return { value: ACCOUNT_TYPES.filter((a) => (d as string[]).includes(a)) };
    case 'buckets':
      return { value: TERM_BUCKETS.map((bucket, i) => ({ bucket, days: i < LIMITED_BUCKETS.length ? toDays((d as string[])[i] ?? '') : null })) };
    case 'statedTermMap': {
      const rows = (d as TermRow[]).filter((r) => r.days.trim() !== '').map((r) => ({ ...r, days: /^\d+$/.test(r.days.trim()) ? String(Number.parseInt(r.days.trim(), 10)) : r.days.trim() }));
      if (new Set(rows.map((r) => r.days)).size !== rows.length) return { error: 'Each stated term can only be listed once.' };
      return { value: Object.fromEntries(rows.map((r) => [r.days, r.bucket])) };
    }
    default:
      try {
        return { value: JSON.parse(d as string) as unknown };
      } catch {
        return { error: 'The value isn’t valid JSON.' };
      }
  }
}

export function EngineSettingsCard({ settings }: { settings: EngineSetting[] }) {
  const [editing, setEditing] = useState<EngineSetting | null>(null);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const today = todayIso();
  // Rows come newest first within each key, so the first row of a key is its latest version.
  const byKey = new Map<string, EngineSetting[]>();
  for (const s of settings) byKey.set(s.key, [...(byKey.get(s.key) ?? []), s]);
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
  const keys = [...byKey.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engine settings</CardTitle>
      </CardHeader>
      <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">The rules the calculation uses. A change starts on the date you pick; runs already calculated keep the settings they used.</p>
      {keys.map((key) => {
        const [latest, ...older] = byKey.get(key)!;
        if (!latest) return null;
        const upcoming = latest.effectiveFrom > today;
        return (
          <div key={key} className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5 last:border-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold">{INFO[key]?.name ?? key}</span>
                {latest.isConfidential && <Badge tone="danger">confidential · Finance and Admin only</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{INFO[key]?.help ?? latest.description}</div>
              <div className="mt-1 text-[13px] font-medium">{describe(key, latest.value)}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {upcoming ? `starts ${fmtDate(latest.effectiveFrom)}` : `since ${fmtDate(latest.effectiveFrom)}`}
                {older.length > 0 && (
                  <>
                    {' · '}
                    <button type="button" className="text-primary hover:underline" onClick={() => setHistoryKey(historyKey === key ? null : key)}>
                      {historyKey === key ? 'hide' : 'show'} {plural(older.length, 'earlier version')}
                    </button>
                  </>
                )}
              </div>
              {historyKey === key &&
                older.map((o) => (
                  <div key={o.id} className="text-[11px] text-muted-foreground">
                    from {fmtDate(o.effectiveFrom)}: {describe(key, o.value)}
                  </div>
                ))}
            </div>
            {can('settings:confidential') && (
              <Button variant="outline" size="sm" onClick={() => setEditing(latest)}>
                Change
              </Button>
            )}
          </div>
        );
      })}
      {editing && <ChangeDialog key={editing.id} setting={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function ChangeDialog({ setting, onClose }: { setting: EngineSetting; onClose: () => void }) {
  const qc = useQueryClient();
  const key = setting.key;
  const [draft, setDraft] = useState<Draft>(() => toDraft(key, setting.value));
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: unknown) => api(`/settings/engine/${key}`, { method: 'PUT', json: { value, effectiveFrom } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['engine-settings'] });
      onClose();
    },
  });
  const submit = () => {
    const { value, error } = fromDraft(key, draft);
    const p = error ?? engineSettingProblem(key, value);
    setProblem(p);
    if (!p) save.mutate(value);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Change: ${INFO[key]?.name ?? key}`} description={INFO[key]?.help ?? setting.description ?? undefined}>
        <div className="flex flex-col gap-3">
          {setting.isConfidential && <Alert tone="warning">Confidential: never shown to the Sales and RSR teams.</Alert>}
          <div className="text-xs text-muted-foreground">Now: {describe(key, setting.value)}</div>
          <Editor settingKey={key} draft={draft} setDraft={setDraft} />
          <Field label="Starts on" hint="Runs already calculated keep the settings they used.">
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="w-44" />
          </Field>
          {(problem || save.error) && <Alert>{problem ?? save.error?.message}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Editor({ settingKey: key, draft, setDraft }: { settingKey: string; draft: Draft; setDraft: (d: Draft) => void }) {
  const checkboxes = (options: { value: string; label: string }[]) => {
    const picked = draft as string[];
    return (
      <div className="flex flex-col gap-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={picked.includes(o.value)} onChange={() => setDraft(picked.includes(o.value) ? picked.filter((x) => x !== o.value) : [...picked, o.value])} />
            {o.label}
          </label>
        ))}
      </div>
    );
  };

  switch (key) {
    case 'graceDays':
      return (
        <div className="flex items-center gap-2 text-[13px]">
          <Input type="number" min={0} step={1} value={draft as string} onChange={(e) => setDraft(e.target.value)} className="w-28" /> days
        </div>
      );
    case 'collectionTolerance':
      return (
        <div className="flex items-center gap-2 text-[13px]">
          ₱ <Input inputMode="decimal" value={draft as string} onChange={(e) => setDraft(e.target.value)} className="w-36" />
        </div>
      );
    case 'rateDateBasis':
      return (
        <div className="flex flex-col gap-2">
          {RATE_DATES.map((r) => (
            <label key={r.value} className="flex items-start gap-2 text-[13px]">
              <input type="radio" name="rateDateBasis" className="mt-1" checked={draft === r.value} onChange={() => setDraft(r.value)} />
              <span>
                <span className="font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.help}</span>
              </span>
            </label>
          ))}
        </div>
      );
    case 'priceCommissionChannels':
    case 'forceNonStandardChannels':
      return checkboxes(CHANNELS.map((c) => ({ value: c, label: `${c} · ${CHANNEL_LABELS[c]}` })));
    case 'asEligibleAccountTypes':
      return checkboxes(ACCOUNT_TYPES.map((a) => ({ value: a, label: ACCOUNT_TYPE_LABELS[a] ?? a })));
    case 'buckets': {
      const limits = draft as string[];
      return (
        <div className="flex flex-col gap-1.5 text-[13px]">
          {LIMITED_BUCKETS.map((b, i) => (
            <label key={b} className="flex items-center gap-2">
              <span className="w-24">{bucketLabel(b)}</span>
              up to day
              <Input type="number" min={0} step={1} value={limits[i] ?? ''} onChange={(e) => setDraft(limits.map((x, j) => (j === i ? e.target.value : x)))} className="w-24" />
            </label>
          ))}
          <span className="text-xs text-muted-foreground">Beyond 120 days: anything collected after the 120-day limit.</span>
        </div>
      );
    }
    case 'statedTermMap': {
      const rows = draft as TermRow[];
      const update = (i: number, patch: Partial<TermRow>) => setDraft(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
      return (
        <div className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span className="w-24">Stated term</span>
            <span>Starts in bucket</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="number" min={0} step={1} value={r.days} onChange={(e) => update(i, { days: e.target.value })} className="w-24" aria-label="Stated term in days" />
              <span className="text-muted-foreground">days →</span>
              <Select value={r.bucket} onChange={(e) => update(i, { bucket: e.target.value })} className="w-44" aria-label="Term bucket">
                {TERM_BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {bucketLabel(b)}
                  </option>
                ))}
              </Select>
              <button type="button" className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Remove this stated term" onClick={() => setDraft(rows.filter((_, j) => j !== i))}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="self-start" onClick={() => setDraft([...rows, { days: '', bucket: 'D30' }])}>
            <Plus /> Add a stated term
          </Button>
          <span className="text-xs text-muted-foreground">0 days means COD.</span>
        </div>
      );
    }
    default:
      return (
        <Field label="Value (JSON)">
          <textarea
            rows={6}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft as string}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Field>
      );
  }
}

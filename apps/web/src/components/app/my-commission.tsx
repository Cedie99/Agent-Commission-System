/** "My commission": the dashboard a Sales or RSR team member sees after signing in. */
import { Link } from '@tanstack/react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { Fragment, useState } from 'react';
import { D, formatDecimal, formatPHP, sum, type Decimal, type MyCommissionView, type MyWeekView, type ResultLineView, type WaitingInvoiceView } from '@ocs/shared';
import { bucketLabel, StatusBadge } from '@/components/app/format';
import { Alert, Card, CardHeader, CardTitle, PageHeader, Select } from '@/components/ui/primitives';
import { api, type Paged } from '@/lib/api';
import { cn, fmtRange, monthLabel, recentMonths, todayIso } from '@/lib/utils';

/** Lines loaded for one week; more than this is rare, and "Open the week" shows them all. */
const LINES_PAGE = 500;
/** Invoices listed under "Waiting for full payment" before "and N more". */
const WAITING_SHOWN = 6;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const runTypeLabel = (t: string | null) => (t === 'AS_WEEKLY' ? 'AS weekly' : t === 'SP_MONTHLY' ? 'SP monthly' : '');
const pricingLabel = (p: string | null) => (p === 'STANDARD' ? 'Standard' : p === 'NON_STANDARD' ? 'Non-Standard' : '—');
const componentLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

export function MyCommissionDashboard() {
  const [month, setMonth] = useState<string>();
  const [pickedRunId, setPickedRunId] = useState<string | null>(null);
  const view = useQuery({
    queryKey: ['my-commission', month ?? 'latest'],
    queryFn: () => api<MyCommissionView>(`/my-commission${month ? `?month=${month}` : ''}`),
    placeholderData: keepPreviousData,
  });

  if (view.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (view.error) return <Alert>{view.error.message}</Alert>;
  const v = view.data;
  if (!v) return null;

  const p = v.person;
  const t = v.totals;
  const runWeeks = v.weeks.filter((w) => w.runId !== null);
  const unlocked = runWeeks.filter((w) => w.status !== 'LOCKED');
  const selected = runWeeks.find((w) => w.runId === pickedRunId) ?? runWeeks.find((w) => w.runId === v.latestRunId) ?? null;
  const months = [...new Set([v.month, ...recentMonths(12)])].sort().reverse();
  const monthName = monthLabel(v.month, false);

  const approvedSub = runWeeks.length === 0 ? 'no approved weeks yet' : `${plural(runWeeks.length, 'week')} · ${fmtRange(runWeeks[0]!.periodStart, runWeeks[runWeeks.length - 1]!.periodEnd)}`;
  const lockedSub =
    runWeeks.length === 0
      ? 'nothing locked yet'
      : unlocked.length === 0
        ? `all ${plural(runWeeks.length, 'week')} locked`
        : unlocked.length === 1
          ? `${fmtRange(unlocked[0]!.periodStart, unlocked[0]!.periodEnd)} is approved, not locked yet`
          : `${unlocked.length} weeks are approved, not locked yet`;

  return (
    <>
      <PageHeader
        title="My commission"
        description={[p.code, p.roleName, p.team, p.managerCode && `reports to ${p.managerCode}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <label htmlFor="my-month" className="text-xs text-muted-foreground">
              Month
            </label>
            <Select
              id="my-month"
              value={v.month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPickedRunId(null);
              }}
              className="w-40"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </>
        }
      />

      {p.role !== 'AS' && (
        <Alert tone="info" className="mb-3">
          The system doesn't calculate {p.roleName} incentives yet. They'll appear here once Finance sets the rules.
        </Alert>
      )}

      <Card className="mb-3 flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0 text-ring" />
        Amounts appear once Finance approves a week, and become final when the week is locked.
      </Card>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={`Approved in ${monthName}`} value={formatPHP(t.approved)} sub={approvedSub} accent />
        <Tile label="Final (locked)" value={formatPHP(t.locked)} sub={lockedSub} />
        <Tile label="Volume commission" value={formatPHP(t.volume)} sub={`${plural(t.lineCount, 'line')} · ${formatDecimal(t.liters)} L`} />
        <Tile label="Price commission" value={formatPHP(t.price)} sub={t.priceLineCount > 0 ? `${plural(t.priceLineCount, 'line')} sold above SRP` : 'no lines sold above SRP'} />
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-[3fr_2fr]">
        <WeekChart monthName={monthName} weeks={v.weeks} selectedRunId={selected?.runId ?? null} onSelect={setPickedRunId} />
        <NotPaidYet waiting={v.waitingForPayment} held={v.heldForReview} />
      </div>

      {selected ? (
        <WeekLines key={selected.runId} week={selected} />
      ) : (
        <Card className="px-3 py-6 text-center text-[13px] text-muted-foreground">No approved weeks in {monthLabel(v.month)} yet.</Card>
      )}
    </>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <Card className="flex flex-col gap-1 px-3.5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('font-mono text-[22px] font-medium tabular-nums', accent && 'text-primary')}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}

function WeekChart({ monthName, weeks, selectedRunId, onSelect }: { monthName: string; weeks: MyWeekView[]; selectedRunId: string | null; onSelect: (runId: string) => void }) {
  const today = todayIso();
  const max = weeks.reduce<Decimal>((m, w) => (D(w.total).gt(m) ? D(w.total) : m), D('0'));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{monthName} by week</CardTitle>
        <div className="flex gap-3.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-primary" />
            Volume
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#7fa3cf]" />
            Price
          </span>
        </div>
      </CardHeader>
      <div className="grid items-end gap-3 px-3.5 pb-3.5 pt-4" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w) => (
          <WeekBar key={`${w.periodStart}/${w.runId ?? ''}`} week={w} max={max} today={today} selected={w.runId !== null && w.runId === selectedRunId} onSelect={onSelect} />
        ))}
      </div>
    </Card>
  );
}

function WeekBar({ week: w, max, today, selected, onSelect }: { week: MyWeekView; max: Decimal; today: string; selected: boolean; onSelect: (runId: string) => void }) {
  const total = D(w.total);
  const label = fmtRange(w.periodStart, w.periodEnd);
  if (w.runId === null) {
    const state = today < w.periodStart ? 'upcoming' : today <= w.periodEnd ? 'this week' : 'nothing approved';
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className={cn('h-[150px] w-full border-b', state === 'nothing approved' ? 'border-input' : 'border-dashed border-muted-foreground/40')} />
        <div className={cn('text-center text-[11px] font-medium', state === 'upcoming' && 'text-muted-foreground')}>{label}</div>
        <div className="text-center text-[11px] text-muted-foreground">{state}</div>
      </div>
    );
  }
  // Heights are computed with Decimal and handed to CSS as strings: money never becomes a JS number.
  const heightPct = max.gt(0) ? total.div(max).times(100).toFixed(2) : '0';
  const pricePct = total.gt(0) ? D(w.price).div(total).times(100).toFixed(2) : '0';
  const runId = w.runId;
  return (
    <button
      type="button"
      onClick={() => onSelect(runId)}
      aria-pressed={selected}
      title={`Show the lines for ${label}`}
      className={cn('flex flex-col items-center gap-1.5 rounded-md px-1 pb-1 hover:bg-accent/60', selected && 'bg-accent/60')}
    >
      <div className="flex h-[150px] w-full flex-col items-center justify-end border-b border-input">
        <div className="mb-1 font-mono text-[11px] tabular-nums">{formatPHP(w.total)}</div>
        {total.gt(0) && (
          <div className="flex w-[56%] flex-col overflow-hidden rounded-t-[3px]" style={{ height: `max(3px, calc(124px * ${heightPct} / 100))` }}>
            <div className="bg-[#7fa3cf]" style={{ height: `${pricePct}%` }} />
            <div className="flex-1 bg-primary" />
          </div>
        )}
      </div>
      <div className="text-center text-[11px] font-medium">{label}</div>
      <StatusBadge status={w.status ?? 'APPROVED'} />
    </button>
  );
}

function NotPaidYet({ waiting, held }: { waiting: MyCommissionView['waitingForPayment']; held: number }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Not paid yet</CardTitle>
      </CardHeader>
      <div className="px-3.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Waiting for full payment · {waiting.count}</div>
      {waiting.count === 0 && <p className="px-3.5 pb-2 text-xs text-muted-foreground">No invoices waiting for payment.</p>}
      {waiting.items.slice(0, WAITING_SHOWN).map((w) => (
        <WaitingRow key={w.invoiceNo} invoice={w} />
      ))}
      {waiting.count > WAITING_SHOWN && <p className="px-3.5 py-2 text-xs text-muted-foreground">and {waiting.count - WAITING_SHOWN} more</p>}
      <div className="px-3.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Held for review · {held}</div>
      <p className="px-3.5 pb-3.5 text-xs">{held === 0 ? 'Nothing is being held.' : `${held === 1 ? 'One line is' : `${held} lines are`} with Finance for review.`}</p>
    </Card>
  );
}

function WaitingRow({ invoice: w }: { invoice: WaitingInvoiceView }) {
  const collected = D(w.collected);
  const paidPct = D(w.total).gt(0) ? collected.div(D(w.total)).times(100).toFixed(2) : '0';
  const note = w.note === 'BOUNCED' ? 'check bounced' : w.note === 'NOT_CLEARED' ? 'check not cleared yet' : null;
  return (
    <div className="flex flex-col gap-1 border-b border-border px-3.5 py-2">
      <div className="flex justify-between gap-2 font-mono text-xs tabular-nums">
        <span>{w.invoiceNo}</span>
        <span>
          {formatPHP(w.collected)} of {formatPHP(w.total)}
        </span>
      </div>
      <div className={cn('text-xs', w.note === 'BOUNCED' ? 'text-destructive' : 'text-muted-foreground')}>
        {w.customerName}
        {note && ` · ${note}`}
      </div>
      {collected.gt(0) && (
        <div className="h-1 rounded bg-muted">
          <div className="h-1 rounded bg-ring" style={{ width: `${paidPct}%` }} />
        </div>
      )}
    </div>
  );
}

function WeekLines({ week }: { week: MyWeekView }) {
  const runId = week.runId!;
  /** undefined: the first line starts open, so it's clear each line can be opened. */
  const [openId, setOpenId] = useState<string | null>();
  const lines = useQuery({
    queryKey: ['my-week-lines', runId],
    queryFn: () => api<Paged<ResultLineView>>(`/compute-runs/${runId}/results?pageSize=${LINES_PAGE}`),
  });
  const items = lines.data?.items ?? [];
  const open = openId === undefined ? (items[0]?.id ?? null) : openId;
  const multiLine = new Set(items.filter((l, i) => l.lineNo > 1 || items.findIndex((x) => x.invoiceNo === l.invoiceNo) !== i).map((l) => l.invoiceNo));
  const amountOf = (l: ResultLineView, type: string) => l.components.find((c) => c.type === type)?.amount ?? null;
  const total = (pick: (l: ResultLineView) => string | null) => sum(items.map(pick).flatMap((x) => (x === null ? [] : [D(x)])));
  const partial = (lines.data?.total ?? 0) > items.length;
  const cell = 'px-3 py-1.5';
  const num = 'px-3 py-1.5 text-right font-mono text-[12px] tabular-nums';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>
            {fmtRange(week.periodStart, week.periodEnd, true)} · {runTypeLabel(week.runType)}
          </CardTitle>
          <StatusBadge status={week.status ?? 'APPROVED'} />
        </div>
        <Link to="/runs/$runId" params={{ runId }} className="text-xs text-primary hover:underline">
          Open the week
        </Link>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12.5px]">
          <thead className="bg-muted text-[11px] text-muted-foreground">
            <tr>
              <th className={cn(cell, 'text-left font-medium')}>Invoice</th>
              <th className={cn(cell, 'text-left font-medium')}>Customer</th>
              <th className={cn(cell, 'text-left font-medium')}>Channel</th>
              <th className={cn(cell, 'text-right font-medium')}>Liters</th>
              <th className={cn(cell, 'text-left font-medium')}>Term</th>
              <th className={cn(cell, 'text-left font-medium')}>Pricing</th>
              <th className={cn(cell, 'text-right font-medium')}>Volume</th>
              <th className={cn(cell, 'text-right font-medium')}>Price</th>
              <th className={cn(cell, 'text-right font-medium')}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.isLoading && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {lines.error && (
              <tr>
                <td colSpan={9} className="px-3 py-3">
                  <Alert>{lines.error.message}</Alert>
                </td>
              </tr>
            )}
            {lines.data && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">
                  None of your lines earned commission this week.
                </td>
              </tr>
            )}
            {items.map((l) => {
              const isOpen = l.id === open;
              const toggle = () => setOpenId(isOpen ? null : l.id);
              const vol = amountOf(l, 'VOLUME');
              const price = amountOf(l, 'PRICE');
              return (
                <Fragment key={l.id}>
                  <tr className={cn('cursor-pointer border-t border-border hover:bg-accent/40', isOpen && 'bg-accent/30')} onClick={toggle}>
                    <td className={cell}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        title="Show how this line was worked out"
                        className="font-mono text-[12px] text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle();
                        }}
                      >
                        {l.invoiceNo}
                        {multiLine.has(l.invoiceNo) && ` #${l.lineNo}`}
                      </button>
                    </td>
                    <td className={cn(cell, 'max-w-[260px] truncate')} title={l.customerName}>
                      {l.customerName}
                    </td>
                    <td className={cell}>{l.channel}</td>
                    <td className={num}>{formatDecimal(l.liters)}</td>
                    <td className={cell}>{bucketLabel(l.termBucket)}</td>
                    <td className={cell}>{pricingLabel(l.pricingType)}</td>
                    <td className={num}>{vol === null ? <span className="text-muted-foreground">—</span> : formatDecimal(vol)}</td>
                    <td className={num}>{price === null ? <span className="text-muted-foreground">—</span> : formatDecimal(price)}</td>
                    <td className={cn(num, 'font-medium')}>{formatDecimal(l.totalAmount)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-accent/30">
                      <td colSpan={9} className="px-3 pb-2.5 pl-6 font-mono text-[11.5px] leading-relaxed text-foreground/80">
                        {l.components.map((c) => (
                          <div key={c.id}>
                            {componentLabel(c.type)}: {c.explanation}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {items.length > 0 && (
            <tfoot className="bg-muted font-semibold">
              <tr className="border-t border-border">
                <td colSpan={3} className="px-3 py-2">
                  {partial ? 'Shown lines' : 'Total'} · {plural(items.length, 'line')}
                </td>
                <td className={num}>{formatDecimal(total((l) => l.liters))}</td>
                <td colSpan={2} />
                <td className={num}>{formatDecimal(total((l) => amountOf(l, 'VOLUME')))}</td>
                <td className={num}>{formatDecimal(total((l) => amountOf(l, 'PRICE')))}</td>
                <td className={cn(num, 'text-primary')}>{formatPHP(total((l) => l.totalAmount))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {partial && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Showing the first {items.length} of {lines.data?.total} lines. Open the week to see them all.
        </p>
      )}
    </Card>
  );
}

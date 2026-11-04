/**
 * Pure logic behind the agent's "My commission" dashboard (GET /my-commission).
 * No DB and no Nest, so it is unit-tested directly (test/my-commission.test.ts).
 *
 * Month grouping is for display only and never changes an amount: a run belongs to the month
 * that holds the middle day of its period. For a Mon–Sun week that is the Thursday, so a week
 * that straddles two months goes to the month holding most of its days (the ISO 8601 rule)
 * and is never counted in both months.
 */
import { addDays, daysBetween, resolveCollection, type InvoiceContext } from '@ocs/engine';
import { sum, type Decimal, type MyCommissionTotals, type MyWeekView, type RunStatus, type RunType, type WaitingInvoiceView } from '@ocs/shared';

/** The 'YYYY-MM' month a period belongs to: the month of its middle day. */
export function monthOf(periodStart: string, periodEnd: string): string {
  return addDays(periodStart, Math.floor(daysBetween(periodStart, periodEnd) / 2)).slice(0, 7);
}

/** First and last calendar day of a 'YYYY-MM' month. */
export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map((p) => Number.parseInt(p, 10)) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { first: `${month}-01`, last: addDays(next, -1) };
}

const A_MONDAY = '2024-01-01';

/** 0 = Monday … 6 = Sunday. */
export function weekday(d: string): number {
  return ((daysBetween(A_MONDAY, d) % 7) + 7) % 7;
}

/** The Mon–Sun weeks that belong to `month`: those whose Thursday falls in it. */
export function weekSlots(month: string): { periodStart: string; periodEnd: string }[] {
  const { first } = monthBounds(month);
  const slots: { periodStart: string; periodEnd: string }[] = [];
  for (let thursday = addDays(first, (10 - weekday(first)) % 7); thursday.startsWith(month); thursday = addDays(thursday, 7)) {
    slots.push({ periodStart: addDays(thursday, -3), periodEnd: addDays(thursday, 3) });
  }
  return slots;
}

/** An APPROVED or LOCKED run that may belong to the month. */
export interface MonthRun {
  id: string;
  runType: RunType;
  periodStart: string;
  periodEnd: string;
  status: RunStatus;
}

/** One commission component of mine, with the liters of its invoice line. */
export interface MyComponent {
  runId: string;
  resultLineId: string;
  type: string;
  amount: Decimal;
  liters: Decimal;
}

const amountOf = (cs: MyComponent[], type?: string) => sum(cs.filter((c) => type === undefined || c.type === type).map((c) => c.amount));
const byEndDesc = (a: MyWeekView, b: MyWeekView) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart);

/**
 * Totals and weeks for one month. Amounts are sums of the stored (already rounded) components,
 * so they foot to the run totals. Runs whose period belongs to another month are ignored.
 * `weekly` adds the month's Mon–Sun weeks that no run covers (weekly-paid roles only).
 */
export function summarizeMonth(
  month: string,
  runs: MonthRun[],
  components: MyComponent[],
  weekly = true,
): { totals: MyCommissionTotals; weeks: MyWeekView[]; latestRunId: string | null } {
  const inMonth = runs.filter((r) => monthOf(r.periodStart, r.periodEnd) === month);
  const runIds = new Set(inMonth.map((r) => r.id));
  const mine = components.filter((c) => runIds.has(c.runId));

  const byRun = new Map<string, MyComponent[]>();
  for (const c of mine) byRun.set(c.runId, [...(byRun.get(c.runId) ?? []), c]);

  const runWeeks: MyWeekView[] = inMonth.map((r) => {
    const cs = byRun.get(r.id) ?? [];
    return {
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      runId: r.id,
      runType: r.runType,
      status: r.status,
      volume: amountOf(cs, 'VOLUME').toFixed(2),
      price: amountOf(cs, 'PRICE').toFixed(2),
      total: amountOf(cs).toFixed(2),
      lineCount: new Set(cs.map((c) => c.resultLineId)).size,
    };
  });
  // Weeks of the month that no approved run covers stay visible, with no amount.
  const openWeeks: MyWeekView[] = (weekly ? weekSlots(month) : [])
    .filter((s) => !inMonth.some((r) => r.periodStart <= s.periodEnd && r.periodEnd >= s.periodStart))
    .map((s) => ({ ...s, runId: null, runType: null, status: null, volume: '0.00', price: '0.00', total: '0.00', lineCount: 0 }));
  const weeks = [...runWeeks, ...openWeeks].sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.periodEnd.localeCompare(b.periodEnd));

  const lockedIds = new Set(inMonth.filter((r) => r.status === 'LOCKED').map((r) => r.id));
  const litersByLine = new Map(mine.map((c) => [c.resultLineId, c.liters]));
  const priceLines = new Set(mine.filter((c) => c.type === 'PRICE' && c.amount.gt(0)).map((c) => c.resultLineId));
  const totals: MyCommissionTotals = {
    approved: amountOf(mine).toFixed(2),
    locked: amountOf(mine.filter((c) => lockedIds.has(c.runId))).toFixed(2),
    volume: amountOf(mine, 'VOLUME').toFixed(2),
    price: amountOf(mine, 'PRICE').toFixed(2),
    lineCount: litersByLine.size,
    liters: sum(litersByLine.values()).toFixed(2),
    priceLineCount: priceLines.size,
    approvedWeeks: inMonth.length,
    lockedWeeks: lockedIds.size,
  };

  const latest = [...runWeeks].filter((w) => w.lineCount > 0).sort(byEndDesc)[0] ?? [...runWeeks].sort(byEndDesc)[0];
  return { totals, weeks, latestRunId: latest?.runId ?? null };
}

export interface InvoiceInfo {
  invoiceDate: string;
  customerName: string;
}

/**
 * My invoices that aren't fully collected yet, oldest first. Uses the engine's own rule
 * (only cleared payments count, within the collection tolerance), so an invoice leaves this
 * list exactly when the next run can recognize it. `info` holds the invoices to consider.
 */
export function waitingInvoices(
  contexts: Iterable<InvoiceContext>,
  info: Map<string, InvoiceInfo>,
  tolerance: Decimal,
  limit = 50,
): { count: number; items: WaitingInvoiceView[] } {
  const waiting: WaitingInvoiceView[] = [];
  for (const ctx of contexts) {
    const meta = info.get(ctx.invoiceNo);
    // Invoices with a bad total are held as exceptions instead.
    if (!meta || ctx.problems.length > 0 || !ctx.total.gt(0)) continue;
    const state = resolveCollection(ctx.total, ctx.collections, tolerance);
    if (state.state === 'FULL') continue;
    const note = ctx.collections.some((c) => c.status === 'BOUNCED') ? 'BOUNCED' : ctx.collections.some((c) => c.status === 'PENDING') ? 'NOT_CLEARED' : null;
    waiting.push({
      invoiceNo: ctx.invoiceNo,
      invoiceDate: meta.invoiceDate,
      customerName: meta.customerName,
      collected: state.collected.toFixed(2),
      total: ctx.total.toFixed(2),
      note,
    });
  }
  waiting.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNo.localeCompare(b.invoiceNo));
  return { count: waiting.length, items: waiting.slice(0, limit) };
}

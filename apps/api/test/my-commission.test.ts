import { describe, expect, it } from 'vitest';
import { buildInvoiceContexts, type CollectionInput, type InvoiceLineInput } from '@ocs/engine';
import { D, runTypeFor, ZERO } from '@ocs/shared';
import { monthBounds, monthOf, summarizeMonth, waitingInvoices, weekday, weekSlots, type MonthRun, type MyComponent } from '../src/my-commission/summary';

const run = (id: string, periodStart: string, periodEnd: string, status: MonthRun['status'] = 'APPROVED'): MonthRun => ({ id, runType: 'AS_WEEKLY', periodStart, periodEnd, status });
const comp = (runId: string, resultLineId: string, type: string, amount: string, liters: string): MyComponent => ({ runId, resultLineId, type, amount: D(amount), liters: D(liters) });

describe('month grouping', () => {
  it('puts a period in the month of its middle day', () => {
    expect(monthOf('2026-09-28', '2026-10-04')).toBe('2026-10'); // Thursday Oct 1
    expect(monthOf('2026-10-26', '2026-11-01')).toBe('2026-10'); // Thursday Oct 29
    expect(monthOf('2026-11-30', '2026-12-06')).toBe('2026-12');
    expect(monthOf('2026-10-01', '2026-10-31')).toBe('2026-10');
    expect(monthOf('2026-10-05', '2026-10-05')).toBe('2026-10');
  });

  it('knows month lengths and weekdays', () => {
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthBounds('2024-02').last).toBe('2024-02-29');
    expect(monthBounds('2026-12')).toEqual({ first: '2026-12-01', last: '2026-12-31' });
    expect(weekday('2026-10-05')).toBe(0); // Monday
    expect(weekday('2026-10-11')).toBe(6); // Sunday
  });

  it('lists the Mon–Sun weeks whose Thursday is in the month', () => {
    expect(weekSlots('2026-10')).toEqual([
      { periodStart: '2026-09-28', periodEnd: '2026-10-04' },
      { periodStart: '2026-10-05', periodEnd: '2026-10-11' },
      { periodStart: '2026-10-12', periodEnd: '2026-10-18' },
      { periodStart: '2026-10-19', periodEnd: '2026-10-25' },
      { periodStart: '2026-10-26', periodEnd: '2026-11-01' },
    ]);
    expect(weekSlots('2026-11').map((w) => w.periodStart)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
  });
});

describe('summarizeMonth', () => {
  // AS-001 in the sample AS weekly run for 2026-10-05 → 2026-10-11 (samples/README.md).
  const sample = [
    comp('r1', 'SI-1001#1', 'VOLUME', '3150.0000', '900.0000'),
    comp('r1', 'SI-1001#1', 'PRICE', '2000.0000', '900.0000'),
    comp('r1', 'SI-1001#2', 'VOLUME', '600.0000', '400.0000'),
    comp('r1', 'SI-1002#1', 'VOLUME', '3000.0000', '1000.0000'),
    comp('r1', 'SI-1004#1', 'VOLUME', '2000.0000', '2000.0000'),
    comp('r1', 'SI-1008#1', 'VOLUME', '350.0000', '100.0000'),
    comp('r1', 'SI-1009#1', 'VOLUME', '300.0000', '100.0000'),
  ];

  it('foots to the sample total for AS-001 (₱11,400.00)', () => {
    const s = summarizeMonth('2026-10', [run('r1', '2026-10-05', '2026-10-11')], sample);
    expect(s.totals).toEqual({
      approved: '11400.00',
      locked: '0.00',
      volume: '9400.00',
      price: '2000.00',
      lineCount: 6,
      liters: '4500.00',
      priceLineCount: 1,
      approvedWeeks: 1,
      lockedWeeks: 0,
    });
    expect(s.latestRunId).toBe('r1');
    expect(s.weeks).toHaveLength(5);
    expect(s.weeks[1]).toMatchObject({ periodStart: '2026-10-05', runId: 'r1', status: 'APPROVED', volume: '9400.00', price: '2000.00', total: '11400.00', lineCount: 6 });
    expect(s.weeks.filter((w) => w.runId === null).map((w) => w.periodStart)).toEqual(['2026-09-28', '2026-10-12', '2026-10-19', '2026-10-26']);
  });

  it('counts only locked runs as final', () => {
    const s = summarizeMonth(
      '2026-10',
      [run('r1', '2026-10-05', '2026-10-11', 'LOCKED'), run('r2', '2026-10-12', '2026-10-18')],
      [comp('r1', 'a', 'VOLUME', '1000.0000', '10.0000'), comp('r2', 'b', 'VOLUME', '500.0000', '5.0000')],
    );
    expect(s.totals).toMatchObject({ approved: '1500.00', locked: '1000.00', approvedWeeks: 2, lockedWeeks: 1 });
    expect(s.latestRunId).toBe('r2');
  });

  it('ignores a run that belongs to the neighbouring month', () => {
    const straddling = [run('r9', '2026-10-26', '2026-11-01')];
    const comps = [comp('r9', 'x', 'VOLUME', '700.0000', '7.0000')];
    expect(summarizeMonth('2026-10', straddling, comps).totals.approved).toBe('700.00');
    const nov = summarizeMonth('2026-11', straddling, comps);
    expect(nov.totals.approved).toBe('0.00');
    expect(nov.latestRunId).toBeNull();
    expect(nov.weeks.every((w) => w.runId === null)).toBe(true);
  });

  it('drops empty weeks covered by a run with a custom period', () => {
    const s = summarizeMonth('2026-10', [run('r1', '2026-10-01', '2026-10-15')], []);
    expect(s.weeks.map((w) => `${w.periodStart}/${w.runId ?? '-'}`)).toEqual(['2026-10-01/r1', '2026-10-19/-', '2026-10-26/-']);
  });

  it('opens on the latest week that has lines of mine', () => {
    const s = summarizeMonth('2026-10', [run('r1', '2026-10-05', '2026-10-11'), run('r2', '2026-10-12', '2026-10-18')], [comp('r1', 'a', 'VOLUME', '10.0000', '1.0000')]);
    expect(s.latestRunId).toBe('r1');
    expect(s.weeks.find((w) => w.runId === 'r2')).toMatchObject({ total: '0.00', lineCount: 0 });
  });

  it('pays Account Specialists weekly and every other Sales and RSR role monthly', () => {
    expect(runTypeFor('AS')).toBe('AS_WEEKLY');
    for (const role of ['SS', 'SM', 'NSM', 'RSR', 'RSRM'] as const) expect(runTypeFor(role)).toBe('SP_MONTHLY');
  });

  it('lists no empty weeks for a monthly-paid role', () => {
    const s = summarizeMonth('2026-10', [], [], false);
    expect(s.weeks).toEqual([]);
    expect(s.totals.approved).toBe('0.00');
    expect(s.latestRunId).toBeNull();
  });

  it('does not count a forfeited (₱0) price component as sold above SRP', () => {
    const s = summarizeMonth('2026-10', [run('r1', '2026-10-05', '2026-10-11')], [comp('r1', 'a', 'VOLUME', '10.0000', '1.0000'), comp('r1', 'a', 'PRICE', '0.0000', '1.0000')]);
    expect(s.totals.priceLineCount).toBe(0);
  });
});

describe('waitingInvoices', () => {
  const line = (invoiceNo: string, invoiceDate: string, qty: string, unitPrice: string): InvoiceLineInput => ({
    invoiceNo,
    lineNo: 1,
    invoiceDate,
    customerId: 'c',
    productId: 'p',
    channel: 'EU',
    accountType: 'AS_GENERATED',
    statedTermDays: 30,
    liters: D(qty),
    qty: D(qty),
    unitPrice: D(unitPrice),
    pricelistPrice: D(unitPrice),
    approvedStandardDiscount: false,
    asId: 'as-1',
  });
  const pay = (invoiceNo: string, amount: string, status: CollectionInput['status'], clearedDate: string | null): CollectionInput => ({ invoiceNo, amount: D(amount), status, clearedDate, reference: `OR-${invoiceNo}-${amount}` });

  // Same shapes as SI-1001, SI-1006, SI-1011 and SI-1012 in the samples.
  const lines = [line('SI-1001', '2026-09-01', '100', '1800'), line('SI-1006', '2026-09-15', '200', '260'), line('SI-1011', '2026-10-02', '10', '1950'), line('SI-1012', '2026-09-20', '40', '250')];
  const collections = [
    pay('SI-1001', '180000', 'CLEARED', '2026-10-06'),
    pay('SI-1006', '26000', 'CLEARED', '2026-10-06'),
    pay('SI-1011', '19500', 'PENDING', null),
    pay('SI-1012', '10000', 'BOUNCED', null),
  ];
  const info = new Map(lines.map((l) => [l.invoiceNo, { invoiceDate: l.invoiceDate, customerName: `Customer of ${l.invoiceNo}` }]));

  it('lists invoices not fully collected, oldest first, with why', () => {
    const w = waitingInvoices(buildInvoiceContexts(lines, collections).values(), info, ZERO);
    expect(w.count).toBe(3);
    expect(w.items).toEqual([
      { invoiceNo: 'SI-1006', invoiceDate: '2026-09-15', customerName: 'Customer of SI-1006', collected: '26000.00', total: '52000.00', note: null },
      { invoiceNo: 'SI-1012', invoiceDate: '2026-09-20', customerName: 'Customer of SI-1012', collected: '0.00', total: '10000.00', note: 'BOUNCED' },
      { invoiceNo: 'SI-1011', invoiceDate: '2026-10-02', customerName: 'Customer of SI-1011', collected: '0.00', total: '19500.00', note: 'NOT_CLEARED' },
    ]);
  });

  it('applies the collection tolerance like the engine does', () => {
    const short = [pay('SI-1006', '51995', 'CLEARED', '2026-10-06')];
    const contexts = buildInvoiceContexts([lines[1]!], short);
    expect(waitingInvoices(contexts.values(), info, ZERO).count).toBe(1);
    expect(waitingInvoices(contexts.values(), info, D('5.00')).count).toBe(0);
  });

  it('only considers the invoices it is given, and caps the list', () => {
    const contexts = buildInvoiceContexts(lines, collections);
    expect(waitingInvoices(contexts.values(), new Map([['SI-1006', info.get('SI-1006')!]]), ZERO).count).toBe(1);
    const capped = waitingInvoices(contexts.values(), info, ZERO, 1);
    expect(capped.count).toBe(3);
    expect(capped.items).toHaveLength(1);
  });
});

describe('agent dashboard confidentiality', () => {
  it('never carries grace, actual days or internal notes', () => {
    const s = summarizeMonth('2026-10', [run('r1', '2026-10-05', '2026-10-11')], [comp('r1', 'a', 'VOLUME', '10.0000', '1.0000')]);
    expect(JSON.stringify(s)).not.toMatch(/grace|actualDays|internalNotes|rulesetSnapshot/i);
  });
});

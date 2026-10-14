import { describe, expect, it } from 'vitest';
import { D } from '@ocs/shared/money';
import { computeLine } from '../src/compute-line';
import { buildInvoiceContexts } from '../src/collection';
import { resolveTermBucket } from '../src/term-bucket';
import type { RuleSet } from '../src/types';
import { computeOne, computePaidOnDay, defaultConfig, defaultRuleSet, line, paid } from './fixtures';

const amounts = (r: ReturnType<typeof computePaidOnDay>) => Object.fromEntries(r.components.map((c) => [c.type, c.amount.toFixed(2)]));

describe('term buckets and the grace period', () => {
  it.each([
    // stated, day paid, expected bucket
    [0, 0, 'COD'],
    [0, 12, 'COD'],
    [0, 13, 'D30'],
    [30, 42, 'D30'],
    [30, 43, 'D60'],
    [30, 72, 'D60'],
    [30, 73, 'D90'],
    [60, 60, 'D60'],
    [60, 72, 'D60'],
    [60, 73, 'D90'],
    [90, 90, 'D90'],
    [90, 102, 'D90'],
    [90, 103, 'D120'],
    [120, 120, 'D120'],
    [120, 132, 'D120'],
    [120, 133, 'D120_PLUS'],
    [30, 5, 'D30'], // paid early: still the stated bucket
    [30, -3, 'D30'], // advance payment
  ] as const)('stated %i days, collected on day %i → %s', (stated, day, bucket) => {
    const r = resolveTermBucket(defaultConfig(), stated, day);
    expect(r.ok && r.bucket).toBe(bucket);
  });

  it('grace days are configurable', () => {
    const cfg = defaultConfig({ graceDays: 0 });
    expect(resolveTermBucket(cfg, 30, 30)).toMatchObject({ bucket: 'D30' });
    expect(resolveTermBucket(cfg, 30, 31)).toMatchObject({ bucket: 'D60' });
    expect(resolveTermBucket(defaultConfig({ graceDays: 20 }), 30, 50)).toMatchObject({ bucket: 'D30' });
  });

  it('unmapped stated term → UNMAPPED_STATED_TERM', () => {
    expect(resolveTermBucket(defaultConfig(), 45, 40)).toMatchObject({ ok: false, code: 'UNMAPPED_STATED_TERM' });
    const r = computePaidOnDay(line({ statedTermDays: 45 }), 40);
    expect(r.status).toBe('EXCEPTION');
    expect(r.exceptions.map((e) => e.code)).toContain('UNMAPPED_STATED_TERM');
  });

  it('stated 30 days: day 42 pays the 30-day rate, day 43 the 60-day rate', () => {
    const d42 = computePaidOnDay(line(), 42);
    const d43 = computePaidOnDay(line(), 43);
    expect(d42).toMatchObject({ status: 'COMPUTED', termBucket: 'D30', actualDays: 42 });
    expect(amounts(d42)).toEqual({ VOLUME: '3500.00' });
    expect(d43).toMatchObject({ status: 'COMPUTED', termBucket: 'D60', actualDays: 43 });
    expect(amounts(d43)).toEqual({ VOLUME: '3000.00' });
  });
});

describe('volume commission', () => {
  it.each([
    ['EU', 0, '4000.00'],
    ['EU', 30, '3500.00'],
    ['DL', 60, '3000.00'],
    ['DL', 90, '2500.00'],
    ['EU', 120, '2000.00'],
    ['DR', 0, '2000.00'],
    ['DR', 30, '1750.00'],
    ['TB', 60, '1500.00'],
    ['TB', 90, '1250.00'],
    ['DR', 120, '1000.00'],
  ] as const)('Standard %s, %i days, 1,000 L → ₱%s', (channel, stated, expected) => {
    const r = computePaidOnDay(line({ channel, statedTermDays: stated }), stated);
    expect(r.pricingType).toBe('STANDARD');
    expect(amounts(r).VOLUME).toBe(expected);
  });

  it('below SRP → Non-Standard rates', () => {
    const r = computePaidOnDay(line({ unitPrice: D('90') }), 30);
    expect(r).toMatchObject({ status: 'COMPUTED', pricingType: 'NON_STANDARD', termBucket: 'D30' });
    expect(amounts(r)).toEqual({ VOLUME: '1500.00' });
  });

  it('below SRP with an approved standard discount → Standard, no price commission', () => {
    const r = computePaidOnDay(line({ unitPrice: D('90'), approvedStandardDiscount: true }), 30);
    expect(r.pricingType).toBe('STANDARD');
    expect(amounts(r)).toEqual({ VOLUME: '3500.00' });
  });

  it('Non-Standard D120_PLUS rates are defined (EU/DL 0.25, DR/TB/RM 0.125)', () => {
    expect(amounts(computePaidOnDay(line({ unitPrice: D('90'), statedTermDays: 120 }), 200)).VOLUME).toBe('250.00');
    expect(amounts(computePaidOnDay(line({ channel: 'DR', unitPrice: D('90'), statedTermDays: 120 }), 200)).VOLUME).toBe('125.00');
  });

  it('RM is always Non-Standard, even above SRP, and needs no SRP', () => {
    const above = computePaidOnDay(line({ channel: 'RM', unitPrice: D('150') }), 30);
    expect(above).toMatchObject({ status: 'COMPUTED', pricingType: 'NON_STANDARD' });
    expect(amounts(above)).toEqual({ VOLUME: '750.00' });
    expect(above.notes.join()).toMatch(/always uses Non-Standard/);

    const noSrp = computePaidOnDay(line({ channel: 'RM', pricelistPrice: null, statedTermDays: 0 }), 0);
    expect(noSrp.status).toBe('COMPUTED');
    expect(amounts(noSrp)).toEqual({ VOLUME: '1000.00' });
  });

  it('undefined Standard rate beyond 120 days → EXCEPTION, never a guessed number', () => {
    const r = computePaidOnDay(line({ statedTermDays: 120 }), 133);
    expect(r.status).toBe('EXCEPTION');
    expect(r.termBucket).toBe('D120_PLUS');
    expect(r.components).toEqual([]);
    expect(r.totalAmount.toFixed(2)).toBe('0.00');
    expect(r.exceptions).toEqual([expect.objectContaining({ code: 'UNDEFINED_RATE' })]);
  });

  it('rounds the amount half-up to centavos', () => {
    const r = computePaidOnDay(line({ liters: D('333.3333') }), 30);
    expect(amounts(r).VOLUME).toBe('1166.67'); // 1,166.66655
  });

  it('explanation traces the peso', () => {
    const r = computePaidOnDay(line(), 30);
    expect(r.components[0]!.explanation).toBe('1,000.00 L × ₱3.50/L = ₱3,500.00 (EU, Standard, 30 days)');
  });
});

describe('price commission', () => {
  const over = { unitPrice: D('110'), pricelistPrice: D('100') }; // overprice ₱10 × 1,000 qty = ₱10,000

  it.each([
    [0, '8000.00'],
    [30, '8000.00'],
    [60, '6000.00'],
    [90, '4000.00'],
    [120, '2000.00'],
  ] as const)('EU, %i days → ₱%s', (stated, expected) => {
    const r = computePaidOnDay(line({ ...over, statedTermDays: stated }), stated);
    expect(amounts(r).PRICE).toBe(expected);
  });

  it('explanation', () => {
    const r = computePaidOnDay(line(over), 30);
    expect(r.components.find((c) => c.type === 'PRICE')!.explanation).toBe(
      'Overprice ₱10.00 × 1,000.00 qty × 80% = ₱8,000.00 (EU, 30 days)',
    );
  });

  it('EU only by default: DL, DR, TB, RM get no price commission', () => {
    for (const channel of ['DL', 'DR', 'TB', 'RM'] as const) {
      const r = computePaidOnDay(line({ ...over, channel }), 30);
      expect(r.status).toBe('COMPUTED');
      expect(r.components.map((c) => c.type)).toEqual(['VOLUME']);
    }
  });

  it('TB earns price commission when the config flag is on', () => {
    const rs = defaultRuleSet({ priceCommissionChannels: ['EU', 'TB'] });
    const r = computePaidOnDay(line({ ...over, channel: 'TB' }), 30, rs);
    expect(amounts(r)).toEqual({ VOLUME: '1750.00', PRICE: '8000.00' });
  });

  it('no price commission at or below SRP', () => {
    expect(computePaidOnDay(line(), 30).components.map((c) => c.type)).toEqual(['VOLUME']);
  });

  it('beyond 120 days the price commission is forfeited (₱0 with explanation)', () => {
    // Standard 120+ volume is undefined in the brief; add one here to isolate the price rule.
    const rs: RuleSet = defaultRuleSet();
    rs.volumeRates.push({ ...rs.volumeRates[0]!, entryId: 'tmp-std-120p', pricingType: 'STANDARD', channel: 'EU', bucket: 'D120_PLUS', rate: D('1.00') });
    const r = computePaidOnDay(line({ ...over, statedTermDays: 120 }), 150, rs);
    expect(r.status).toBe('COMPUTED');
    const price = r.components.find((c) => c.type === 'PRICE')!;
    expect(price.amount.toFixed(2)).toBe('0.00');
    expect(price.explanation).toMatch(/forfeited \(beyond 120 days\)/);
  });

  it('price rate beyond 120 can be redefined in data (open question 2)', () => {
    const rs = defaultRuleSet();
    const p = rs.priceRates.find((x) => x.bucket === 'D120_PLUS')!;
    p.kind = 'RATE';
    p.rate = D('0.20');
    rs.volumeRates.push({ ...rs.volumeRates[0]!, entryId: 'tmp', bucket: 'D120_PLUS', rate: D('1.00') });
    expect(amounts(computePaidOnDay(line({ ...over, statedTermDays: 120 }), 150, rs)).PRICE).toBe('2000.00');
  });
});

describe('collections and recognition', () => {
  const rs = defaultRuleSet();
  const l = line(); // invoice total 1,000 × ₱100 = ₱100,000

  it('partial collection stays PENDING_COLLECTION', () => {
    const [r] = computeOne(rs, [l], [paid('INV-1', '50000', 20)]);
    expect(r).toMatchObject({ status: 'PENDING_COLLECTION', components: [] });
    expect(r!.collectedAmount.toFixed(2)).toBe('50000.00');
    expect(r!.recognitionDate).toBeUndefined();
  });

  it('no collection at all → PENDING_COLLECTION', () => {
    expect(computeOne(rs, [l], [])[0]!.status).toBe('PENDING_COLLECTION');
  });

  it('recognition date = cleared date of the last check that completes payment', () => {
    const [r] = computeOne(rs, [l], [paid('INV-1', '40000', 50, undefined, 'CHK-2'), paid('INV-1', '60000', 10, undefined, 'CHK-1')]);
    expect(r).toMatchObject({ status: 'COMPUTED', recognitionDate: '2026-02-20', actualDays: 50, termBucket: 'D60' });
  });

  it('bounced and uncleared (PDC) payments do not count', () => {
    const cols = [
      paid('INV-1', '60000', 10),
      { ...paid('INV-1', '40000', 20), status: 'BOUNCED' as const },
      { ...paid('INV-1', '40000', 25), status: 'PENDING' as const, clearedDate: null },
    ];
    expect(computeOne(rs, [l], cols)[0]!.status).toBe('PENDING_COLLECTION');
    const [r] = computeOne(rs, [l], [...cols, paid('INV-1', '40000', 41, undefined, 'CHK-REPLACEMENT')]);
    expect(r).toMatchObject({ status: 'COMPUTED', actualDays: 41, termBucket: 'D30' });
  });

  it('payments after full collection do not move the recognition date', () => {
    const [r] = computeOne(rs, [l], [paid('INV-1', '100000', 20), paid('INV-1', '5', 90)]);
    expect(r!.actualDays).toBe(20);
  });

  it('full collection is per invoice: all lines recognize together', () => {
    const l2 = line({ lineNo: 2, qty: D('500'), liters: D('500') }); // invoice total = 150,000
    expect(computeOne(rs, [l, l2], [paid('INV-1', '100000', 10)]).map((r) => r.status)).toEqual(['PENDING_COLLECTION', 'PENDING_COLLECTION']);
    const done = computeOne(rs, [l, l2], [paid('INV-1', '100000', 10), paid('INV-1', '50000', 35)]);
    expect(done.map((r) => [r.status, r.recognitionDate])).toEqual([
      ['COMPUTED', '2026-02-05'],
      ['COMPUTED', '2026-02-05'],
    ]);
  });

  it('uses the exported invoice total when provided (e.g. VAT-inclusive)', () => {
    const vat = line({ invoiceTotal: D('112000') });
    expect(computeOne(rs, [vat], [paid('INV-1', '100000', 10)])[0]!.status).toBe('PENDING_COLLECTION');
    expect(computeOne(rs, [vat], [paid('INV-1', '112000', 10)])[0]!.status).toBe('COMPUTED');
  });

  it('collection tolerance is configurable', () => {
    const tol = defaultRuleSet({ collectionTolerance: D('1.00') });
    expect(computeOne(tol, [l], [paid('INV-1', '99999.00', 10)])[0]!.status).toBe('COMPUTED');
    expect(computeOne(tol, [l], [paid('INV-1', '99998.99', 10)])[0]!.status).toBe('PENDING_COLLECTION');
  });

  it('asOf ignores payments cleared later', () => {
    const ctx = buildInvoiceContexts([l], [paid('INV-1', '100000', 40)]);
    expect(computeLine(rs, l, ctx.get('INV-1')!, { asOf: '2026-02-01' }).status).toBe('PENDING_COLLECTION');
    expect(computeLine(rs, l, ctx.get('INV-1')!, { asOf: '2026-02-10' }).status).toBe('COMPUTED');
  });
});

describe('exceptions', () => {
  const codes = (r: { exceptions: { code: string }[] }) => r.exceptions.map((e) => e.code);

  it('missing pricelist price → MISSING_PRICELIST_PRICE', () => {
    const r = computePaidOnDay(line({ pricelistPrice: null }), 30);
    expect(r.status).toBe('EXCEPTION');
    expect(codes(r)).toEqual(['MISSING_PRICELIST_PRICE']);
    expect(r.components).toEqual([]);
  });

  it('unknown channel → UNKNOWN_CHANNEL', () => {
    expect(codes(computePaidOnDay(line({ channel: 'XX' }), 30))).toEqual(['UNKNOWN_CHANNEL']);
  });

  it('missing AS → MISSING_PAYEE', () => {
    expect(codes(computePaidOnDay(line({ asId: null }), 30))).toEqual(['MISSING_PAYEE']);
  });

  it('negative qty (returns / credit memos) → NEGATIVE_QTY until the rule is defined', () => {
    const r = computeOne(defaultRuleSet(), [line({ qty: D('-10'), liters: D('-10'), invoiceTotal: D('1000') })], [paid('INV-1', '1000', 5)])[0]!;
    expect(codes(r)).toContain('NEGATIVE_QTY');
  });

  it('overlapping effective rate tables → OVERLAPPING_EFFECTIVE_RATES', () => {
    const rs = defaultRuleSet();
    rs.volumeRates.push({ ...rs.volumeRates.find((v) => v.channel === 'EU' && v.bucket === 'D30' && v.pricingType === 'STANDARD')!, entryId: 'dup' });
    expect(codes(computePaidOnDay(line(), 30, rs))).toEqual(['OVERLAPPING_EFFECTIVE_RATES']);
  });

  it('account types not eligible for AS commission compute to ₱0 with a note', () => {
    const rs = defaultRuleSet({ asEligibleAccountTypes: ['AS_GENERATED'] });
    const r = computePaidOnDay(line({ accountType: 'IN_HOUSE' }), 30, rs);
    expect(r).toMatchObject({ status: 'COMPUTED', components: [] });
    expect(r.notes.join()).toMatch(/IN_HOUSE does not earn/);
  });
});

describe('effective-dated rates', () => {
  function twoVersions(): RuleSet {
    const rs = defaultRuleSet();
    const old = rs.volumeRates.find((v) => v.channel === 'EU' && v.pricingType === 'STANDARD' && v.bucket === 'D30')!;
    old.effectiveTo = '2026-06-30';
    rs.volumeRates.push({ ...old, entryId: 'v2', tableName: 'Volume v2', rate: D('4.25'), effectiveFrom: '2026-07-01', effectiveTo: null });
    return rs;
  }

  it('selects the table effective on the invoice date (default)', () => {
    const rs = twoVersions();
    expect(amounts(computePaidOnDay(line({ invoiceDate: '2026-06-30' }), 30, rs)).VOLUME).toBe('3500.00');
    expect(amounts(computePaidOnDay(line({ invoiceDate: '2026-07-01' }), 30, rs)).VOLUME).toBe('4250.00');
  });

  it('can select by recognition date instead (config)', () => {
    const rs = twoVersions();
    rs.config.rateDateBasis = 'RECOGNITION_DATE';
    expect(amounts(computePaidOnDay(line({ invoiceDate: '2026-06-20' }), 30, rs)).VOLUME).toBe('4250.00');
  });
});

describe('grace period confidentiality', () => {
  it('agent-safe text never mentions grace or actual days', () => {
    const cases = [
      computePaidOnDay(line(), 42),
      computePaidOnDay(line({ unitPrice: D('110') }), 43),
      computePaidOnDay(line({ channel: 'RM' }), 13),
      computePaidOnDay(line({ statedTermDays: 120 }), 133),
    ];
    for (const r of cases) {
      const visible = [...r.components.map((c) => c.explanation), ...r.notes, ...r.exceptions.map((e) => e.message)].join(' | ');
      expect(visible).not.toMatch(/grace/i);
      expect(visible).not.toMatch(/\b(42|43|13|133|12) days\b/);
    }
  });

  it('internal notes (Finance only) do carry the reasoning', () => {
    const r = computePaidOnDay(line(), 42);
    expect(r.internalNotes.join()).toMatch(/42 days.*grace 12 days.*30 days/);
  });
});

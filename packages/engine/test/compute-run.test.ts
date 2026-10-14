import { describe, expect, it } from 'vitest';
import { D } from '@ocs/shared/money';
import { computeRun } from '../src/compute-run';
import { canonicalRuleSetJson, deserializeRuleSet, serializeRuleSet, validateRuleSet } from '../src/ruleset';
import { defaultRuleSet, line, paid } from './fixtures';

describe('computeRun', () => {
  const rs = defaultRuleSet();
  // Week of Mon 2026-02-02 .. Sun 2026-02-08
  const period = { periodStart: '2026-02-02', periodEnd: '2026-02-08' };
  const lines = [
    line({ invoiceNo: 'A', asId: 'as-1' }), // paid day 35 = 2026-02-05 (in week)
    line({ invoiceNo: 'B', asId: 'as-1', unitPrice: D('110') }), // paid 2026-02-06; volume + price
    line({ invoiceNo: 'C', asId: 'as-2' }), // paid 2026-01-20 (earlier week)
    line({ invoiceNo: 'D', asId: 'as-2' }), // half paid → pending
    line({ invoiceNo: 'E', asId: 'as-2' }), // paid 2026-02-10 (after week) → pending as of periodEnd
    line({ invoiceNo: 'F', asId: 'as-1', invoiceDate: '2026-02-09' }), // invoiced after period → ignored
    line({ invoiceNo: 'G', asId: 'as-1', pricelistPrice: null }), // exception, paid in week
  ];
  const collections = [
    paid('A', '100000', 35),
    paid('B', '110000', 36),
    paid('C', '100000', 19),
    paid('D', '50000', 30),
    paid('E', '100000', 40),
    paid('G', '100000', 34),
  ];

  const out = computeRun(rs, { runType: 'AS_WEEKLY', ...period, lines, collections });

  it('includes only lines recognized in the period, plus pending ones', () => {
    expect(out.results.map((r) => [r.invoiceNo, r.status])).toEqual([
      ['A', 'COMPUTED'],
      ['B', 'COMPUTED'],
      ['D', 'PENDING_COLLECTION'],
      ['E', 'PENDING_COLLECTION'],
      ['G', 'EXCEPTION'],
    ]);
    expect(out.summary).toMatchObject({ computed: 2, pending: 2, exceptions: 1, excludedEarlier: 1 });
  });

  it('totals by payee foot to the grand total', () => {
    // A: 3,500 volume. B: 3,500 volume + 8,000 price (10 × 1,000 × 80%).
    expect(out.totalsByPayee).toHaveLength(1);
    const p = out.totalsByPayee[0]!;
    expect(p).toMatchObject({ payeeRole: 'AS', payeeId: 'as-1', lineCount: 2 });
    expect(p.byType.VOLUME!.toFixed(2)).toBe('7000.00');
    expect(p.byType.PRICE!.toFixed(2)).toBe('8000.00');
    expect(p.total.toFixed(2)).toBe('15000.00');
    expect(out.summary.grandTotal.toFixed(2)).toBe('15000.00');
  });

  it('is deterministic', () => {
    const again = computeRun(rs, { runType: 'AS_WEEKLY', ...period, lines: [...lines].reverse(), collections: [...collections].reverse() });
    expect(JSON.stringify(again)).toBe(JSON.stringify(out));
  });

  it('SP_MONTHLY is accepted but not implemented yet', () => {
    const sp = computeRun(rs, { runType: 'SP_MONTHLY', periodStart: '2026-02-01', periodEnd: '2026-02-28', lines, collections });
    expect(sp.results).toEqual([]);
    expect(sp.warnings[0]).toMatch(/NOT_IMPLEMENTED/);
  });

  it('rejects an invalid RuleSet', () => {
    const bad = defaultRuleSet({ graceDays: -1 });
    expect(() => computeRun(bad, { runType: 'AS_WEEKLY', ...period, lines, collections })).toThrow(/graceDays/);
  });
});

describe('RuleSet snapshot', () => {
  it('round-trips through JSON without losing Decimal precision', () => {
    const rs = defaultRuleSet();
    const back = deserializeRuleSet(JSON.parse(JSON.stringify(serializeRuleSet(rs))));
    expect(back.volumeRates.find((v) => v.rate.eq('0.125'))).toBeTruthy();
    expect(canonicalRuleSetJson(back)).toBe(canonicalRuleSetJson(rs));
    expect(validateRuleSet(back)).toEqual([]);
  });

  it('canonical JSON ignores entry order but changes with content', () => {
    const a = defaultRuleSet();
    const b = defaultRuleSet();
    b.volumeRates.reverse();
    expect(canonicalRuleSetJson(a)).toBe(canonicalRuleSetJson(b));
    b.config.graceDays = 13;
    expect(canonicalRuleSetJson(a)).not.toBe(canonicalRuleSetJson(b));
  });
});

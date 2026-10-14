import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeRun } from '../../src/compute-run';
import { defaultRuleSet } from '../fixtures';
import { loadGoldenCases } from './loader';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'cases');
const cases = loadGoldenCases(dir);

describe('golden cases (Finance hand-computed)', () => {
  it('has cases to run', () => expect(cases.length).toBeGreaterThan(0));

  for (const gc of cases) {
    describe(`${gc.file}: ${gc.name}`, () => {
      const out = computeRun(defaultRuleSet(gc.configOverrides), { ...gc.run, lines: gc.lines, collections: gc.collections });

      for (const exp of gc.expected) {
        it(`${exp.invoiceNo}#${exp.lineNo} → ${exp.status}`, () => {
          const r = out.results.find((x) => x.invoiceNo === exp.invoiceNo && x.lineNo === exp.lineNo);
          expect(r, 'line missing from results').toBeDefined();
          expect(r!.status).toBe(exp.status);
          if (exp.termBucket) expect(r!.termBucket).toBe(exp.termBucket);
          if (exp.pricingType) expect(r!.pricingType).toBe(exp.pricingType);
          const amt = (t: string) => r!.components.find((c) => c.type === t)?.amount.toFixed(2) ?? '0.00';
          if (exp.volume !== undefined) expect(amt('VOLUME')).toBe(exp.volume);
          if (exp.price !== undefined) expect(amt('PRICE')).toBe(exp.price);
          if (exp.exceptionCodes) expect(r!.exceptions.map((e) => e.code).sort()).toEqual([...exp.exceptionCodes].sort());
        });
      }

      if (gc.expectedTotal !== undefined) {
        it(`grand total = ${gc.expectedTotal}`, () => expect(out.summary.grandTotal.toFixed(2)).toBe(gc.expectedTotal));
      }
    });
  }
});

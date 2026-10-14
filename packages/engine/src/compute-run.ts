import { sum, ZERO, type Decimal } from '@ocs/shared/money';
import { buildInvoiceContexts } from './collection';
import { computeLine } from './compute-line';
import { assertIsoDate } from './dates';
import { validateRuleSet } from './ruleset';
import type { ComponentType, LineResult, PayeeTotal, RuleSet, RunInput, RunOutput } from './types';
import { ENGINE_VERSION } from './version';

/**
 * Compute a run.
 *  - Lines invoiced after periodEnd are ignored.
 *  - Payments cleared after periodEnd are ignored (so re-running an old period gives the same answer).
 *  - COMPUTED / EXCEPTION lines are included only if recognized within [periodStart, periodEnd].
 *  - Lines recognized before periodStart belong to an earlier run (counted in excludedEarlier).
 *  - Not-yet-fully-collected lines are returned as PENDING_COLLECTION.
 */
export function computeRun(rs: RuleSet, input: RunInput): RunOutput {
  assertIsoDate(input.periodStart, 'periodStart');
  assertIsoDate(input.periodEnd, 'periodEnd');
  if (input.periodEnd < input.periodStart) throw new RangeError('periodEnd is before periodStart');
  const problems = validateRuleSet(rs);
  if (problems.length > 0) throw new Error(`Invalid RuleSet: ${problems.join('; ')}`);

  const warnings: string[] = [];
  if (input.runType === 'SP_MONTHLY') {
    // TODO(SP): SASI / AMSI / NOVI / CHEMICAL / RSR components for Sales Personnel.
    warnings.push('NOT_IMPLEMENTED: SP_MONTHLY components (SASI, AMSI, NOVI, Chemical, RSR) are not implemented yet');
    return emptyOutput(rs, warnings);
  }

  const lines = input.lines.filter((l) => l.invoiceDate <= input.periodEnd);
  const contexts = buildInvoiceContexts(lines, input.collections);

  const results: LineResult[] = [];
  let excludedEarlier = 0;
  let alreadyPaidCount = 0;
  const alreadyPaid = new Set(input.alreadyPaid ?? []);
  const sorted = [...lines].sort((a, b) => (a.invoiceNo === b.invoiceNo ? a.lineNo - b.lineNo : a.invoiceNo.localeCompare(b.invoiceNo)));
  for (const line of sorted) {
    if (alreadyPaid.has(`${line.invoiceNo}#${line.lineNo}`)) {
      alreadyPaidCount++;
      continue;
    }
    const r = computeLine(rs, line, contexts.get(line.invoiceNo)!, { asOf: input.periodEnd });
    if (r.status !== 'PENDING_COLLECTION' && r.recognitionDate! < input.periodStart) {
      excludedEarlier++;
      continue;
    }
    results.push(r);
  }

  const payees = new Map<string, PayeeTotal & { _lines: Set<string> }>();
  const byType: Partial<Record<ComponentType, Decimal>> = {};
  for (const r of results) {
    if (r.status !== 'COMPUTED') continue;
    for (const c of r.components) {
      const key = `${c.payeeRole}:${c.payeeId}`;
      const p = payees.get(key) ?? { payeeRole: c.payeeRole, payeeId: c.payeeId, byType: {}, total: ZERO, lineCount: 0, _lines: new Set<string>() };
      p.byType[c.type] = (p.byType[c.type] ?? ZERO).plus(c.amount);
      p.total = p.total.plus(c.amount);
      p._lines.add(`${r.invoiceNo}#${r.lineNo}`);
      payees.set(key, p);
      byType[c.type] = (byType[c.type] ?? ZERO).plus(c.amount);
    }
  }
  const totalsByPayee: PayeeTotal[] = [...payees.values()]
    .map(({ _lines, ...p }) => ({ ...p, lineCount: _lines.size }))
    .sort((a, b) => b.total.comparedTo(a.total) || a.payeeId.localeCompare(b.payeeId));

  return {
    engineVersion: ENGINE_VERSION,
    ruleSetHash: rs.hash,
    results,
    totalsByPayee,
    summary: {
      computed: results.filter((r) => r.status === 'COMPUTED').length,
      pending: results.filter((r) => r.status === 'PENDING_COLLECTION').length,
      exceptions: results.filter((r) => r.status === 'EXCEPTION').length,
      excludedEarlier,
      alreadyPaid: alreadyPaidCount,
      grandTotal: sum(totalsByPayee.map((p) => p.total)),
      byType,
    },
    warnings,
  };
}

function emptyOutput(rs: RuleSet, warnings: string[]): RunOutput {
  return {
    engineVersion: ENGINE_VERSION,
    ruleSetHash: rs.hash,
    results: [],
    totalsByPayee: [],
    summary: { computed: 0, pending: 0, exceptions: 0, excludedEarlier: 0, alreadyPaid: 0, grandTotal: ZERO, byType: {} },
    warnings,
  };
}

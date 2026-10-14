import { sum, ZERO } from '@ocs/shared/money';
import { CHANNELS } from '@ocs/shared/enums';
import { resolveCollection } from './collection';
import { computePrice } from './components/price';
import { computeVolume } from './components/volume';
import { daysBetween } from './dates';
import { bucketLabel } from './explain';
import { resolvePricingType } from './pricing';
import { resolveTermBucket } from './term-bucket';
import type { CommissionComponent, EngineException, InvoiceContext, InvoiceLineInput, IsoDate, LineResult, RuleSet } from './types';

export interface ComputeLineOptions {
  /** Only payments cleared on/before this date count (normally the run's periodEnd). */
  asOf?: IsoDate;
}

/**
 * Compute one invoice line. Pure: same inputs → same output.
 *
 * Order:
 *  1. Collection: not fully collected → PENDING_COLLECTION (nothing else is evaluated).
 *  2. Data checks (channel, qty, invoice total, payee).
 *  3. Term bucket from actual days.
 *  4. Pricing type.
 *  5. Components (Volume, Price).
 * Any exception → status EXCEPTION and NO components: a line is never partly paid on a guess.
 */
export function computeLine(rs: RuleSet, line: InvoiceLineInput, invoice: InvoiceContext, opts: ComputeLineOptions = {}): LineResult {
  const cfg = rs.config;
  const base = {
    invoiceNo: line.invoiceNo,
    lineNo: line.lineNo,
    invoiceTotal: invoice.total,
    notes: [] as string[],
    internalNotes: [] as string[],
  };

  const coll = resolveCollection(invoice.total, invoice.collections, cfg.collectionTolerance, opts.asOf);
  if (coll.state === 'PARTIAL') {
    return {
      ...base,
      status: 'PENDING_COLLECTION',
      collectedAmount: coll.collected,
      totalAmount: ZERO,
      components: [],
      exceptions: [],
    };
  }

  const recognitionDate = coll.recognitionDate;
  const actualDays = daysBetween(line.invoiceDate, recognitionDate);
  const exceptions: EngineException[] = [...invoice.problems];
  const fail = (): LineResult => ({
    ...base,
    status: 'EXCEPTION',
    recognitionDate,
    actualDays,
    collectedAmount: coll.collected,
    totalAmount: ZERO,
    components: [],
    exceptions,
  });

  if (!(CHANNELS as readonly string[]).includes(line.channel)) {
    exceptions.push({ code: 'UNKNOWN_CHANNEL', message: `Unknown sales channel "${line.channel}"` });
    return fail();
  }
  if (line.qty.isNegative() || line.liters.isNegative()) {
    exceptions.push({ code: 'NEGATIVE_QTY', message: 'Negative quantity/liters (return or credit memo) — handling not yet defined' });
  }

  const term = resolveTermBucket(cfg, line.statedTermDays, actualDays);
  if (!term.ok) exceptions.push({ code: term.code, message: term.message });

  const pricing = resolvePricingType(cfg, line);
  if (!pricing.ok) exceptions.push({ code: pricing.code, message: pricing.message });

  const asEligible = (cfg.asEligibleAccountTypes as string[]).includes(line.accountType);
  if (asEligible && !line.asId) {
    exceptions.push({ code: 'MISSING_PAYEE', message: 'No Account Specialist assigned to this line/customer' });
  }

  if (exceptions.length > 0 || !term.ok || !pricing.ok) {
    const r = fail();
    if (term.ok) r.termBucket = term.bucket;
    if (pricing.ok) r.pricingType = pricing.pricingType;
    return r;
  }

  const bucket = term.bucket;
  const pricingType = pricing.pricingType;
  base.internalNotes.push(
    `Invoice ${line.invoiceDate}, fully collected ${recognitionDate} (last payment ${coll.lastReference}): ${actualDays} days; ` +
      `stated ${bucketLabel(term.statedBucket)}; grace ${cfg.graceDays} days → ${bucketLabel(bucket)}` +
      (term.withinStatedGrace ? ' (within stated term + grace)' : ' (beyond stated term + grace)'),
  );
  if (pricing.reason === 'FORCED') base.notes.push(`${line.channel} always uses Non-Standard rates`);
  if (pricing.reason === 'APPROVED_DISCOUNT') base.notes.push('Below SRP with an approved standard discount → Standard');

  const components: CommissionComponent[] = [];
  if (!asEligible) {
    base.notes.push(`Account type ${line.accountType} does not earn AS commission`);
  } else {
    const rateDate = cfg.rateDateBasis === 'RECOGNITION_DATE' ? recognitionDate : line.invoiceDate;
    const ctx = { pricingType, bucket, rateDate, payeeId: line.asId! };
    const vol = computeVolume(rs, line, ctx);
    if (vol.exception) exceptions.push(vol.exception);
    if (vol.component) components.push(vol.component);
    const price = computePrice(rs, line, ctx);
    if (price.exception) exceptions.push(price.exception);
    if (price.component) components.push(price.component);
  }

  if (exceptions.length > 0) {
    const r = fail();
    r.termBucket = bucket;
    r.pricingType = pricingType;
    return r;
  }

  return {
    ...base,
    status: 'COMPUTED',
    recognitionDate,
    actualDays,
    termBucket: bucket,
    pricingType,
    collectedAmount: coll.collected,
    totalAmount: sum(components.map((c) => c.amount)),
    components,
    exceptions: [],
  };
}

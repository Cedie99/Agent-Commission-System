import { roundMoney, ZERO } from '@ocs/shared/money';
import { explainPrice, explainPriceForfeit } from '../explain';
import { findPriceRate } from '../ruleset';
import type { CommissionComponent, EngineException, InvoiceLineInput, IsoDate, PricingType, RuleSet, TermBucket } from '../types';

/**
 * Price Commission: overprice × qty × %, where overprice = selling price − pricelist price (SRP).
 * Only for channels in config.priceCommissionChannels (EU; TB behind a flag) and only when
 * the line sold above SRP. Beyond 120 days: per the rate table (FORFEIT by default).
 * Returns nothing when the line doesn't qualify.
 */
export function computePrice(
  rs: RuleSet,
  line: InvoiceLineInput,
  ctx: { pricingType: PricingType; bucket: TermBucket; rateDate: IsoDate; payeeId: string },
): { component?: CommissionComponent; exception?: EngineException; skippedReason?: string } {
  if (!(rs.config.priceCommissionChannels as string[]).includes(line.channel)) {
    return { skippedReason: `Price commission not applicable to channel ${line.channel}` };
  }
  if (ctx.pricingType !== 'STANDARD' || line.pricelistPrice === null) return { skippedReason: 'Not sold at/above SRP' };
  const overprice = line.unitPrice.minus(line.pricelistPrice);
  if (!overprice.gt(0)) return { skippedReason: 'No overprice' };

  const hit = findPriceRate(rs, { bucket: ctx.bucket, asOf: ctx.rateDate });
  if (!hit.ok) {
    return {
      exception:
        hit.reason === 'UNDEFINED'
          ? { code: 'UNDEFINED_RATE', message: `No Price Commission rate defined for ${ctx.bucket} effective ${ctx.rateDate}` }
          : { code: 'OVERLAPPING_EFFECTIVE_RATES', message: `${hit.candidates.length} Price rates overlap for ${ctx.bucket} on ${ctx.rateDate}` },
    };
  }
  const r = hit.entry;
  // Basis is stored at the DB scale (4 dp) so stored basis × rate reproduces the amount exactly.
  const basis = overprice.times(line.qty).toDecimalPlaces(4);
  const base = { type: 'PRICE' as const, payeeRole: 'AS' as const, payeeId: ctx.payeeId, basis, rateEntryId: r.entryId };
  if (r.kind === 'FORFEIT') {
    return {
      component: {
        ...base,
        rate: ZERO,
        amount: ZERO,
        explanation: explainPriceForfeit({ overprice, qty: line.qty, basis, channel: line.channel, bucket: ctx.bucket }),
        internalNotes: `Rate table "${r.tableName}" marks ${ctx.bucket} as forfeited`,
      },
    };
  }
  const amount = roundMoney(basis.times(r.rate));
  return {
    component: {
      ...base,
      rate: r.rate,
      amount,
      explanation: explainPrice({ overprice, qty: line.qty, rate: r.rate, amount, channel: line.channel, bucket: ctx.bucket }),
      internalNotes: `Rate table "${r.tableName}" (effective ${r.effectiveFrom}${r.effectiveTo ? ` to ${r.effectiveTo}` : ''})`,
    },
  };
}

import { roundMoney, ZERO } from '@ocs/shared/money';
import { explainVolume, explainVolumeForfeit } from '../explain';
import { findVolumeRate } from '../ruleset';
import type { CommissionComponent, EngineException, InvoiceLineInput, IsoDate, PricingType, RuleSet, TermBucket } from '../types';

/** Volume Commission: liters × ₱/L, by channel × pricing type × term bucket. Paid to the AS. */
export function computeVolume(
  rs: RuleSet,
  line: InvoiceLineInput,
  ctx: { pricingType: PricingType; bucket: TermBucket; rateDate: IsoDate; payeeId: string },
): { component?: CommissionComponent; exception?: EngineException } {
  const hit = findVolumeRate(rs, { channel: line.channel, pricingType: ctx.pricingType, bucket: ctx.bucket, asOf: ctx.rateDate });
  if (!hit.ok) {
    return {
      exception:
        hit.reason === 'UNDEFINED'
          ? {
              code: 'UNDEFINED_RATE',
              message: `No Volume Commission rate defined for ${line.channel} / ${ctx.pricingType} / ${ctx.bucket} effective ${ctx.rateDate}`,
            }
          : {
              code: 'OVERLAPPING_EFFECTIVE_RATES',
              message: `${hit.candidates.length} Volume rates overlap for ${line.channel} / ${ctx.pricingType} / ${ctx.bucket} on ${ctx.rateDate}`,
            },
    };
  }
  const r = hit.entry;
  const base = {
    type: 'VOLUME' as const,
    payeeRole: 'AS' as const,
    payeeId: ctx.payeeId,
    basis: line.liters,
    rateEntryId: r.entryId,
  };
  if (r.kind === 'FORFEIT') {
    return {
      component: {
        ...base,
        rate: ZERO,
        amount: ZERO,
        explanation: explainVolumeForfeit({ liters: line.liters, channel: line.channel, pricingType: ctx.pricingType, bucket: ctx.bucket }),
        internalNotes: `Rate table "${r.tableName}" marks ${ctx.bucket} as forfeited`,
      },
    };
  }
  const amount = roundMoney(line.liters.times(r.rate));
  return {
    component: {
      ...base,
      rate: r.rate,
      amount,
      explanation: explainVolume({ liters: line.liters, rate: r.rate, amount, channel: line.channel, pricingType: ctx.pricingType, bucket: ctx.bucket }),
      internalNotes: `Rate table "${r.tableName}" (effective ${r.effectiveFrom}${r.effectiveTo ? ` to ${r.effectiveTo}` : ''})`,
    },
  };
}

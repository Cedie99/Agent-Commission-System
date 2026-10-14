import type { EngineConfig, InvoiceLineInput, PricingType } from './types';

export type PricingResult =
  | { ok: true; pricingType: PricingType; reason: 'FORCED' | 'AT_OR_ABOVE_PRICELIST' | 'APPROVED_DISCOUNT' | 'BELOW_PRICELIST' }
  | { ok: false; code: 'MISSING_PRICELIST_PRICE'; message: string };

/**
 * STANDARD     = sold at/above the pricelist price (SRP), or below it with an approved standard discount.
 * NON_STANDARD = sold below the pricelist price.
 * Channels in forceNonStandardChannels (RM) are always NON_STANDARD and don't need an SRP.
 */
export function resolvePricingType(config: Pick<EngineConfig, 'forceNonStandardChannels'>, line: InvoiceLineInput): PricingResult {
  if ((config.forceNonStandardChannels as string[]).includes(line.channel)) {
    return { ok: true, pricingType: 'NON_STANDARD', reason: 'FORCED' };
  }
  if (line.pricelistPrice === null) {
    return { ok: false, code: 'MISSING_PRICELIST_PRICE', message: `No pricelist price (SRP) for product on ${line.invoiceDate}` };
  }
  if (line.unitPrice.gte(line.pricelistPrice)) return { ok: true, pricingType: 'STANDARD', reason: 'AT_OR_ABOVE_PRICELIST' };
  if (line.approvedStandardDiscount) return { ok: true, pricingType: 'STANDARD', reason: 'APPROVED_DISCOUNT' };
  return { ok: true, pricingType: 'NON_STANDARD', reason: 'BELOW_PRICELIST' };
}

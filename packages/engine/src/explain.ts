/**
 * Human-readable explanation strings. Agent-safe text ONLY: never mention grace days,
 * actual days or anything that would let an agent infer the grace period.
 */
import { formatDecimal, formatPercent, formatPHP, formatRate, type Decimal } from '@ocs/shared/money';
import { PRICING_TYPE_LABELS, TERM_BUCKET_LABELS } from '@ocs/shared/enums';
import type { PricingType, TermBucket } from './types';

export const bucketLabel = (b: TermBucket) => TERM_BUCKET_LABELS[b];
export const pricingLabel = (p: PricingType) => PRICING_TYPE_LABELS[p];

export function explainVolume(p: { liters: Decimal; rate: Decimal; amount: Decimal; channel: string; pricingType: PricingType; bucket: TermBucket }): string {
  return `${formatDecimal(p.liters, 2)} L × ₱${formatRate(p.rate)}/L = ${formatPHP(p.amount)} (${p.channel}, ${pricingLabel(p.pricingType)}, ${bucketLabel(p.bucket)})`;
}

export function explainVolumeForfeit(p: { liters: Decimal; channel: string; pricingType: PricingType; bucket: TermBucket }): string {
  return `Volume commission forfeited: ${formatDecimal(p.liters, 2)} L (${p.channel}, ${pricingLabel(p.pricingType)}, ${bucketLabel(p.bucket)}) = ${formatPHP('0')}`;
}

export function explainPrice(p: { overprice: Decimal; qty: Decimal; rate: Decimal; amount: Decimal; channel: string; bucket: TermBucket }): string {
  return `Overprice ${formatPHP(p.overprice)} × ${formatDecimal(p.qty, 2)} qty × ${formatPercent(p.rate)} = ${formatPHP(p.amount)} (${p.channel}, ${bucketLabel(p.bucket)})`;
}

export function explainPriceForfeit(p: { overprice: Decimal; qty: Decimal; basis: Decimal; channel: string; bucket: TermBucket }): string {
  return `Price commission forfeited (${bucketLabel(p.bucket)}): overprice ${formatPHP(p.overprice)} × ${formatDecimal(p.qty, 2)} qty = ${formatPHP(p.basis)} not paid (${p.channel})`;
}

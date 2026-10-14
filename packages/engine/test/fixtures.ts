import { D } from '@ocs/shared/money';
import { buildInvoiceContexts } from '../src/collection';
import { computeLine } from '../src/compute-line';
import { addDays } from '../src/dates';
import type { Channel, CollectionInput, EngineConfig, InvoiceLineInput, IsoDate, PricingType, RuleSet, TermBucket, VolumeRate, PriceRate } from '../src/types';

/** Mirrors the seeded rates (apps/api/prisma/seed.ts). Independent copy on purpose. */
const VOLUME: { pricingType: PricingType; channels: Channel[]; rates: Partial<Record<TermBucket, string>> }[] = [
  { pricingType: 'STANDARD', channels: ['EU', 'DL'], rates: { COD: '4.00', D30: '3.50', D60: '3.00', D90: '2.50', D120: '2.00' } },
  { pricingType: 'STANDARD', channels: ['DR', 'TB'], rates: { COD: '2.00', D30: '1.75', D60: '1.50', D90: '1.25', D120: '1.00' } },
  { pricingType: 'NON_STANDARD', channels: ['EU', 'DL'], rates: { COD: '2.00', D30: '1.50', D60: '1.00', D90: '0.50', D120: '0.25', D120_PLUS: '0.25' } },
  { pricingType: 'NON_STANDARD', channels: ['DR', 'TB', 'RM'], rates: { COD: '1.00', D30: '0.75', D60: '0.50', D90: '0.25', D120: '0.125', D120_PLUS: '0.125' } },
];
const PRICE: [TermBucket, string, 'RATE' | 'FORFEIT'][] = [
  ['COD', '0.80', 'RATE'],
  ['D30', '0.80', 'RATE'],
  ['D60', '0.60', 'RATE'],
  ['D90', '0.40', 'RATE'],
  ['D120', '0.20', 'RATE'],
  ['D120_PLUS', '0', 'FORFEIT'],
];

export const GRACE = 12;

export function defaultConfig(overrides: Partial<EngineConfig> = {}): EngineConfig {
  return {
    graceDays: GRACE,
    buckets: [
      { bucket: 'COD', days: 0 },
      { bucket: 'D30', days: 30 },
      { bucket: 'D60', days: 60 },
      { bucket: 'D90', days: 90 },
      { bucket: 'D120', days: 120 },
      { bucket: 'D120_PLUS', days: null },
    ],
    statedTermMap: { '0': 'COD', '30': 'D30', '60': 'D60', '90': 'D90', '120': 'D120' },
    priceCommissionChannels: ['EU'],
    forceNonStandardChannels: ['RM'],
    asEligibleAccountTypes: ['AS_GENERATED', 'SS_GENERATED', 'IN_HOUSE'],
    rateDateBasis: 'INVOICE_DATE',
    collectionTolerance: D('0'),
    ...overrides,
  };
}

export function defaultRuleSet(configOverrides: Partial<EngineConfig> = {}): RuleSet {
  const volumeRates: VolumeRate[] = VOLUME.flatMap((g) =>
    g.channels.flatMap((channel) =>
      Object.entries(g.rates).map(([bucket, rate]) => ({
        entryId: `vol-${channel}-${g.pricingType}-${bucket}`,
        tableName: 'Volume Commission v1',
        channel,
        pricingType: g.pricingType,
        bucket: bucket as TermBucket,
        kind: 'RATE' as const,
        rate: D(rate!),
        effectiveFrom: '2020-01-01',
        effectiveTo: null,
      })),
    ),
  );
  const priceRates: PriceRate[] = PRICE.map(([bucket, rate, kind]) => ({
    entryId: `price-${bucket}`,
    tableName: 'Price Commission v1',
    bucket,
    kind,
    rate: D(rate),
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
  }));
  return { id: 'test', hash: 'test-hash', asOf: '2026-12-31', config: defaultConfig(configOverrides), volumeRates, priceRates };
}

export const INVOICE_DATE: IsoDate = '2026-01-01';

export function line(overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput {
  return {
    invoiceNo: 'INV-1',
    lineNo: 1,
    invoiceDate: INVOICE_DATE,
    customerId: 'cust-1',
    productId: 'prod-1',
    channel: 'EU',
    accountType: 'AS_GENERATED',
    statedTermDays: 30,
    liters: D('1000'),
    qty: D('1000'),
    unitPrice: D('100'),
    pricelistPrice: D('100'),
    approvedStandardDiscount: false,
    asId: 'as-1',
    ...overrides,
  };
}

/** One cleared payment covering `amount` on day N after the invoice date. */
export function paid(invoiceNo: string, amount: string, onDay: number, invoiceDate: IsoDate = INVOICE_DATE, ref = `OR-${onDay}`): CollectionInput {
  return { invoiceNo, amount: D(amount), clearedDate: addDays(invoiceDate, onDay), status: 'CLEARED', reference: ref };
}

/** Compute a single line that is fully paid on day N (single payment of the line total). */
export function computePaidOnDay(l: InvoiceLineInput, day: number, rs: RuleSet = defaultRuleSet()) {
  const total = l.qty.times(l.unitPrice).toFixed(2);
  return computeOne(rs, [l], [paid(l.invoiceNo, total, day, l.invoiceDate)])[0]!;
}

export function computeOne(rs: RuleSet, lines: InvoiceLineInput[], collections: CollectionInput[]) {
  const ctx = buildInvoiceContexts(lines, collections);
  return lines.map((l) => computeLine(rs, l, ctx.get(l.invoiceNo)!));
}

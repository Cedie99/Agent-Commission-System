import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { canonicalRuleSetJson, type EngineConfig, type RuleSet } from '@ocs/engine';
import { D, type Channel, type PricingType, type TermBucket } from '@ocs/shared';
import { isoDate, isoDateOrNull, dateFromIso, toD } from '../common/convert';
import { PrismaService } from '../common/prisma.service';

const REQUIRED_SETTINGS = [
  'graceDays',
  'buckets',
  'statedTermMap',
  'priceCommissionChannels',
  'forceNonStandardChannels',
  'asEligibleAccountTypes',
  'rateDateBasis',
  'collectionTolerance',
] as const;

/**
 * Builds the engine RuleSet from the DB. The engine never touches the DB; this is the
 * only place rates/settings are read for computation.
 *
 *  - Engine settings: latest value per key with effectiveFrom ≤ asOf.
 *  - Rate tables: every table with effectiveFrom ≤ asOf (each entry carries its table's
 *    effective range, so the engine picks the right version per line date).
 */
@Injectable()
export class RuleSetResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(asOf: string): Promise<RuleSet> {
    const asOfDate = dateFromIso(asOf);
    const settings = await this.prisma.engineSetting.findMany({
      where: { effectiveFrom: { lte: asOfDate } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const latest = new Map<string, unknown>();
    for (const s of settings) if (!latest.has(s.key)) latest.set(s.key, s.value);
    const missing = REQUIRED_SETTINGS.filter((k) => !latest.has(k));
    if (missing.length) throw new Error(`Engine settings missing as of ${asOf}: ${missing.join(', ')}`);

    const config: EngineConfig = {
      graceDays: Number(latest.get('graceDays')),
      buckets: latest.get('buckets') as EngineConfig['buckets'],
      statedTermMap: latest.get('statedTermMap') as EngineConfig['statedTermMap'],
      priceCommissionChannels: latest.get('priceCommissionChannels') as Channel[],
      forceNonStandardChannels: latest.get('forceNonStandardChannels') as Channel[],
      asEligibleAccountTypes: latest.get('asEligibleAccountTypes') as EngineConfig['asEligibleAccountTypes'],
      rateDateBasis: latest.get('rateDateBasis') as EngineConfig['rateDateBasis'],
      collectionTolerance: D(String(latest.get('collectionTolerance'))),
    };

    const tables = await this.prisma.rateTable.findMany({
      where: { effectiveFrom: { lte: asOfDate } },
      include: { entries: true },
      orderBy: { effectiveFrom: 'asc' },
    });

    const content: Omit<RuleSet, 'id' | 'hash'> = {
      asOf,
      config,
      volumeRates: tables
        .filter((t) => t.type === 'VOLUME')
        .flatMap((t) =>
          t.entries
            .filter((e) => e.channel && e.pricingType)
            .map((e) => ({
              entryId: e.id,
              tableName: t.name,
              channel: e.channel as Channel,
              pricingType: e.pricingType as PricingType,
              bucket: e.termBucket as TermBucket,
              kind: e.kind,
              rate: toD(e.rate),
              effectiveFrom: isoDate(t.effectiveFrom),
              effectiveTo: isoDateOrNull(t.effectiveTo),
            })),
        ),
      priceRates: tables
        .filter((t) => t.type === 'PRICE')
        .flatMap((t) =>
          t.entries.map((e) => ({
            entryId: e.id,
            tableName: t.name,
            bucket: e.termBucket as TermBucket,
            kind: e.kind,
            rate: toD(e.rate),
            effectiveFrom: isoDate(t.effectiveFrom),
            effectiveTo: isoDateOrNull(t.effectiveTo),
          })),
        ),
    };
    const hash = createHash('sha256').update(canonicalRuleSetJson(content)).digest('hex');
    return { id: `rs-${asOf}-${hash.slice(0, 12)}`, hash, ...content };
  }
}

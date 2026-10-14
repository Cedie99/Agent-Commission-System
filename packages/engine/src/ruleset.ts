import { D, Decimal } from '@ocs/shared/money';
import { CHANNELS, TERM_BUCKETS } from '@ocs/shared/enums';
import { inRange } from './dates';
import type { EngineConfig, IsoDate, PriceRate, RuleSet, VolumeRate } from './types';

// ───────────── serialization (snapshot stored on ComputeRun) ─────────────

export interface SerializedRuleSet {
  id: string;
  hash: string;
  asOf: IsoDate;
  config: Omit<EngineConfig, 'collectionTolerance'> & { collectionTolerance: string };
  volumeRates: (Omit<VolumeRate, 'rate'> & { rate: string })[];
  priceRates: (Omit<PriceRate, 'rate'> & { rate: string })[];
}

export function serializeRuleSet(rs: RuleSet): SerializedRuleSet {
  return {
    id: rs.id,
    hash: rs.hash,
    asOf: rs.asOf,
    config: { ...rs.config, collectionTolerance: rs.config.collectionTolerance.toFixed(4) },
    volumeRates: rs.volumeRates.map((r) => ({ ...r, rate: r.rate.toFixed(4) })),
    priceRates: rs.priceRates.map((r) => ({ ...r, rate: r.rate.toFixed(4) })),
  };
}

export function deserializeRuleSet(s: SerializedRuleSet): RuleSet {
  return {
    id: s.id,
    hash: s.hash,
    asOf: s.asOf,
    config: { ...s.config, collectionTolerance: D(s.config.collectionTolerance) },
    volumeRates: s.volumeRates.map((r) => ({ ...r, rate: D(r.rate) })),
    priceRates: s.priceRates.map((r) => ({ ...r, rate: D(r.rate) })),
  };
}

/** Deterministic JSON of the rule content (excluding id/hash) — the caller hashes this. */
export function canonicalRuleSetJson(rs: Omit<RuleSet, 'hash' | 'id'> | RuleSet): string {
  const { id: _id, hash: _hash, ...content } = serializeRuleSet({ id: '', hash: '', ...rs } as RuleSet);
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  const sorted = {
    ...content,
    volumeRates: [...content.volumeRates].sort((a, b) => a.entryId.localeCompare(b.entryId)),
    priceRates: [...content.priceRates].sort((a, b) => a.entryId.localeCompare(b.entryId)),
  };
  return JSON.stringify(sortKeys(sorted));
}

// ───────────── validation ─────────────

/** Structural checks. Returns human-readable problems (empty = valid). */
export function validateRuleSet(rs: RuleSet): string[] {
  const problems: string[] = [];
  const c = rs.config;
  if (!Number.isInteger(c.graceDays) || c.graceDays < 0) problems.push('config.graceDays must be a non-negative integer');
  const order = c.buckets.map((b) => b.bucket);
  if (order.join() !== TERM_BUCKETS.join()) problems.push(`config.buckets must list ${TERM_BUCKETS.join(', ')} in order`);
  let prev = -1;
  for (const b of c.buckets) {
    if (b.days === null) continue;
    if (b.days <= prev) problems.push(`config.buckets days must be strictly ascending (at ${b.bucket})`);
    prev = b.days;
  }
  if (c.buckets.at(-1)?.days !== null) problems.push('config.buckets: last bucket must be open-ended (days: null)');
  for (const [days, bucket] of Object.entries(c.statedTermMap)) {
    if (!/^\d+$/.test(days)) problems.push(`config.statedTermMap key "${days}" must be whole days`);
    if (!(TERM_BUCKETS as readonly string[]).includes(bucket)) problems.push(`config.statedTermMap ${days} → unknown bucket ${bucket}`);
  }
  for (const ch of [...c.priceCommissionChannels, ...c.forceNonStandardChannels]) {
    if (!(CHANNELS as readonly string[]).includes(ch)) problems.push(`unknown channel ${ch} in config`);
  }
  if (!(c.collectionTolerance instanceof Decimal) || c.collectionTolerance.isNegative()) {
    problems.push('config.collectionTolerance must be a non-negative Decimal');
  }
  for (const r of [...rs.volumeRates, ...rs.priceRates]) {
    if (r.rate.isNegative()) problems.push(`rate entry ${r.entryId} is negative`);
    if (r.effectiveTo !== null && r.effectiveTo < r.effectiveFrom) problems.push(`rate entry ${r.entryId} has effectiveTo before effectiveFrom`);
  }
  return problems;
}

// ───────────── lookup ─────────────

export type RateLookup<T> = { ok: true; entry: T } | { ok: false; reason: 'UNDEFINED' | 'OVERLAP'; candidates: T[] };

export function findVolumeRate(
  rs: RuleSet,
  q: { channel: string; pricingType: string; bucket: string; asOf: IsoDate },
): RateLookup<VolumeRate> {
  const hits = rs.volumeRates.filter(
    (r) => r.channel === q.channel && r.pricingType === q.pricingType && r.bucket === q.bucket && inRange(q.asOf, r.effectiveFrom, r.effectiveTo),
  );
  return pick(hits);
}

export function findPriceRate(rs: RuleSet, q: { bucket: string; asOf: IsoDate }): RateLookup<PriceRate> {
  const hits = rs.priceRates.filter((r) => r.bucket === q.bucket && inRange(q.asOf, r.effectiveFrom, r.effectiveTo));
  return pick(hits);
}

function pick<T>(hits: T[]): RateLookup<T> {
  if (hits.length === 1) return { ok: true, entry: hits[0]! };
  return { ok: false, reason: hits.length === 0 ? 'UNDEFINED' : 'OVERLAP', candidates: hits };
}

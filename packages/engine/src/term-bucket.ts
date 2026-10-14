import type { EngineConfig, TermBucket } from './types';

export type TermBucketResult =
  | { ok: true; bucket: TermBucket; statedBucket: TermBucket; withinStatedGrace: boolean }
  | { ok: false; code: 'UNMAPPED_STATED_TERM'; message: string };

/**
 * Term bucket rule.
 *  actualDays = recognitionDate − invoiceDate.
 *  If actualDays ≤ statedDays + grace → the stated bucket.
 *  Otherwise the smallest bucket (≥ stated) where actualDays ≤ bucketDays + grace,
 *  else the open-ended bucket (D120_PLUS).
 *
 * CONFIDENTIAL: grace must not leak into agent-facing text. Callers put grace reasoning
 * only in internalNotes.
 */
export function resolveTermBucket(config: Pick<EngineConfig, 'graceDays' | 'buckets' | 'statedTermMap'>, statedTermDays: number, actualDays: number): TermBucketResult {
  const statedBucket = config.statedTermMap[String(statedTermDays)];
  if (!statedBucket) {
    return {
      ok: false,
      code: 'UNMAPPED_STATED_TERM',
      message: `Stated term of ${statedTermDays} days does not map to a term bucket`,
    };
  }
  const statedDef = config.buckets.find((b) => b.bucket === statedBucket);
  if (!statedDef || statedDef.days === null) {
    return { ok: false, code: 'UNMAPPED_STATED_TERM', message: `Stated term bucket ${statedBucket} has no day limit` };
  }
  const grace = config.graceDays;
  if (actualDays <= statedDef.days + grace) {
    return { ok: true, bucket: statedBucket, statedBucket, withinStatedGrace: true };
  }
  for (const b of config.buckets) {
    if (b.days === null || b.days < statedDef.days) continue;
    if (actualDays <= b.days + grace) return { ok: true, bucket: b.bucket, statedBucket, withinStatedGrace: false };
  }
  const open = config.buckets.find((b) => b.days === null);
  return { ok: true, bucket: open?.bucket ?? 'D120_PLUS', statedBucket, withinStatedGrace: false };
}

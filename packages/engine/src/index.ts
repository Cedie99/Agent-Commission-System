/**
 * @ocs/engine — pure commission engine.
 * No DB, framework or IO imports (enforced by ESLint). Rates and data in, results out.
 */
export * from './types';
export { computeLine, type ComputeLineOptions } from './compute-line';
export { computeRun } from './compute-run';
export { buildInvoiceContexts, resolveCollection, type CollectionState } from './collection';
export { resolveTermBucket, type TermBucketResult } from './term-bucket';
export { resolvePricingType, type PricingResult } from './pricing';
export {
  canonicalRuleSetJson,
  deserializeRuleSet,
  findPriceRate,
  findVolumeRate,
  serializeRuleSet,
  validateRuleSet,
  type SerializedRuleSet,
} from './ruleset';
export { addDays, daysBetween } from './dates';
export { ENGINE_VERSION } from './version';

/**
 * Checks for the engine settings Finance and Admin can change. They mirror what the engine
 * requires (validateRuleSet in packages/engine/src/ruleset.ts), so a bad value is refused when it
 * is saved instead of failing the next run. Messages are written for the person editing the setting.
 */
import { z } from 'zod';
import { ACCOUNT_TYPES, CHANNELS, TERM_BUCKETS } from './enums';
import { isDecimalString } from './money';

const unique = (list: readonly unknown[]) => new Set(list).size === list.length;
const message = (text: string) => ({ errorMap: () => ({ message: text }) });
const bucket = z.enum(TERM_BUCKETS, message('Unknown term bucket: use COD, 30, 60, 90, 120 or beyond 120 days'));
const channelList = z.array(z.enum(CHANNELS, message('Unknown channel: use EU, DL, DR, TB or RM'))).refine(unique, 'Pick each channel only once');
const days = z.number({ invalid_type_error: 'Enter a whole number of days' }).int('Enter a whole number of days').min(0, 'Days can’t be negative');

export const ENGINE_SETTING_SCHEMAS = {
  graceDays: days.max(365, 'That is more than a year'),
  buckets: z
    .array(z.object({ bucket, days: days.nullable() }))
    .refine((bs) => bs.map((b) => b.bucket).join() === TERM_BUCKETS.join(), 'The buckets must be COD, 30, 60, 90, 120 and beyond 120 days, in that order')
    .refine((bs) => bs.at(-1)?.days === null && bs.slice(0, -1).every((b) => b.days !== null), 'Every bucket except "beyond 120 days" needs a day limit')
    .refine((bs) => bs.slice(1, -1).every((b, i) => (b.days ?? 0) > (bs[i]!.days ?? 0)), 'Each limit must be more days than the one before it'),
  statedTermMap: z.record(z.string().regex(/^\d+$/, 'Stated terms are whole days, e.g. 30'), bucket),
  priceCommissionChannels: channelList,
  forceNonStandardChannels: channelList,
  asEligibleAccountTypes: z.array(z.enum(ACCOUNT_TYPES, message('Unknown account type'))).refine(unique, 'Pick each account type only once'),
  rateDateBasis: z.enum(['INVOICE_DATE', 'RECOGNITION_DATE'], message('Pick the invoice date or the date the invoice was fully paid')),
  collectionTolerance: z.string().refine((s) => isDecimalString(s) && !s.trim().startsWith('-'), 'Enter a peso amount of 0 or more, e.g. 0.00'),
} satisfies Record<string, z.ZodTypeAny>;

export type EngineSettingKey = keyof typeof ENGINE_SETTING_SCHEMAS;

/** Why `value` can't be saved as `key`, or null when it can. Keys without a check here aren't checked. */
export function engineSettingProblem(key: string, value: unknown): string | null {
  const schema = (ENGINE_SETTING_SCHEMAS as Record<string, z.ZodTypeAny>)[key];
  if (!schema) return null;
  const r = schema.safeParse(value);
  return r.success ? null : (r.error.issues[0]?.message ?? 'That value isn’t valid');
}

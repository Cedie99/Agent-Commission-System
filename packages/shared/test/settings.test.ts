import { describe, expect, it } from 'vitest';
import { engineSettingProblem } from '../src/settings';

const BUCKETS = [
  { bucket: 'COD', days: 0 },
  { bucket: 'D30', days: 30 },
  { bucket: 'D60', days: 60 },
  { bucket: 'D90', days: 90 },
  { bucket: 'D120', days: 120 },
  { bucket: 'D120_PLUS', days: null },
];

describe('engine setting checks', () => {
  it('accepts the seeded values', () => {
    expect(engineSettingProblem('graceDays', 12)).toBeNull();
    expect(engineSettingProblem('buckets', BUCKETS)).toBeNull();
    expect(engineSettingProblem('statedTermMap', { '0': 'COD', '30': 'D30', '45': 'D60' })).toBeNull();
    expect(engineSettingProblem('priceCommissionChannels', ['EU', 'TB'])).toBeNull();
    expect(engineSettingProblem('forceNonStandardChannels', ['RM'])).toBeNull();
    expect(engineSettingProblem('asEligibleAccountTypes', ['AS_GENERATED', 'IN_HOUSE'])).toBeNull();
    expect(engineSettingProblem('rateDateBasis', 'RECOGNITION_DATE')).toBeNull();
    expect(engineSettingProblem('collectionTolerance', '5.00')).toBeNull();
  });

  it('refuses values the engine would reject', () => {
    expect(engineSettingProblem('graceDays', -1)).toMatch(/negative/);
    expect(engineSettingProblem('graceDays', 1.5)).toMatch(/whole number/);
    expect(engineSettingProblem('graceDays', '12')).toMatch(/whole number/);
    expect(engineSettingProblem('buckets', [BUCKETS[1], BUCKETS[0], ...BUCKETS.slice(2)])).toMatch(/in that order/);
    expect(engineSettingProblem('buckets', BUCKETS.map((b) => (b.bucket === 'D60' ? { ...b, days: 30 } : b)))).toMatch(/more days than the one before/);
    expect(engineSettingProblem('buckets', BUCKETS.map((b) => (b.bucket === 'D90' ? { ...b, days: null } : b)))).toMatch(/needs a day limit/);
    expect(engineSettingProblem('statedTermMap', { thirty: 'D30' })).toMatch(/whole days/);
    expect(engineSettingProblem('statedTermMap', { '45': 'D45' })).toMatch(/Unknown term bucket/);
    expect(engineSettingProblem('priceCommissionChannels', ['EU', 'EU'])).toMatch(/only once/);
    expect(engineSettingProblem('priceCommissionChannels', ['XX'])).toMatch(/Unknown channel/);
    expect(engineSettingProblem('asEligibleAccountTypes', ['WALK_IN'])).toMatch(/Unknown account type/);
    expect(engineSettingProblem('rateDateBasis', 'DELIVERY_DATE')).toMatch(/invoice date/);
    expect(engineSettingProblem('collectionTolerance', '-1.00')).toMatch(/0 or more/);
    expect(engineSettingProblem('collectionTolerance', 'abc')).toMatch(/peso amount/);
  });

  it("doesn't check settings it doesn't know", () => {
    expect(engineSettingProblem('somethingNew', { any: 'thing' })).toBeNull();
  });
});

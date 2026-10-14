import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { redactForRoles } from '../src/common/redaction';

const runDetail = {
  id: 'run-1',
  status: 'APPROVED',
  rulesetSnapshot: { config: { graceDays: 12, buckets: [] } },
  totals: { grandTotal: '3500.00' },
};
const resultLine = {
  id: 'l1',
  termBucket: 'D30',
  actualDays: 42,
  totalAmount: new Prisma.Decimal('3500'),
  components: [{ type: 'VOLUME', amount: '3500.0000', explanation: '1,000.00 L × ₱3.50/L = ₱3,500.00 (EU, Standard, 30 days)', internalNotes: '42 days; grace 12 days → 30 days' }],
};
const settings = [
  { key: 'graceDays', value: 12, isConfidential: true },
  { key: 'priceCommissionChannels', value: ['EU'], isConfidential: false },
];

describe('confidential redaction', () => {
  it.each(['AS', 'SS', 'RSR', 'SM', 'RSRM', 'NSM', 'VP', 'SSD', 'SUPPORT'] as const)('%s never sees grace / actual days / internal notes', (role) => {
    const out = redactForRoles({ runDetail, resultLine, settings }, [role]);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/grace/i);
    expect(json).not.toMatch(/actualDays|internalNotes|rulesetSnapshot/);
    expect(json).toContain('₱3,500.00'); // agent-safe explanation survives
    expect(json).toContain('"totalAmount":"3500"'); // Decimals still serialize
    expect((out as { settings: unknown[] }).settings).toHaveLength(1);
  });

  it('unauthenticated (no roles) is redacted too', () => {
    expect(JSON.stringify(redactForRoles({ resultLine }, undefined))).not.toMatch(/grace|actualDays/);
  });

  it.each(['FINANCE', 'ADMIN'] as const)('%s sees everything', (role) => {
    const json = JSON.stringify(redactForRoles({ runDetail, resultLine, settings }, [role]));
    expect(json).toContain('graceDays');
    expect(json).toContain('"actualDays":42');
  });

  it('a mixed-role user with FINANCE sees everything', () => {
    expect(JSON.stringify(redactForRoles({ resultLine }, ['AS', 'FINANCE']))).toContain('actualDays');
  });
});

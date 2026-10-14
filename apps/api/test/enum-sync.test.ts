import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as E from '@ocs/shared';

const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8');

function prismaEnum(name: string): string[] {
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  if (!m) throw new Error(`enum ${name} not in schema`);
  return m[1]!
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

describe('shared enums match the Prisma schema', () => {
  it.each([
    ['RoleCode', E.ROLE_CODES],
    ['Channel', E.CHANNELS],
    ['AccountType', E.ACCOUNT_TYPES],
    ['TermBucket', E.TERM_BUCKETS],
    ['PricingType', E.PRICING_TYPES],
    ['RateKind', E.RATE_KINDS],
    ['ImportType', E.IMPORT_TYPES],
    ['ImportStatus', E.IMPORT_STATUSES],
    ['CollectionStatus', E.COLLECTION_STATUSES],
    ['RunType', E.RUN_TYPES],
    ['RunStatus', E.RUN_STATUSES],
    ['ResultStatus', E.RESULT_STATUSES],
    ['ComponentType', E.COMPONENT_TYPES],
    ['ExceptionStatus', E.EXCEPTION_STATUSES],
    ['PersonStatus', E.PERSON_STATUSES],
    ['ProductCategory', E.PRODUCT_CATEGORIES],
    ['RateTableType', E.RATE_TABLE_TYPES],
  ] as const)('%s', (name, values) => {
    expect(prismaEnum(name)).toEqual([...values]);
  });
});

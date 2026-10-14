/**
 * Idempotent dev seed: roles, sample people/users, products, customers, pricelist,
 * rate tables (values from the commission brief), engine settings and default import mappings.
 *
 *   pnpm db:seed
 */
import 'dotenv/config';
import { PrismaClient, Prisma, type Channel, type PricingType, type TermBucket, type RoleCode } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ROLE_CODES } from '@ocs/shared';

const prisma = new PrismaClient();
const dec = (s: string) => new Prisma.Decimal(s);
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);

const RATES_EFFECTIVE_FROM = '2020-01-01';

const ROLE_NAMES: Record<RoleCode, string> = {
  ADMIN: 'Administrator',
  FINANCE: 'Finance',
  SSD: 'Sales Support Department',
  VP: 'VP - Sales & Marketing',
  NSM: 'National Sales Manager',
  SM: 'Sales Manager',
  RSRM: 'RSR Manager',
  SS: 'Sales Specialist',
  RSR: 'Regional Sales Representative',
  AS: 'Account Specialist',
  SUPPORT: 'Support',
};

// ── Volume Commission (₱/L). Missing cells are UNDEFINED on purpose (→ EXCEPTION). ──
type Row = Partial<Record<TermBucket, string>>;
const VOLUME: { pricingType: PricingType; channels: Channel[]; rates: Row }[] = [
  { pricingType: 'STANDARD', channels: ['EU', 'DL'], rates: { COD: '4.00', D30: '3.50', D60: '3.00', D90: '2.50', D120: '2.00' } },
  { pricingType: 'STANDARD', channels: ['DR', 'TB'], rates: { COD: '2.00', D30: '1.75', D60: '1.50', D90: '1.25', D120: '1.00' } },
  {
    pricingType: 'NON_STANDARD',
    channels: ['EU', 'DL'],
    rates: { COD: '2.00', D30: '1.50', D60: '1.00', D90: '0.50', D120: '0.25', D120_PLUS: '0.25' },
  },
  {
    pricingType: 'NON_STANDARD',
    channels: ['DR', 'TB', 'RM'],
    rates: { COD: '1.00', D30: '0.75', D60: '0.50', D90: '0.25', D120: '0.125', D120_PLUS: '0.125' },
  },
];

// ── Price Commission (% of overprice × qty). Beyond 120 = FORFEIT (open question 2). ──
const PRICE: { bucket: TermBucket; rate: string; kind: 'RATE' | 'FORFEIT' }[] = [
  { bucket: 'COD', rate: '0.80', kind: 'RATE' },
  { bucket: 'D30', rate: '0.80', kind: 'RATE' },
  { bucket: 'D60', rate: '0.60', kind: 'RATE' },
  { bucket: 'D90', rate: '0.40', kind: 'RATE' },
  { bucket: 'D120', rate: '0.20', kind: 'RATE' },
  { bucket: 'D120_PLUS', rate: '0', kind: 'FORFEIT' },
];

const ENGINE_SETTINGS: { key: string; value: Prisma.InputJsonValue; isConfidential?: boolean; description: string }[] = [
  { key: 'graceDays', value: 12, isConfidential: true, description: 'CONFIDENTIAL. Days added to each bucket limit before moving to the next bucket.' },
  {
    key: 'buckets',
    value: [
      { bucket: 'COD', days: 0 },
      { bucket: 'D30', days: 30 },
      { bucket: 'D60', days: 60 },
      { bucket: 'D90', days: 90 },
      { bucket: 'D120', days: 120 },
      { bucket: 'D120_PLUS', days: null },
    ],
    description: 'Term buckets in ascending order.',
  },
  { key: 'statedTermMap', value: { '0': 'COD', '30': 'D30', '60': 'D60', '90': 'D90', '120': 'D120' }, description: 'Stated ERIC6 terms (days) → bucket. Unmapped terms raise UNMAPPED_STATED_TERM (open question 14).' },
  { key: 'priceCommissionChannels', value: ['EU'], description: "Channels earning Price Commission. Add 'TB' if open question 1 is answered EU & TB." },
  { key: 'forceNonStandardChannels', value: ['RM'], description: 'Channels always using Non-Standard volume rates.' },
  { key: 'asEligibleAccountTypes', value: ['AS_GENERATED', 'SS_GENERATED', 'IN_HOUSE'], description: 'Account types whose lines pay AS Volume/Price commission (open question 15).' },
  { key: 'rateDateBasis', value: 'INVOICE_DATE', description: 'Which date selects the effective rate table: INVOICE_DATE or RECOGNITION_DATE (open question 13).' },
  { key: 'collectionTolerance', value: '0.00', description: 'Peso shortfall still treated as fully collected (open question 12).' },
];

const PEOPLE = [
  { code: 'VP-001', fullName: 'VP Sales & Marketing (sample)', role: 'VP' as const, manager: null },
  { code: 'NSM-001', fullName: 'National Sales Manager (sample)', role: 'NSM' as const, manager: 'VP-001' },
  { code: 'SM-001', fullName: 'Sales Manager North (sample)', role: 'SM' as const, manager: 'NSM-001' },
  { code: 'SS-001', fullName: 'Sales Specialist One (sample)', role: 'SS' as const, manager: 'SM-001' },
  { code: 'AS-001', fullName: 'Account Specialist One (sample)', role: 'AS' as const, manager: 'SS-001' },
  { code: 'AS-002', fullName: 'Account Specialist Two (sample)', role: 'AS' as const, manager: 'SS-001' },
];

const USERS: { email: string; roles: RoleCode[]; person?: string }[] = [
  { email: 'admin@ocs.local', roles: ['ADMIN'] },
  { email: 'finance@ocs.local', roles: ['FINANCE'] },
  { email: 'ssd@ocs.local', roles: ['SSD'] },
  { email: 'vp@ocs.local', roles: ['VP'], person: 'VP-001' },
  { email: 'as1@ocs.local', roles: ['AS'], person: 'AS-001' },
];

const PRODUCTS = [
  { eric6Code: 'LUB-0001', name: 'Engine Oil SAE 40 1L', litersPerUnit: '1', category: 'LUBE' as const, price: '250.00' },
  { eric6Code: 'LUB-0004', name: 'Engine Oil SAE 40 4L', litersPerUnit: '4', category: 'LUBE' as const, price: '850.00' },
  { eric6Code: 'LUB-0018', name: 'Hydraulic Oil AW68 18L Pail', litersPerUnit: '18', category: 'LUBE' as const, price: '1950.00' },
  { eric6Code: 'LUB-0200', name: 'Gear Oil 85W-140 200L Drum', litersPerUnit: '200', category: 'LUBE' as const, price: '24000.00' },
  { eric6Code: 'CHM-0020', name: 'Base Oil SN150 20L', litersPerUnit: '20', category: 'CHEMICAL' as const, price: '1500.00' },
  // Deliberately NOT on the pricelist → MISSING_PRICELIST_PRICE in the sample run.
  { eric6Code: 'LUB-0999', name: 'New Product (no SRP yet)', litersPerUnit: '1', category: 'LUBE' as const, price: null },
];

const CUSTOMERS = [
  { eric6Code: 'C-EU-0001', name: 'Sample End-User Manufacturing Corp.', channel: 'EU' as const, accountType: 'AS_GENERATED' as const, as: 'AS-001' },
  { eric6Code: 'C-DL-0001', name: 'Sample Dealer Auto Supply', channel: 'DL' as const, accountType: 'AS_GENERATED' as const, as: 'AS-001' },
  { eric6Code: 'C-DR-0001', name: 'Sample Distributor Trading', channel: 'DR' as const, accountType: 'SS_GENERATED' as const, as: 'AS-002' },
  { eric6Code: 'C-TB-0001', name: 'Sample Toll-Blending Partner', channel: 'TB' as const, accountType: 'AS_GENERATED' as const, as: 'AS-002' },
  { eric6Code: 'C-RM-0001', name: 'Sample Raw Material Buyer', channel: 'RM' as const, accountType: 'IN_HOUSE' as const, as: 'AS-001' },
];

/** Default mappings match the templates in /samples. Edit these (Settings) once real ERIC6 headers are known. */
const MAPPINGS = {
  SALES: {
    headerRow: 1,
    columns: {
      invoiceNo: ['Invoice No', 'Invoice #', 'SI No', 'Doc No'],
      lineNo: ['Line No', 'Line', 'Seq'],
      invoiceDate: ['Invoice Date', 'SI Date', 'Doc Date'],
      customerCode: ['Customer Code', 'Cust Code', 'Customer'],
      productCode: ['Item Code', 'Product Code', 'Item'],
      qty: ['Qty', 'Quantity'],
      unitPrice: ['Unit Price', 'Price'],
      statedTermDays: ['Terms', 'Term Days', 'Terms (days)'],
      liters: ['Liters', 'Volume (L)'],
      pricelistPrice: ['SRP', 'Pricelist Price', 'List Price'],
      approvedStandardDiscount: ['Approved Std Discount', 'Std Discount'],
      invoiceTotal: ['Invoice Total', 'SI Amount'],
      asCode: ['AS Code', 'Salesman Code'],
    },
    trueValues: ['Y', 'YES', 'TRUE', '1', 'X'],
  },
  COLLECTIONS: {
    headerRow: 1,
    columns: {
      invoiceNo: ['Invoice No', 'SI No', 'Applied To'],
      reference: ['OR No', 'CR No', 'Receipt No', 'Reference'],
      checkNo: ['Check No', 'Cheque No'],
      amount: ['Amount Applied', 'Amount'],
      clearedDate: ['Cleared Date', 'Date Cleared'],
      status: ['Status'],
      paymentDate: ['Payment Date', 'OR Date'],
    },
    trueValues: ['Y', 'YES', 'TRUE', '1', 'X'],
  },
} as const;

async function main() {
  // Roles
  for (const code of ROLE_CODES) {
    await prisma.role.upsert({ where: { code }, update: { name: ROLE_NAMES[code] }, create: { code, name: ROLE_NAMES[code] } });
  }

  // People (in reporting-line order)
  const personIds = new Map<string, string>();
  for (const p of PEOPLE) {
    const managerId = p.manager ? personIds.get(p.manager) ?? null : null;
    const row = await prisma.person.upsert({
      where: { code: p.code },
      update: { fullName: p.fullName, role: p.role, managerId },
      create: { code: p.code, fullName: p.fullName, role: p.role, managerId },
    });
    personIds.set(p.code, row.id);
  }

  // Users
  const password = process.env.SEED_DEFAULT_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(password, 10);
  for (const u of USERS) {
    const personId = u.person ? personIds.get(u.person) ?? null : null;
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { personId },
      create: { email: u.email, passwordHash, personId },
    });
    for (const roleCode of u.roles) {
      await prisma.userRole.upsert({
        where: { userId_roleCode: { userId: user.id, roleCode } },
        update: {},
        create: { userId: user.id, roleCode },
      });
    }
  }

  // Products
  const productIds = new Map<string, string>();
  for (const p of PRODUCTS) {
    const row = await prisma.product.upsert({
      where: { eric6Code: p.eric6Code },
      update: { name: p.name, litersPerUnit: dec(p.litersPerUnit), category: p.category },
      create: { eric6Code: p.eric6Code, name: p.name, litersPerUnit: dec(p.litersPerUnit), category: p.category },
    });
    productIds.set(p.eric6Code, row.id);
  }

  // Customers
  for (const c of CUSTOMERS) {
    const data = {
      name: c.name,
      channel: c.channel,
      accountType: c.accountType,
      asId: personIds.get(c.as) ?? null,
      ssId: personIds.get('SS-001') ?? null,
      smId: personIds.get('SM-001') ?? null,
      hasCIS: true,
      hasCAS: true,
      casCosignedBySM: true,
    };
    await prisma.customer.upsert({ where: { eric6Code: c.eric6Code }, update: data, create: { eric6Code: c.eric6Code, ...data } });
  }

  // Pricelist
  const plName = '2026 Standard Pricelist';
  let pricelist = await prisma.pricelist.findFirst({ where: { name: plName } });
  pricelist ??= await prisma.pricelist.create({ data: { name: plName, effectiveFrom: date('2026-01-01') } });
  for (const p of PRODUCTS) {
    if (!p.price) continue;
    const productId = productIds.get(p.eric6Code)!;
    await prisma.pricelistItem.upsert({
      where: { pricelistId_productId: { pricelistId: pricelist.id, productId } },
      update: { price: dec(p.price) },
      create: { pricelistId: pricelist.id, productId, price: dec(p.price) },
    });
  }

  // Rate tables (create once; edit through the app afterwards)
  const volName = 'Volume Commission v1';
  if (!(await prisma.rateTable.findFirst({ where: { name: volName } }))) {
    await prisma.rateTable.create({
      data: {
        type: 'VOLUME',
        name: volName,
        effectiveFrom: date(RATES_EFFECTIVE_FROM),
        entries: {
          create: VOLUME.flatMap((g) =>
            g.channels.flatMap((channel) =>
              Object.entries(g.rates).map(([bucket, rate]) => ({
                channel,
                pricingType: g.pricingType,
                termBucket: bucket as TermBucket,
                kind: 'RATE' as const,
                rate: dec(rate!),
              })),
            ),
          ),
        },
      },
    });
  }
  const priceName = 'Price Commission v1';
  if (!(await prisma.rateTable.findFirst({ where: { name: priceName } }))) {
    await prisma.rateTable.create({
      data: {
        type: 'PRICE',
        name: priceName,
        effectiveFrom: date(RATES_EFFECTIVE_FROM),
        entries: { create: PRICE.map((p) => ({ termBucket: p.bucket, kind: p.kind, rate: dec(p.rate) })) },
      },
    });
  }

  // Engine settings
  for (const s of ENGINE_SETTINGS) {
    await prisma.engineSetting.upsert({
      where: { key_effectiveFrom: { key: s.key, effectiveFrom: date(RATES_EFFECTIVE_FROM) } },
      update: {},
      create: {
        key: s.key,
        value: s.value,
        effectiveFrom: date(RATES_EFFECTIVE_FROM),
        isConfidential: s.isConfidential ?? false,
        description: s.description,
      },
    });
  }

  // Import mappings
  for (const [importType, config] of Object.entries(MAPPINGS) as ['SALES' | 'COLLECTIONS', unknown][]) {
    await prisma.importMapping.upsert({
      where: { importType_name: { importType, name: 'Default (sample template)' } },
      update: {},
      create: { importType, name: 'Default (sample template)', isDefault: true, config: config as Prisma.InputJsonValue },
    });
  }

  const counts = {
    roles: await prisma.role.count(),
    people: await prisma.person.count(),
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    customers: await prisma.customer.count(),
    rateTables: await prisma.rateTable.count(),
    rateEntries: await prisma.rateEntry.count(),
    engineSettings: await prisma.engineSetting.count(),
  };
  console.log('Seed complete:', counts);
  console.log(`Users: ${USERS.map((u) => u.email).join(', ')} (password from SEED_DEFAULT_PASSWORD)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

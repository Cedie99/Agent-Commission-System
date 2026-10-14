/**
 * Golden-case loader: Finance's hand-computed cases as JSON or CSV in ./cases.
 * See ./README.md for both formats.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { D } from '@ocs/shared/money';
import type { CollectionInput, EngineConfig, InvoiceLineInput, RunType } from '../../src/types';

export interface GoldenExpectation {
  invoiceNo: string;
  lineNo: number;
  status: 'PENDING_COLLECTION' | 'COMPUTED' | 'EXCEPTION';
  termBucket?: string;
  pricingType?: string;
  /** "3500.00"; omit to skip, "0.00" or "" means no component / zero. */
  volume?: string;
  price?: string;
  exceptionCodes?: string[];
}

export interface GoldenCase {
  file: string;
  name: string;
  description?: string;
  configOverrides: Partial<EngineConfig>;
  run: { runType: RunType; periodStart: string; periodEnd: string };
  lines: InvoiceLineInput[];
  collections: CollectionInput[];
  expected: GoldenExpectation[];
  expectedTotal?: string;
}

const WIDE_PERIOD = { runType: 'AS_WEEKLY' as const, periodStart: '1900-01-01', periodEnd: '2999-12-31' };

type Json = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim();
const dec = (v: unknown) => D(str(v));
const optDec = (v: unknown) => (str(v) === '' ? null : dec(v));
const bool = (v: unknown) => ['y', 'yes', 'true', '1', 'x'].includes(str(v).toLowerCase());

function toLine(o: Json): InvoiceLineInput {
  const qty = dec(o.qty);
  return {
    invoiceNo: str(o.invoiceNo),
    lineNo: Number.parseInt(str(o.lineNo) || '1', 10),
    invoiceDate: str(o.invoiceDate),
    customerId: str(o.customerId) || 'golden-customer',
    productId: str(o.productId) || 'golden-product',
    channel: str(o.channel),
    accountType: (str(o.accountType) || 'AS_GENERATED') as InvoiceLineInput['accountType'],
    statedTermDays: Number.parseInt(str(o.statedTermDays), 10),
    liters: str(o.liters) === '' ? qty : dec(o.liters),
    qty,
    unitPrice: dec(o.unitPrice),
    pricelistPrice: optDec(o.pricelistPrice),
    approvedStandardDiscount: bool(o.approvedStandardDiscount),
    invoiceTotal: optDec(o.invoiceTotal),
    asId: str(o.asId) || 'golden-as',
  };
}

function toCollection(o: Json, i: number): CollectionInput {
  const clearedDate = str(o.clearedDate) || null;
  return {
    invoiceNo: str(o.invoiceNo),
    amount: dec(o.amount),
    clearedDate,
    status: (str(o.status) || (clearedDate ? 'CLEARED' : 'PENDING')) as CollectionInput['status'],
    reference: str(o.reference) || `GOLDEN-${i + 1}`,
  };
}

function overrides(o: unknown): Partial<EngineConfig> {
  if (!o || typeof o !== 'object') return {};
  const c = { ...(o as Json) } as Json;
  if (c.collectionTolerance !== undefined) c.collectionTolerance = dec(c.collectionTolerance);
  return c as Partial<EngineConfig>;
}

function loadJson(file: string, text: string): GoldenCase {
  const j = JSON.parse(text) as Json;
  return {
    file,
    name: str(j.name) || file,
    description: str(j.description),
    configOverrides: overrides(j.configOverrides),
    run: { ...WIDE_PERIOD, ...((j.run as Json) ?? {}) } as GoldenCase['run'],
    lines: ((j.lines as Json[]) ?? []).map(toLine),
    collections: ((j.collections as Json[]) ?? []).map(toCollection),
    expected: (j.expected as GoldenExpectation[]) ?? [],
    expectedTotal: j.expectedTotal === undefined ? undefined : str(j.expectedTotal),
  };
}

/** Minimal CSV parser (handles quoted fields with commas and "" escapes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== '') && !r[0]!.trim().startsWith('#'));
  const [header, ...body] = nonEmpty;
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

/**
 * CSV format: one row per invoice line, each line its own invoice paid in one payment.
 * Columns: invoiceNo,lineNo,invoiceDate,channel,accountType,statedTermDays,liters,qty,unitPrice,
 *          pricelistPrice,approvedStandardDiscount,collectedAmount,clearedDate,
 *          expectedStatus,expectedBucket,expectedPricingType,expectedVolume,expectedPrice,expectedExceptions
 * collectedAmount blank = full line amount (qty × unitPrice). clearedDate blank = not collected.
 */
function loadCsv(file: string, text: string): GoldenCase {
  const rows = parseCsv(text);
  const lines: InvoiceLineInput[] = [];
  const collections: CollectionInput[] = [];
  const expected: GoldenExpectation[] = [];
  rows.forEach((r, i) => {
    const l = toLine(r);
    lines.push(l);
    if (r.clearedDate) {
      const amount = r.collectedAmount ? D(r.collectedAmount) : l.qty.times(l.unitPrice).toDecimalPlaces(2);
      collections.push({ invoiceNo: l.invoiceNo, amount, clearedDate: r.clearedDate, status: 'CLEARED', reference: `CSV-${i + 2}` });
    }
    expected.push({
      invoiceNo: l.invoiceNo,
      lineNo: l.lineNo,
      status: r.expectedStatus as GoldenExpectation['status'],
      termBucket: r.expectedBucket || undefined,
      pricingType: r.expectedPricingType || undefined,
      volume: r.expectedVolume || undefined,
      price: r.expectedPrice || undefined,
      exceptionCodes: r.expectedExceptions ? r.expectedExceptions.split(/[;|]/).map((s) => s.trim()) : undefined,
    });
  });
  return { file, name: file.replace(/\.csv$/, ''), configOverrides: {}, run: WIDE_PERIOD, lines, collections, expected };
}

export function loadGoldenCases(dir: string): GoldenCase[] {
  return readdirSync(dir)
    .filter((f) => /\.(json|csv)$/i.test(f))
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, f), 'utf8').replace(/^FEFF/, '');
      return f.toLowerCase().endsWith('.json') ? loadJson(f, text) : loadCsv(f, text);
    });
}

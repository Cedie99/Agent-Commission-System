/**
 * Generates /samples/{sales,collections}-template.{xlsx,csv}.
 * Codes match the dev seed. Designed for an AS_WEEKLY run of Mon 2026-10-05 .. Sun 2026-10-11.
 *
 *   pnpm samples
 *
 * Expected results of that run (developer-computed; see samples/README.md):
 *   AS-001 ₱11,400.00 · AS-002 ₱3,200.00 · grand total ₱14,600.00
 */
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(__dirname, '../../../samples');

type Cell = string | number | Date | null;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const SALES_HEADERS = ['Invoice No', 'Line No', 'Invoice Date', 'Customer Code', 'Item Code', 'Qty', 'Unit Price', 'Terms', 'Approved Std Discount'];
const SALES: Cell[][] = [
  // SI-1001: EU, 30d, two checks; last cleared 10-06 (35 days → 30-day bucket). L1 above SRP (price comm), L2 below SRP (non-std).
  ['SI-1001', 1, d('2026-09-01'), 'C-EU-0001', 'LUB-0018', 50, 2000, 30, 'N'],
  ['SI-1001', 2, d('2026-09-01'), 'C-EU-0001', 'LUB-0004', 100, 800, 30, 'N'],
  // SI-1002: DL, 60d, collected day 67 → 60-day bucket.
  ['SI-1002', 1, d('2026-08-01'), 'C-DL-0001', 'LUB-0200', 5, 24000, 60, 'N'],
  // SI-1003: DR, stated 30d but collected day 99 → 90-day bucket. AS-002.
  ['SI-1003', 1, d('2026-07-01'), 'C-DR-0001', 'LUB-0200', 10, 24000, 30, 'N'],
  // SI-1004: RM, COD, below SRP anyway; RM always Non-Standard.
  ['SI-1004', 1, d('2026-10-01'), 'C-RM-0001', 'CHM-0020', 100, 1400, 0, 'N'],
  // SI-1005: EU Standard, 120d, collected day 161 → beyond 120: Standard rate undefined → EXCEPTION.
  ['SI-1005', 1, d('2026-05-01'), 'C-EU-0001', 'LUB-0018', 20, 1950, 120, 'N'],
  // SI-1006: half collected → PENDING_COLLECTION.
  ['SI-1006', 1, d('2026-09-15'), 'C-EU-0001', 'LUB-0001', 200, 260, 30, 'N'],
  // SI-1007: TB, two checks; last cleared 10-10 (39 days). No price commission (EU only). AS-002.
  ['SI-1007', 1, d('2026-09-01'), 'C-TB-0001', 'LUB-0200', 2, 24500, 30, 'N'],
  // SI-1008 / SI-1009: grace edge — stated 30d collected on day 42 vs day 43.
  ['SI-1008', 1, d('2026-08-25'), 'C-EU-0001', 'LUB-0004', 25, 850, 30, 'N'],
  ['SI-1009', 1, d('2026-08-25'), 'C-EU-0001', 'LUB-0004', 25, 850, 30, 'N'],
  // SI-1010: product has no SRP → EXCEPTION (MISSING_PRICELIST_PRICE).
  ['SI-1010', 1, d('2026-09-10'), 'C-EU-0001', 'LUB-0999', 10, 300, 30, 'N'],
  // SI-1011: post-dated check not yet cleared → PENDING.
  ['SI-1011', 1, d('2026-10-02'), 'C-DL-0001', 'LUB-0018', 10, 1950, 30, 'N'],
  // SI-1012: bounced check → PENDING.
  ['SI-1012', 1, d('2026-09-20'), 'C-DL-0001', 'LUB-0001', 40, 250, 30, 'N'],
];

const COLL_HEADERS = ['Invoice No', 'OR No', 'Check No', 'Amount Applied', 'Payment Date', 'Cleared Date', 'Status'];
const COLLECTIONS: Cell[][] = [
  ['SI-1001', 'OR-5001', 'CHK-1001', 100000, d('2026-09-18'), d('2026-09-20'), 'CLEARED'],
  ['SI-1001', 'OR-5002', 'CHK-1002', 80000, d('2026-10-03'), d('2026-10-06'), 'CLEARED'],
  ['SI-1002', 'OR-5003', '', 120000, d('2026-10-07'), d('2026-10-07'), 'CLEARED'],
  ['SI-1003', 'OR-5004', 'CHK-1003', 240000, d('2026-10-05'), d('2026-10-08'), 'CLEARED'],
  ['SI-1004', 'OR-5005', '', 140000, d('2026-10-05'), d('2026-10-05'), 'CLEARED'],
  ['SI-1005', 'OR-5006', 'CHK-1004', 39000, d('2026-10-06'), d('2026-10-09'), 'CLEARED'],
  ['SI-1006', 'OR-5007', 'CHK-1005', 26000, d('2026-10-02'), d('2026-10-06'), 'CLEARED'],
  ['SI-1007', 'OR-5008', 'CHK-1006', 20000, d('2026-09-17'), d('2026-09-20'), 'CLEARED'],
  ['SI-1007', 'OR-5009', 'CHK-1007', 29000, d('2026-10-07'), d('2026-10-10'), 'CLEARED'],
  ['SI-1008', 'OR-5010', '', 21250, d('2026-10-06'), d('2026-10-06'), 'CLEARED'],
  ['SI-1009', 'OR-5011', '', 21250, d('2026-10-07'), d('2026-10-07'), 'CLEARED'],
  ['SI-1010', 'OR-5012', '', 3000, d('2026-10-08'), d('2026-10-08'), 'CLEARED'],
  ['SI-1011', 'OR-5013', 'PDC-2001', 19500, d('2026-10-05'), null, 'PENDING'],
  ['SI-1012', 'OR-5014', 'CHK-1008', 10000, d('2026-10-01'), null, 'BOUNCED'],
];

async function writeXlsx(file: string, sheet: string, headers: string[], rows: Cell[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(headers).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c, i) => {
    c.width = Math.max(12, headers[i]!.length + 4);
    const sample = rows[0]?.[i];
    if (sample instanceof Date) c.numFmt = 'mm/dd/yyyy';
    else if (typeof sample === 'number' && /Price|Amount/.test(headers[i]!)) c.numFmt = '#,##0.00';
  });
  await wb.xlsx.writeFile(join(OUT, file));
}

function writeCsv(file: string, headers: string[], rows: Cell[][]) {
  const fmt = (v: Cell) => {
    if (v === null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  writeFileSync(join(OUT, file), [headers, ...rows].map((r) => r.map(fmt).join(',')).join('\n') + '\n');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await writeXlsx('sales-template.xlsx', 'Sales', SALES_HEADERS, SALES);
  await writeXlsx('collections-template.xlsx', 'Collections', COLL_HEADERS, COLLECTIONS);
  writeCsv('sales-template.csv', SALES_HEADERS, SALES);
  writeCsv('collections-template.csv', COLL_HEADERS, COLLECTIONS);
  console.log(`Samples written to ${OUT}`);
}

void main();

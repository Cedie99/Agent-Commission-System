/**
 * Pure import helpers (no DB): read a sheet, map headers via config, validate rows with Zod,
 * resolve references from pre-loaded lookup maps, detect duplicates.
 */
import ExcelJS from 'exceljs';
import {
  collectionRowSchema,
  D,
  FIELDS_BY_TYPE,
  salesRowSchema,
  type CollectionRow,
  type ImportMappingConfig,
  type ImportRowError,
  type ImportType,
  type SalesRow,
} from '@ocs/shared';

export interface Sheet {
  headers: string[];
  /** [excelRowNo, cells] */
  rows: [number, unknown[]][];
}

export const normalizeHeader = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** CSV without type coercion (keeps leading zeros in codes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('');
    if ('text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if ('error' in v) return null;
  }
  return v;
}

export async function readSheet(buffer: Buffer, fileName: string, cfg: Pick<ImportMappingConfig, 'sheet' | 'headerRow'>): Promise<Sheet> {
  const headerRow = cfg.headerRow ?? 1;
  let matrix: [number, unknown[]][];
  if (/\.csv$/i.test(fileName)) {
    matrix = parseCsv(buffer.toString('utf8')).map((r, i) => [i + 1, r]);
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = typeof cfg.sheet === 'string' ? wb.getWorksheet(cfg.sheet) : wb.worksheets[(cfg.sheet ?? 1) - 1];
    if (!ws) throw new Error(`Worksheet ${String(cfg.sheet ?? 1)} not found`);
    matrix = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      const cells: unknown[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(cellValue(row.getCell(c).value));
      matrix.push([rowNo, cells]);
    });
  }
  const header = matrix.find(([n]) => n === headerRow);
  if (!header) throw new Error(`Header row ${headerRow} not found`);
  const rows = matrix.filter(([n, cells]) => n > headerRow && cells.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
  return { headers: header[1].map((h) => String(h ?? '').trim()), rows };
}

export function mapHeaders(type: ImportType, headers: string[], cfg: ImportMappingConfig) {
  const norm = headers.map(normalizeHeader);
  const index: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(cfg.columns)) {
    const i = norm.findIndex((h) => aliases.some((a) => normalizeHeader(a) === h));
    if (i >= 0) index[field] = i;
  }
  const missing = FIELDS_BY_TYPE[type].filter((f) => f.required && index[f.field] === undefined).map((f) => f.label);
  const used = new Set(Object.values(index));
  const unmapped = headers.filter((h, i) => h && !used.has(i));
  return { index, missing, unmapped };
}

export interface ValidatedRow<T> {
  rowNo: number;
  raw: Record<string, unknown>;
  parsed: T | null;
  errors: ImportRowError[];
}

export function validateRows(type: 'SALES', sheet: Sheet, index: Record<string, number>, cfg: ImportMappingConfig): ValidatedRow<SalesRow>[];
export function validateRows(type: 'COLLECTIONS', sheet: Sheet, index: Record<string, number>, cfg: ImportMappingConfig): ValidatedRow<CollectionRow>[];
export function validateRows(type: ImportType, sheet: Sheet, index: Record<string, number>, cfg: ImportMappingConfig): ValidatedRow<SalesRow | CollectionRow>[] {
  const schema = type === 'SALES' ? salesRowSchema(cfg.trueValues) : collectionRowSchema();
  return sheet.rows.map(([rowNo, cells]) => {
    const raw: Record<string, unknown> = {};
    for (const [field, i] of Object.entries(index)) raw[field] = cells[i] ?? null;
    const r = schema.safeParse(raw);
    const rawForStore = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v]));
    if (r.success) return { rowNo, raw: rawForStore, parsed: r.data, errors: [] };
    return {
      rowNo,
      raw: rawForStore,
      parsed: null,
      errors: r.error.issues.map((i) => ({ rowNo, field: i.path.join('.') || undefined, message: i.message })),
    };
  });
}

// ───────────── reference resolution ─────────────

export interface SalesRefs {
  customers: Map<string, { id: string; channel: string; accountType: string; asId: string | null; ssId: string | null; smId: string | null }>;
  products: Map<string, { id: string; litersPerUnit: string }>;
  people: Map<string, string>; // code → id
  /** (productId, invoiceDate) → SRP or null */
  srp: (productId: string, invoiceDate: string) => string | null;
}

export interface ResolvedSalesLine {
  invoiceNo: string;
  lineNo: number;
  invoiceDate: string;
  customerId: string;
  customerCode: string;
  productId: string;
  productCode: string;
  channel: string;
  accountType: string;
  statedTermDays: number;
  qty: string;
  liters: string;
  litersSource: 'FILE' | 'PRODUCT';
  unitPrice: string;
  pricelistPrice: string | null;
  pricelistSource: 'FILE' | 'PRICELIST' | 'NONE';
  approvedStandardDiscount: boolean;
  invoiceTotal: string | null;
  asId: string | null;
  ssId: string | null;
  smId: string | null;
  warnings: string[];
}

export function resolveSalesRow(r: SalesRow, rowNo: number, refs: SalesRefs): { line?: ResolvedSalesLine; errors: ImportRowError[] } {
  const errors: ImportRowError[] = [];
  const cust = refs.customers.get(r.customerCode!);
  if (!cust) errors.push({ rowNo, field: 'customerCode', message: `Unknown customer code "${r.customerCode}"` });
  const prod = refs.products.get(r.productCode!);
  if (!prod) errors.push({ rowNo, field: 'productCode', message: `Unknown product code "${r.productCode}"` });
  const person = (code: string | null, field: string) => {
    if (!code) return undefined;
    const id = refs.people.get(code);
    if (!id) errors.push({ rowNo, field, message: `Unknown person code "${code}"` });
    return id ?? null;
  };
  const asOverride = person(r.asCode, 'asCode');
  const ssOverride = person(r.ssCode, 'ssCode');
  const smOverride = person(r.smCode, 'smCode');
  if (errors.length || !cust || !prod) return { errors };

  const warnings: string[] = [];
  const liters = r.liters ?? D(r.qty!).times(D(prod.litersPerUnit)).toFixed(4);
  let pricelistPrice = r.pricelistPrice;
  let pricelistSource: ResolvedSalesLine['pricelistSource'] = 'FILE';
  if (pricelistPrice === null) {
    pricelistPrice = refs.srp(prod.id, r.invoiceDate!);
    pricelistSource = pricelistPrice === null ? 'NONE' : 'PRICELIST';
    if (pricelistPrice === null) warnings.push('No pricelist price found for the invoice date (will be an exception unless the channel is RM)');
  }
  if (D(r.qty!).isNegative()) warnings.push('Negative quantity (return/credit memo) — will be held as an exception');
  return {
    errors: [],
    line: {
      invoiceNo: r.invoiceNo!,
      lineNo: r.lineNo!,
      invoiceDate: r.invoiceDate!,
      customerId: cust.id,
      customerCode: r.customerCode!,
      productId: prod.id,
      productCode: r.productCode!,
      channel: r.channel ?? cust.channel,
      accountType: cust.accountType,
      statedTermDays: r.statedTermDays!,
      qty: r.qty!,
      liters,
      litersSource: r.liters ? 'FILE' : 'PRODUCT',
      unitPrice: r.unitPrice!,
      pricelistPrice,
      pricelistSource,
      approvedStandardDiscount: r.approvedStandardDiscount,
      invoiceTotal: r.invoiceTotal,
      asId: asOverride !== undefined ? asOverride : cust.asId,
      ssId: ssOverride !== undefined ? ssOverride : cust.ssId,
      smId: smOverride !== undefined ? smOverride : cust.smId,
      warnings,
    },
  };
}

// ───────────── duplicates ─────────────

export function salesKey(r: { invoiceNo: string | null; lineNo: number | null }) {
  return `${r.invoiceNo}#${r.lineNo}`;
}
export function collectionKey(r: { invoiceNo: string | null; reference: string | null; checkNo: string | null }) {
  return `${r.invoiceNo}#${r.reference}#${r.checkNo ?? ''}`;
}

/** Returns the set of row numbers that repeat an earlier row's key within the same file. */
export function duplicatesWithinFile<T>(rows: { rowNo: number; parsed: T | null }[], key: (p: T) => string): Map<number, number> {
  const first = new Map<string, number>();
  const dup = new Map<number, number>();
  for (const r of rows) {
    if (!r.parsed) continue;
    const k = key(r.parsed);
    const f = first.get(k);
    if (f !== undefined) dup.set(r.rowNo, f);
    else first.set(k, r.rowNo);
  }
  return dup;
}

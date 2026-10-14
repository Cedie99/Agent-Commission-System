/**
 * Money / liters / rates helpers. RULE: never use JS numbers for these.
 *
 *  - D('3.50')            construct (string or Decimal only; numbers are a type error AND a runtime error)
 *  - D.fromExcel(cell)    the single audited path from spreadsheet cells (which may be JS numbers) to Decimal
 *  - roundMoney(d)        2 dp, ROUND_HALF_UP
 *  - formatPHP(d)         '₱1,234.56'
 *
 * Over the wire (JSON) money is always a string, e.g. "1234.5600".
 */
import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type DecimalInput = string | Decimal;

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

function construct(v: DecimalInput): Decimal {
  if (typeof v === 'number') {
    throw new TypeError(`D() refuses JS number ${String(v)}; pass a string or use D.fromExcel()`);
  }
  if (v instanceof Decimal) return v;
  if (Decimal.isDecimal(v)) return new Decimal((v as Decimal).toString());
  if (typeof v !== 'string') throw new TypeError(`D() expects string | Decimal, got ${typeof v}`);
  const s = v.trim();
  if (!NUMERIC_RE.test(s)) throw new TypeError(`D() invalid decimal string: "${v}"`);
  return new Decimal(s);
}

/**
 * Convert a spreadsheet/CSV cell to Decimal. Accepts JS numbers here only because
 * ExcelJS returns them; String(n) gives the shortest round-trip representation and
 * we then round to 4 dp (the DB scale). Returns null for empty cells.
 * Accepts "₱1,234.50", "1,234.50", "(1,234.50)" (negative), " 12 ".
 */
function fromExcel(cell: unknown): Decimal | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'object' && cell !== null) {
    const o = cell as Record<string, unknown>;
    if ('result' in o) return fromExcel(o.result); // formula cell
    if ('richText' in o && Array.isArray(o.richText)) {
      return fromExcel((o.richText as { text: string }[]).map((r) => r.text).join(''));
    }
    if (Decimal.isDecimal(cell)) return construct(cell as Decimal);
    throw new TypeError(`Unsupported cell value: ${JSON.stringify(cell)}`);
  }
  let s: string;
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) throw new TypeError(`Non-finite number in cell: ${String(cell)}`);
    s = String(cell);
    if (/e/i.test(s)) s = new Decimal(s).toFixed(); // 1e-7 style
  } else if (typeof cell === 'string') {
    s = cell.trim();
  } else {
    throw new TypeError(`Unsupported cell type: ${typeof cell}`);
  }
  if (s === '' || s === '-') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[₱,\s]/g, '').replace(/^PHP/i, '');
  if (!NUMERIC_RE.test(s)) throw new TypeError(`Not a number: "${String(cell)}"`);
  const d = new Decimal(s).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  return negative ? d.negated() : d;
}

type DFn = ((v: DecimalInput) => Decimal) & { fromExcel: typeof fromExcel };
export const D: DFn = Object.assign(construct, { fromExcel });

export const ZERO = new Decimal('0');

export function isDecimalString(s: unknown): s is string {
  return typeof s === 'string' && NUMERIC_RE.test(s.trim());
}

export function roundMoney(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: Iterable<Decimal>): Decimal {
  let acc = ZERO;
  for (const v of values) acc = acc.plus(v);
  return acc;
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format a Decimal with fixed dp and thousands separators, without going through JS numbers. */
export function formatDecimal(v: DecimalInput | null | undefined, dp = 2): string {
  if (v === null || v === undefined || v === '') return '';
  const d = construct(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
  const neg = d.isNegative() && !d.isZero();
  const [i, f] = d.abs().toFixed(dp).split('.');
  return `${neg ? '-' : ''}${groupThousands(i ?? '0')}${f ? `.${f}` : ''}`;
}

/** '₱1,234.56' / '-₱1,234.56'. */
export function formatPHP(v: DecimalInput | null | undefined, dp = 2): string {
  if (v === null || v === undefined || v === '') return '';
  const s = formatDecimal(v, dp);
  return s.startsWith('-') ? `-₱${s.slice(1)}` : `₱${s}`;
}

/** Rates like 3.5 → '3.50', 0.125 → '0.125' (min 2 dp, max 4 dp, trailing zeros trimmed beyond 2). */
export function formatRate(v: DecimalInput): string {
  const s = construct(v).toFixed(4);
  return s.replace(/(\.\d\d\d?)0+$/, '$1').replace(/(\.\d\d)0$/, '$1');
}

export function formatLiters(v: DecimalInput): string {
  return `${formatDecimal(v, 2)} L`;
}

/** 0.8 → '80%', 0.125 → '12.5%'. */
export function formatPercent(v: DecimalInput): string {
  return `${construct(v).times(100).toDecimalPlaces(4).toFixed().replace(/\.0+$/, '')}%`;
}

/** Serialize for JSON / DB: 4 dp string. */
export function toWire(v: Decimal | null | undefined): string | null {
  return v === null || v === undefined ? null : v.toFixed(4);
}

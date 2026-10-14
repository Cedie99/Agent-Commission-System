import { z } from 'zod';
import { D, Decimal, isDecimalString } from './money';

/** Decimal over the wire: a numeric STRING (JSON numbers are rejected on purpose). */
export const zDecimal = z
  .union([z.string(), z.instanceof(Decimal)])
  .refine((v) => v instanceof Decimal || isDecimalString(v), { message: 'Must be a decimal string, e.g. "3.50"' })
  .transform((v) => D(v));

export const zDecimalNonNeg = zDecimal.refine((d) => !d.isNegative(), { message: 'Must be ≥ 0' });

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map((p) => Number.parseInt(p, 10)) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 'YYYY-MM-DD' calendar date (no time, no timezone). */
export const zIsoDate = z.string().refine(isValidIsoDate, { message: 'Must be a date YYYY-MM-DD' });

/**
 * Spreadsheet date cell → 'YYYY-MM-DD'. Accepts JS Date (ExcelJS; UTC-based),
 * 'YYYY-MM-DD', 'MM/DD/YYYY' (ERIC6 default, assumed US order) and Excel serial numbers.
 */
export function cellToIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && Number.isInteger(v) && v > 20000 && v < 80000) {
    // Excel serial (1900 system). 25569 = 1970-01-01.
    return new Date((v - 25569) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof v === 'object' && v !== null && 'result' in v) return cellToIsoDate((v as { result: unknown }).result);
  const s = String(v).trim();
  if (ISO_RE.test(s)) return isValidIsoDate(s) ? s : null;
  const isoWithTime = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(s);
  if (isoWithTime?.[1] && isValidIsoDate(isoWithTime[1])) return isoWithTime[1];
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const iso = `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  return null;
}

export const zPaging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  q: z.string().trim().optional(),
});
export type Paging = z.infer<typeof zPaging>;

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

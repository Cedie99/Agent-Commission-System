import type { IsoDate } from './types';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function toUtcMs(d: IsoDate): number {
  const m = ISO_RE.exec(d);
  if (!m) throw new TypeError(`Invalid IsoDate "${d}" (expected YYYY-MM-DD)`);
  return Date.UTC(Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10) - 1, Number.parseInt(m[3]!, 10));
}

/** Calendar days from `from` to `to` (to − from). Both are calendar dates, so this is always an integer. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return (toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY;
}

export function addDays(d: IsoDate, days: number): IsoDate {
  return new Date(toUtcMs(d) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** IsoDates compare correctly as strings; these helpers just validate and read clearly. */
export function isOnOrBefore(a: IsoDate, b: IsoDate): boolean {
  toUtcMs(a);
  toUtcMs(b);
  return a <= b;
}

export function inRange(d: IsoDate, from: IsoDate, to: IsoDate | null): boolean {
  return d >= from && (to === null || d <= to);
}

export function assertIsoDate(d: string, label: string): void {
  try {
    toUtcMs(d);
  } catch {
    throw new TypeError(`${label}: invalid date "${d}"`);
  }
}

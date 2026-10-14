/**
 * Boundary conversions between Prisma values and engine/shared values.
 * Prisma bundles its own decimal.js copy, so convert via string — never via number.
 */
import { Prisma } from '@prisma/client';
import { D, type Decimal } from '@ocs/shared';

export function toD(v: Prisma.Decimal | string): Decimal {
  return D(typeof v === 'string' ? v : v.toString());
}
export function toDOrNull(v: Prisma.Decimal | string | null | undefined): Decimal | null {
  return v === null || v === undefined ? null : toD(v);
}
export function toPrisma(v: Decimal | string): Prisma.Decimal {
  return new Prisma.Decimal(typeof v === 'string' ? v : v.toFixed());
}
export function toPrismaOrNull(v: Decimal | string | null | undefined): Prisma.Decimal | null {
  return v === null || v === undefined ? null : toPrisma(v);
}
/** Money/liters/rates to the wire: 4 dp string. */
export function wire(v: Prisma.Decimal | Decimal | null | undefined): string | null {
  return v === null || v === undefined ? null : v.toFixed(4);
}
export function wireReq(v: Prisma.Decimal | Decimal): string {
  return v.toFixed(4);
}

/** @db.Date columns come back as UTC-midnight Dates. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function isoDateOrNull(d: Date | null | undefined): string | null {
  return d ? isoDate(d) : null;
}
export function dateFromIso(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
export function dateFromIsoOrNull(s: string | null | undefined): Date | null {
  return s ? dateFromIso(s) : null;
}

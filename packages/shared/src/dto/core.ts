import { z } from 'zod';
import {
  ACCOUNT_TYPES,
  CHANNELS,
  EXCEPTION_STATUSES,
  PERSON_STATUSES,
  PRICING_TYPES,
  PRODUCT_CATEGORIES,
  RATE_KINDS,
  RATE_TABLE_TYPES,
  ROLE_CODES,
  RUN_STATUSES,
  RUN_TYPES,
  TERM_BUCKETS,
} from '../enums';
import { zDecimalNonNeg, zIsoDate } from '../zod';

// ---------- auth ----------
export const LoginDto = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginDto>;

export interface AuthUser {
  id: string;
  email: string;
  roles: (typeof ROLE_CODES)[number][];
  personId: string | null;
  displayName: string;
}
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// ---------- people / customers / products ----------
export const PersonDto = z.object({
  code: z.string().trim().min(1).max(32),
  fullName: z.string().trim().min(1).max(200),
  role: z.enum(ROLE_CODES),
  managerId: z.string().uuid().nullable().optional(),
  status: z.enum(PERSON_STATUSES).default('ACTIVE'),
  email: z.string().email().nullable().optional(),
  startDate: zIsoDate.nullable().optional(),
  endDate: zIsoDate.nullable().optional(),
});
export type PersonDto = z.infer<typeof PersonDto>;

export const CustomerDto = z.object({
  eric6Code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(300),
  channel: z.enum(CHANNELS),
  accountType: z.enum(ACCOUNT_TYPES),
  asId: z.string().uuid().nullable().optional(),
  ssId: z.string().uuid().nullable().optional(),
  smId: z.string().uuid().nullable().optional(),
  hasCIS: z.boolean().default(false),
  hasCAS: z.boolean().default(false),
  casCosignedBySM: z.boolean().default(false),
  lastOrderDate: zIsoDate.nullable().optional(),
  active: z.boolean().default(true),
});
export type CustomerDto = z.infer<typeof CustomerDto>;

export const ProductDto = z.object({
  eric6Code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(300),
  litersPerUnit: zDecimalNonNeg,
  category: z.enum(PRODUCT_CATEGORIES),
  active: z.boolean().default(true),
});

// ---------- rates ----------
export const RateEntryDto = z.object({
  channel: z.enum(CHANNELS).nullable(),
  pricingType: z.enum(PRICING_TYPES).nullable(),
  termBucket: z.enum(TERM_BUCKETS),
  kind: z.enum(RATE_KINDS).default('RATE'),
  rate: zDecimalNonNeg,
});
export type RateEntryDto = z.infer<typeof RateEntryDto>;

const effective = {
  effectiveFrom: zIsoDate,
  effectiveTo: zIsoDate.nullable().optional(),
};
const effectiveRefine = (v: { effectiveFrom: string; effectiveTo?: string | null }) =>
  !v.effectiveTo || v.effectiveTo >= v.effectiveFrom;

export const RateTableDto = z
  .object({
    type: z.enum(RATE_TABLE_TYPES),
    name: z.string().trim().min(1).max(200),
    ...effective,
    entries: z.array(RateEntryDto).min(1),
  })
  .refine(effectiveRefine, { message: 'effectiveTo must be on/after effectiveFrom', path: ['effectiveTo'] });
export type RateTableDto = z.infer<typeof RateTableDto>;

export const PricelistDto = z
  .object({
    name: z.string().trim().min(1).max(200),
    ...effective,
    items: z.array(z.object({ productId: z.string().uuid(), price: zDecimalNonNeg })).default([]),
  })
  .refine(effectiveRefine, { message: 'effectiveTo must be on/after effectiveFrom', path: ['effectiveTo'] });
export type PricelistDto = z.infer<typeof PricelistDto>;

/** Wire shapes (money as strings). */
export interface RateEntryView {
  id: string;
  channel: string | null;
  pricingType: string | null;
  termBucket: string;
  kind: string;
  rate: string;
}
export interface RateTableView {
  id: string;
  type: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  entries: RateEntryView[];
}

// ---------- compute runs ----------
export const CreateRunDto = z
  .object({
    runType: z.enum(RUN_TYPES),
    periodStart: zIsoDate,
    periodEnd: zIsoDate,
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => v.periodEnd >= v.periodStart, { message: 'periodEnd must be on/after periodStart', path: ['periodEnd'] });
export type CreateRunDto = z.infer<typeof CreateRunDto>;

export const TransitionRunDto = z.object({
  to: z.enum(RUN_STATUSES),
  comment: z.string().max(2000).optional(),
});
export type TransitionRunDto = z.infer<typeof TransitionRunDto>;

// ---------- exceptions ----------
export const ResolveExceptionDto = z.object({
  status: z.enum(EXCEPTION_STATUSES).refine((s) => s !== 'OPEN', 'Use RESOLVED or WAIVED'),
  resolution: z.string().trim().min(3).max(2000),
});
export type ResolveExceptionDto = z.infer<typeof ResolveExceptionDto>;

// ---------- settings ----------
export const EngineSettingDto = z.object({
  value: z.unknown(),
});

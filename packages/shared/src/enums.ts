/** Domain enums. Keep in sync with apps/api/prisma/schema.prisma (a test checks this). */

export const CHANNELS = ['EU', 'DL', 'DR', 'TB', 'RM'] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = {
  EU: 'End-User',
  DL: 'Dealer',
  DR: 'Distributor',
  TB: 'Toll-Blending',
  RM: 'Raw Material',
};

export const ACCOUNT_TYPES = ['AS_GENERATED', 'SS_GENERATED', 'IN_HOUSE'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TERM_BUCKETS = ['COD', 'D30', 'D60', 'D90', 'D120', 'D120_PLUS'] as const;
export type TermBucket = (typeof TERM_BUCKETS)[number];
export const TERM_BUCKET_LABELS: Record<TermBucket, string> = {
  COD: 'COD',
  D30: '30 days',
  D60: '60 days',
  D90: '90 days',
  D120: '120 days',
  D120_PLUS: 'beyond 120 days',
};

export const PRICING_TYPES = ['STANDARD', 'NON_STANDARD'] as const;
export type PricingType = (typeof PRICING_TYPES)[number];
export const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  STANDARD: 'Standard',
  NON_STANDARD: 'Non-Standard',
};

export const ROLE_CODES = [
  'ADMIN',
  'FINANCE',
  'SSD',
  'VP',
  'NSM',
  'SM',
  'RSRM',
  'SS',
  'RSR',
  'AS',
  'SUPPORT',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const PERSON_STATUSES = ['ACTIVE', 'INACTIVE', 'RESIGNED'] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const PRODUCT_CATEGORIES = ['LUBE', 'CHEMICAL'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const RATE_TABLE_TYPES = ['VOLUME', 'PRICE'] as const;
export type RateTableType = (typeof RATE_TABLE_TYPES)[number];

export const RATE_KINDS = ['RATE', 'FORFEIT'] as const;
export type RateKind = (typeof RATE_KINDS)[number];

export const IMPORT_TYPES = ['SALES', 'COLLECTIONS'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_STATUSES = ['UPLOADED', 'VALIDATING', 'VALIDATED', 'FAILED', 'COMMITTED', 'DISCARDED'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const COLLECTION_STATUSES = ['CLEARED', 'PENDING', 'BOUNCED'] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

export const RUN_TYPES = ['AS_WEEKLY', 'SP_MONTHLY'] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const RUN_STATUSES = ['QUEUED', 'COMPUTING', 'FAILED', 'DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RESULT_STATUSES = ['PENDING_COLLECTION', 'COMPUTED', 'EXCEPTION'] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/** Later: SASI, AMSI, NOVI, CHEMICAL, RSR. */
export const COMPONENT_TYPES = ['VOLUME', 'PRICE'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const EXCEPTION_STATUSES = ['OPEN', 'RESOLVED', 'WAIVED'] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export const EXCEPTION_CODES = [
  'UNKNOWN_CHANNEL',
  'MISSING_PRICELIST_PRICE',
  'UNMAPPED_STATED_TERM',
  'UNDEFINED_RATE',
  'MISSING_PAYEE',
  'NEGATIVE_QTY',
  'OVERLAPPING_EFFECTIVE_RATES',
  'INVALID_INVOICE_TOTAL',
  'ALREADY_PAID',
  'NOT_IMPLEMENTED',
] as const;
export type ExceptionCode = (typeof EXCEPTION_CODES)[number];

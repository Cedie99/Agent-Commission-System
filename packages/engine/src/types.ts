import type { Decimal } from '@ocs/shared/money';
import type {
  AccountType,
  Channel,
  CollectionStatus,
  ComponentType,
  ExceptionCode,
  PricingType,
  RateKind,
  ResultStatus,
  RoleCode,
  RunType,
  TermBucket,
} from '@ocs/shared/enums';

export type { AccountType, Channel, CollectionStatus, ComponentType, ExceptionCode, PricingType, RateKind, ResultStatus, RunType, TermBucket };

/** Calendar date 'YYYY-MM-DD'. No time, no timezone: day counts are pure calendar math. */
export type IsoDate = string;

// ───────────────────────── RuleSet ─────────────────────────

export interface BucketDef {
  bucket: TermBucket;
  /** Upper limit in days. null = open-ended (D120_PLUS). */
  days: number | null;
}

export interface EngineConfig {
  /** CONFIDENTIAL. Never surface in explanations or agent-visible output. */
  graceDays: number;
  /** Ascending. */
  buckets: BucketDef[];
  /** Stated ERIC6 term days → bucket. Unmapped stated terms raise UNMAPPED_STATED_TERM. */
  statedTermMap: Record<string, TermBucket>;
  priceCommissionChannels: Channel[];
  forceNonStandardChannels: Channel[];
  asEligibleAccountTypes: AccountType[];
  rateDateBasis: 'INVOICE_DATE' | 'RECOGNITION_DATE';
  /** A shortfall up to this amount still counts as fully collected. */
  collectionTolerance: Decimal;
}

interface EffectiveRange {
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
}

export interface VolumeRate extends EffectiveRange {
  entryId: string;
  tableName: string;
  channel: Channel;
  pricingType: PricingType;
  bucket: TermBucket;
  kind: RateKind;
  /** ₱ per liter. */
  rate: Decimal;
}

export interface PriceRate extends EffectiveRange {
  entryId: string;
  tableName: string;
  bucket: TermBucket;
  kind: RateKind;
  /** Fraction, e.g. 0.80 = 80%. */
  rate: Decimal;
}

/**
 * Everything the engine needs to compute, resolved by the caller (API) from the DB.
 * The engine never reads the DB. A run stores its RuleSet snapshot, so a past period
 * always recomputes the same way.
 */
export interface RuleSet {
  id: string;
  /** Caller-computed content hash (sha256 of canonicalRuleSetJson()). */
  hash: string;
  /** Config is resolved as of this date (normally the run's periodEnd). */
  asOf: IsoDate;
  config: EngineConfig;
  volumeRates: VolumeRate[];
  priceRates: PriceRate[];
}

// ───────────────────────── inputs ─────────────────────────

export interface InvoiceLineInput {
  invoiceNo: string;
  lineNo: number;
  invoiceDate: IsoDate;
  customerId: string;
  productId: string;
  channel: Channel | string;
  accountType: AccountType;
  statedTermDays: number;
  liters: Decimal;
  qty: Decimal;
  unitPrice: Decimal;
  /** SRP. null = unknown → EXCEPTION (except force-non-standard channels like RM). */
  pricelistPrice: Decimal | null;
  approvedStandardDiscount: boolean;
  /** Gross invoice amount from ERIC6, if exported. Otherwise Σ(qty × unitPrice) of the invoice's lines. */
  invoiceTotal?: Decimal | null;
  asId?: string | null;
  ssId?: string | null;
  smId?: string | null;
}

export interface CollectionInput {
  invoiceNo: string;
  amount: Decimal;
  /** null = not yet cleared (e.g. PDC). */
  clearedDate: IsoDate | null;
  status: CollectionStatus;
  reference: string;
}

export interface InvoiceContext {
  invoiceNo: string;
  total: Decimal;
  collections: CollectionInput[];
  /** Set when the invoice's lines disagree about invoiceTotal, etc. */
  problems: EngineException[];
}

// ───────────────────────── outputs ─────────────────────────

export interface EngineException {
  code: ExceptionCode;
  message: string;
}

export interface CommissionComponent {
  type: ComponentType; // later: SASI, AMSI, NOVI, CHEMICAL, RSR
  payeeRole: RoleCode;
  payeeId: string;
  /** Liters (VOLUME) or peso overprice amount = overprice × qty (PRICE). */
  basis: Decimal;
  /** ₱/L (VOLUME) or fraction (PRICE). */
  rate: Decimal;
  /** Rounded to 2 dp, ROUND_HALF_UP. */
  amount: Decimal;
  rateEntryId: string | null;
  /** Agent-safe, human-readable: "900.00 L × ₱3.50/L = ₱3,150.00 (EU, Standard, 30 days)". */
  explanation: string;
  /** CONFIDENTIAL. May mention actual days / grace. Stripped for agent roles. */
  internalNotes?: string;
}

export interface LineResult {
  invoiceNo: string;
  lineNo: number;
  status: ResultStatus;
  recognitionDate?: IsoDate;
  /** CONFIDENTIAL in agent-facing output (reveals the grace period next to termBucket). */
  actualDays?: number;
  termBucket?: TermBucket;
  pricingType?: PricingType;
  collectedAmount: Decimal;
  invoiceTotal: Decimal;
  totalAmount: Decimal;
  components: CommissionComponent[];
  exceptions: EngineException[];
  /** Agent-safe informational notes (e.g. "account type not eligible for AS commission"). */
  notes: string[];
  /** CONFIDENTIAL line-level reasoning. */
  internalNotes: string[];
}

export interface RunInput {
  runType: RunType;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  lines: InvoiceLineInput[];
  collections: CollectionInput[];
}

export interface PayeeTotal {
  payeeRole: RoleCode;
  payeeId: string;
  byType: Partial<Record<ComponentType, Decimal>>;
  total: Decimal;
  lineCount: number;
}

export interface RunOutput {
  engineVersion: string;
  ruleSetHash: string;
  results: LineResult[];
  totalsByPayee: PayeeTotal[];
  summary: {
    computed: number;
    pending: number;
    exceptions: number;
    /** Lines recognized before periodStart (belong to an earlier run). */
    excludedEarlier: number;
    grandTotal: Decimal;
    byType: Partial<Record<ComponentType, Decimal>>;
  };
  warnings: string[];
}

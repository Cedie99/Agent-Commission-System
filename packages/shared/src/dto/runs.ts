import type { ComponentType, ExceptionCode, ResultStatus, RunStatus, RunType } from '../enums';

/**
 * Wire shapes for compute runs. Money is always a string.
 * Fields marked CONFIDENTIAL are stripped by the API for roles outside CONFIDENTIAL_VIEWER_ROLES.
 */
export interface ComputeRunView {
  id: string;
  runType: RunType;
  periodStart: string;
  periodEnd: string;
  status: RunStatus;
  rulesetHash: string;
  engineVersion: string;
  totals: RunTotalsView | null;
  error: string | null;
  createdBy: string;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  lockedAt: string | null;
  notes: string | null;
  /** CONFIDENTIAL */
  rulesetSnapshot?: unknown;
}

export interface RunTotalsView {
  computed: number;
  pending: number;
  exceptions: number;
  grandTotal: string;
  byType: Record<string, string>;
  byPayee: { payeeId: string; payeeName: string; payeeRole: string; volume: string; price: string; total: string; lineCount: number }[];
}

export interface CommissionComponentView {
  id: string;
  type: ComponentType;
  payeeRole: string;
  payeeId: string;
  payeeName: string;
  basis: string;
  rate: string;
  amount: string;
  explanation: string;
  /** CONFIDENTIAL */
  internalNotes?: string | null;
}

export interface ResultLineView {
  id: string;
  invoiceNo: string;
  lineNo: number;
  invoiceDate: string;
  customerCode: string;
  customerName: string;
  productCode: string;
  channel: string;
  status: ResultStatus;
  recognitionDate: string | null;
  /** CONFIDENTIAL — reveals the grace period when shown next to the bucket. */
  actualDays?: number | null;
  termBucket: string | null;
  pricingType: string | null;
  liters: string;
  qty: string;
  unitPrice: string;
  pricelistPrice: string | null;
  collectedAmount: string;
  invoiceTotal: string;
  totalAmount: string;
  components: CommissionComponentView[];
  exceptions: { code: ExceptionCode; message: string }[];
}

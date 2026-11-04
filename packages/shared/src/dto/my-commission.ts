import { z } from 'zod';
import type { RoleCode, RunStatus, RunType } from '../enums';
import type { CommissionTeam } from '../roles';
import { zYearMonth } from '../zod';

/** GET /my-commission?month=YYYY-MM. Without a month the API picks the latest month with an approved week. */
export const MyCommissionQuery = z.object({ month: zYearMonth.optional() });
export type MyCommissionQuery = z.infer<typeof MyCommissionQuery>;

/**
 * The signed-in agent's own commission for one month, from APPROVED and LOCKED runs only.
 * Agent-facing: never add confidential fields here (grace, actual days, internal notes). Money is a string.
 */
export interface MyCommissionView {
  /** 'YYYY-MM' */
  month: string;
  person: {
    code: string;
    fullName: string;
    role: RoleCode;
    roleName: string;
    team: CommissionTeam | null;
    managerCode: string | null;
  };
  totals: MyCommissionTotals;
  /** The month's Mon–Sun weeks, filled with the approved or locked run that covers each one. */
  weeks: MyWeekView[];
  /** The latest approved or locked run in the month with lines of mine (else the latest run), for the lines table. */
  latestRunId: string | null;
  waitingForPayment: { count: number; items: WaitingInvoiceView[] };
  /** My lines held as exceptions in the month's approved or locked runs. */
  heldForReview: number;
}

export interface MyCommissionTotals {
  /** Everything approved or locked in the month. */
  approved: string;
  /** The part of `approved` that is locked (final). */
  locked: string;
  volume: string;
  price: string;
  lineCount: number;
  liters: string;
  /** Lines that earned price commission (sold above SRP). */
  priceLineCount: number;
  approvedWeeks: number;
  lockedWeeks: number;
}

export interface MyWeekView {
  periodStart: string;
  periodEnd: string;
  /** null when no approved or locked run covers the week. */
  runId: string | null;
  runType: RunType | null;
  status: RunStatus | null;
  volume: string;
  price: string;
  total: string;
  lineCount: number;
}

/** One of my invoices that isn't fully collected yet, so it hasn't earned commission. */
export interface WaitingInvoiceView {
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  /** Cleared payments so far. */
  collected: string;
  total: string;
  /** BOUNCED: a check bounced. NOT_CLEARED: a check hasn't cleared yet. */
  note: 'BOUNCED' | 'NOT_CLEARED' | null;
}

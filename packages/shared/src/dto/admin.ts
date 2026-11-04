import { z } from 'zod';
import type { RoleCode, RunStatus, RunType } from '../enums';
import { zYearMonth } from '../zod';

/** GET /admin/overview?month=YYYY-MM. Without a month the API picks the latest month with an approved or locked run. */
export const AdminOverviewQuery = z.object({ month: zYearMonth.optional() });
export type AdminOverviewQuery = z.infer<typeof AdminOverviewQuery>;

/** The Admin dashboard: the whole system at a glance. Money is a string. */
export interface AdminOverviewView {
  /** 'YYYY-MM' of the commission figures. */
  month: string;
  commission: {
    /** All payees, runs APPROVED or LOCKED in the month. */
    approved: string;
    approvedRuns: number;
    /** Runs still DRAFT or SUBMITTED in the month: not final, may change. */
    inProgress: string;
    inProgressRuns: number;
  };
  runs: {
    /** Runs that aren't locked yet, newest period first. */
    needingAction: AdminRunView[];
    counts: Partial<Record<RunStatus, number>>;
  };
  exceptions: { open: number; byCode: { code: string; count: number }[] };
  accounts: AdminAccountView[];
  /** Latest domain events from the audit log, newest first. */
  activity: AdminActivityView[];
}

export interface AdminRunView {
  id: string;
  runType: RunType;
  periodStart: string;
  periodEnd: string;
  status: RunStatus;
  /** null while the run is still calculating or failed. */
  grandTotal: string | null;
}

export interface AdminAccountView {
  id: string;
  email: string;
  roles: RoleCode[];
  personCode: string | null;
  personName: string | null;
  active: boolean;
  lastLoginAt: string | null;
}

export interface AdminActivityView {
  at: string;
  userEmail: string | null;
  /** e.g. 'run.transition', 'import.commit' */
  action: string;
  entity: string;
  entityId: string | null;
  /** For run.transition: the status the run moved to. */
  toStatus: string | null;
}

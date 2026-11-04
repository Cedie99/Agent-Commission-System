/**
 * Pure logic behind the Admin dashboard (GET /admin/overview), unit-tested in test/admin-overview.test.ts.
 * Months use the same rule as the agent dashboard: a run belongs to the month holding its middle day.
 */
import { D, sum, type AdminRunView, type RunStatus } from '@ocs/shared';
import { monthOf } from '../my-commission/summary';

/** Every status before LOCKED: someone (or the job worker) still has to act. */
export const NEEDS_ACTION: readonly RunStatus[] = ['QUEUED', 'COMPUTING', 'FAILED', 'DRAFT', 'SUBMITTED', 'APPROVED'];
const FINAL: readonly RunStatus[] = ['APPROVED', 'LOCKED'];
const IN_PROGRESS: readonly RunStatus[] = ['DRAFT', 'SUBMITTED'];

const totalOf = (runs: AdminRunView[]) => sum(runs.map((r) => D(r.grandTotal ?? '0'))).toFixed(2);

/** Commission of all payees in the month: final (approved or locked) and still in progress (draft or submitted). */
export function commissionForMonth(month: string, runs: AdminRunView[]) {
  const inMonth = runs.filter((r) => monthOf(r.periodStart, r.periodEnd) === month);
  const approved = inMonth.filter((r) => FINAL.includes(r.status));
  const inProgress = inMonth.filter((r) => IN_PROGRESS.includes(r.status));
  return { approved: totalOf(approved), approvedRuns: approved.length, inProgress: totalOf(inProgress), inProgressRuns: inProgress.length };
}

/** The month of the latest approved or locked run, so the dashboard opens where the money is. */
export function latestApprovedMonth(runs: AdminRunView[]): string | null {
  const latest = runs.filter((r) => FINAL.includes(r.status)).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  return latest ? monthOf(latest.periodStart, latest.periodEnd) : null;
}

/** Runs that aren't locked yet, newest period first. */
export function runsNeedingAction(runs: AdminRunView[], limit = 10): AdminRunView[] {
  return runs
    .filter((r) => NEEDS_ACTION.includes(r.status))
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.periodStart.localeCompare(a.periodStart))
    .slice(0, limit);
}

export function statusCounts(runs: AdminRunView[]): Partial<Record<RunStatus, number>> {
  const counts: Partial<Record<RunStatus, number>> = {};
  for (const r of runs) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

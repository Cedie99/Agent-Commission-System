import { describe, expect, it } from 'vitest';
import type { AdminRunView } from '@ocs/shared';
import { commissionForMonth, latestApprovedMonth, runsNeedingAction, statusCounts } from '../src/admin/overview';

const run = (id: string, periodStart: string, periodEnd: string, status: AdminRunView['status'], grandTotal: string | null): AdminRunView => ({
  id,
  runType: 'AS_WEEKLY',
  periodStart,
  periodEnd,
  status,
  grandTotal,
});

const runs = [
  run('sep', '2026-09-21', '2026-09-27', 'LOCKED', '999.00'),
  run('oct1', '2026-10-05', '2026-10-11', 'LOCKED', '14600.00'),
  run('oct2', '2026-10-12', '2026-10-18', 'SUBMITTED', '250.00'),
  run('oct3', '2026-10-19', '2026-10-25', 'DRAFT', '500.00'),
  run('oct4', '2026-10-26', '2026-11-01', 'APPROVED', '100.00'), // Thursday Oct 29 → October
  run('nov1', '2026-11-02', '2026-11-08', 'QUEUED', null),
];

describe('admin overview', () => {
  it('splits the month into final and in-progress commission', () => {
    expect(commissionForMonth('2026-10', runs)).toEqual({ approved: '14700.00', approvedRuns: 2, inProgress: '750.00', inProgressRuns: 2 });
    expect(commissionForMonth('2026-11', runs)).toEqual({ approved: '0.00', approvedRuns: 0, inProgress: '0.00', inProgressRuns: 0 });
  });

  it('opens on the month of the latest approved or locked run', () => {
    expect(latestApprovedMonth(runs)).toBe('2026-10');
    expect(latestApprovedMonth([run('d', '2026-10-05', '2026-10-11', 'DRAFT', '1.00')])).toBeNull();
  });

  it('lists runs that still need someone to act, newest first', () => {
    expect(runsNeedingAction(runs).map((r) => r.id)).toEqual(['nov1', 'oct4', 'oct3', 'oct2']);
    expect(runsNeedingAction(runs, 2).map((r) => r.id)).toEqual(['nov1', 'oct4']);
  });

  it('counts runs by status', () => {
    expect(statusCounts(runs)).toEqual({ LOCKED: 2, SUBMITTED: 1, DRAFT: 1, APPROVED: 1, QUEUED: 1 });
  });
});

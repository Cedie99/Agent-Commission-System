/** Pure run-status rules (unit-tested in test/transitions.test.ts). */
import { hasPermission, type Permission, type RoleCode, type RunStatus } from '@ocs/shared';

export interface TransitionRule {
  from: RunStatus;
  to: RunStatus;
  permission: Permission;
  label: string;
}

/** draft → submitted → approved → locked. Submitted can be returned to draft. Locked is final. */
export const TRANSITIONS: TransitionRule[] = [
  { from: 'DRAFT', to: 'SUBMITTED', permission: 'runs:submit', label: 'Submit for approval' },
  { from: 'SUBMITTED', to: 'APPROVED', permission: 'runs:approve', label: 'Approve' },
  { from: 'SUBMITTED', to: 'DRAFT', permission: 'runs:return', label: 'Return to draft' },
  { from: 'APPROVED', to: 'LOCKED', permission: 'runs:lock', label: 'Lock' },
];

export type TransitionCheck = { ok: true; rule: TransitionRule } | { ok: false; status: 400 | 403 | 409; reason: string };

export function checkTransition(
  run: { status: RunStatus; submittedById: string | null },
  to: RunStatus,
  user: { id: string; roles: readonly RoleCode[] },
): TransitionCheck {
  if (run.status === 'LOCKED') return { ok: false, status: 409, reason: 'Run is LOCKED and immutable' };
  const rule = TRANSITIONS.find((t) => t.from === run.status && t.to === to);
  if (!rule) return { ok: false, status: 409, reason: `Cannot move a ${run.status} run to ${to}` };
  if (!hasPermission(user.roles, rule.permission)) return { ok: false, status: 403, reason: `Requires permission ${rule.permission}` };
  // Segregation of duties: whoever submitted cannot approve.
  if (to === 'APPROVED' && run.submittedById === user.id) {
    return { ok: false, status: 403, reason: 'The submitter cannot approve the same run' };
  }
  return { ok: true, rule };
}

export function allowedTransitions(run: { status: RunStatus; submittedById: string | null }, user: { id: string; roles: readonly RoleCode[] }) {
  return TRANSITIONS.filter((t) => t.from === run.status && checkTransition(run, t.to, user).ok).map((t) => ({ to: t.to, label: t.label }));
}

/**
 * Payee-scoped users (AS, SS, RSR, …) only see their own lines in APPROVED/LOCKED runs.
 * TODO: SM/NSM team scoping via Person.managerId once statements are built.
 */
export function isPayeeScoped(roles: readonly RoleCode[]): boolean {
  return !hasPermission(roles, 'runs:create') && !hasPermission(roles, 'runs:approve');
}

export const PAYEE_VISIBLE_STATUSES: RunStatus[] = ['APPROVED', 'LOCKED'];

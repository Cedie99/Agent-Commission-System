import type { RoleCode, RunType } from './enums';

/**
 * Roles allowed to see confidential computation details (grace period, actual days,
 * internal notes, ruleset config). This is a WHITELIST: every other role is redacted.
 * The grace period must never reach agent-facing responses or screens.
 */
export const CONFIDENTIAL_VIEWER_ROLES: readonly RoleCode[] = ['ADMIN', 'FINANCE'];

/** Sales roles that only see their own commission lines. */
export const PAYEE_ROLES: readonly RoleCode[] = ['AS', 'SS', 'RSR', 'SM', 'RSRM', 'NSM', 'VP'];

export const PERMISSIONS = {
  'dashboard:read': ['ADMIN', 'FINANCE', 'SSD', 'VP', 'NSM', 'SM', 'RSRM', 'SS', 'RSR', 'AS', 'SUPPORT'],
  'imports:read': ['ADMIN', 'FINANCE', 'SUPPORT', 'SSD'],
  'imports:write': ['ADMIN', 'FINANCE', 'SUPPORT'],
  'customers:read': ['ADMIN', 'FINANCE', 'SSD', 'SUPPORT', 'VP', 'NSM', 'SM'],
  'customers:write': ['ADMIN', 'FINANCE', 'SUPPORT'],
  'people:read': ['ADMIN', 'FINANCE', 'SSD', 'SUPPORT', 'VP', 'NSM', 'SM'],
  'people:write': ['ADMIN', 'SUPPORT'],
  'rates:read': ['ADMIN', 'FINANCE', 'SSD'],
  'rates:write': ['ADMIN', 'FINANCE'],
  'runs:read': ['ADMIN', 'FINANCE', 'SSD', 'VP', 'NSM', 'SM', 'RSRM', 'SS', 'RSR', 'AS'],
  'runs:create': ['ADMIN', 'FINANCE'],
  'runs:submit': ['ADMIN', 'FINANCE'],
  'runs:approve': ['ADMIN', 'SSD', 'VP'],
  'runs:lock': ['ADMIN', 'FINANCE'],
  'runs:return': ['ADMIN', 'FINANCE', 'SSD', 'VP'],
  'exceptions:read': ['ADMIN', 'FINANCE', 'SSD', 'SUPPORT'],
  'exceptions:resolve': ['ADMIN', 'FINANCE'],
  'statements:read': ['ADMIN', 'FINANCE', 'SSD', 'VP', 'NSM', 'SM', 'RSRM', 'SS', 'RSR', 'AS'],
  'ledgers:read': ['ADMIN', 'FINANCE', 'SSD'],
  'settings:read': ['ADMIN', 'FINANCE'],
  'settings:confidential': ['ADMIN', 'FINANCE'],
  'audit:read': ['ADMIN', 'FINANCE'],
  'admin:dashboard': ['ADMIN'],
} as const satisfies Record<string, readonly RoleCode[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(roles: readonly RoleCode[], perm: Permission): boolean {
  const allowed = PERMISSIONS[perm] as readonly RoleCode[];
  return roles.some((r) => allowed.includes(r));
}

export function canSeeConfidential(roles: readonly RoleCode[]): boolean {
  return roles.some((r) => CONFIDENTIAL_VIEWER_ROLES.includes(r));
}

/**
 * Payee-scoped users (AS, SS, RSR, …) only see their own lines in APPROVED/LOCKED runs.
 * Anyone who can create or approve runs (Finance, SSD, VP, Admin) is not scoped.
 * TODO: SM/NSM team scoping via Person.managerId once statements are built.
 */
export function isPayeeScoped(roles: readonly RoleCode[]): boolean {
  return !hasPermission(roles, 'runs:create') && !hasPermission(roles, 'runs:approve');
}

/** The run that pays a commission-earning role: Account Specialists weekly, every other Sales and RSR role monthly. */
export function runTypeFor(role: RoleCode): RunType {
  return role === 'AS' ? 'AS_WEEKLY' : 'SP_MONTHLY';
}

export type CommissionTeam = 'Sales team' | 'RSR team';

/** AS reports to SS in the reporting line, so Account Specialists are on the Sales team. */
const TEAM_BY_ROLE: Partial<Record<RoleCode, CommissionTeam>> = {
  AS: 'Sales team',
  SS: 'Sales team',
  SM: 'Sales team',
  NSM: 'Sales team',
  VP: 'Sales team',
  RSR: 'RSR team',
  RSRM: 'RSR team',
};

/** The team a commission earner belongs to, or null for roles that don't earn commission. */
export function commissionTeam(roles: readonly RoleCode[]): CommissionTeam | null {
  for (const r of roles) {
    const team = TEAM_BY_ROLE[r];
    if (team) return team;
  }
  return null;
}

import type { RoleCode } from './enums';

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
} as const satisfies Record<string, readonly RoleCode[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(roles: readonly RoleCode[], perm: Permission): boolean {
  const allowed = PERMISSIONS[perm] as readonly RoleCode[];
  return roles.some((r) => allowed.includes(r));
}

export function canSeeConfidential(roles: readonly RoleCode[]): boolean {
  return roles.some((r) => CONFIDENTIAL_VIEWER_ROLES.includes(r));
}

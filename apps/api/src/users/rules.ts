/** Pure account rules, unit-tested in test/users-rules.test.ts. */
import { commissionTeam, type RoleCode } from '@ocs/shared';

export interface AccountChange {
  roles: RoleCode[];
  personId?: string | null;
  isActive: boolean;
}

/**
 * Why an account change isn't allowed, or null when it's fine.
 *  - Sales and RSR team accounts must be linked to a person: their dashboard and every
 *    scoped query ("only my lines") go through that person.
 *  - An Admin can't take Admin away from their own account or disable it, so nobody locks themselves out.
 */
export function accountProblem(change: AccountChange, self: { isSelf: boolean }): string | null {
  if (commissionTeam(change.roles) !== null && !change.personId) return 'A Sales or RSR team account must be linked to a person in People.';
  if (self.isSelf && !change.roles.includes('ADMIN')) return "You can't remove Admin from your own account.";
  if (self.isSelf && !change.isActive) return "You can't disable your own account.";
  return null;
}

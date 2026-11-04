import { describe, expect, it } from 'vitest';
import { accountProblem } from '../src/users/rules';

const person = '11111111-1111-1111-1111-111111111111';

describe('account rules', () => {
  it('requires Sales and RSR team accounts to be linked to a person', () => {
    for (const role of ['AS', 'SS', 'SM', 'NSM', 'VP', 'RSR', 'RSRM'] as const) {
      expect(accountProblem({ roles: [role], personId: null, isActive: true }, { isSelf: false })).toMatch(/linked to a person/);
      expect(accountProblem({ roles: [role], personId: person, isActive: true }, { isSelf: false })).toBeNull();
    }
  });

  it('lets staff accounts exist without a person', () => {
    for (const role of ['ADMIN', 'FINANCE', 'SSD', 'SUPPORT'] as const) {
      expect(accountProblem({ roles: [role], isActive: true }, { isSelf: false })).toBeNull();
    }
  });

  it("stops an Admin from locking themselves out", () => {
    expect(accountProblem({ roles: ['FINANCE'], isActive: true }, { isSelf: true })).toMatch(/remove Admin/);
    expect(accountProblem({ roles: ['ADMIN'], isActive: false }, { isSelf: true })).toMatch(/disable your own/);
    expect(accountProblem({ roles: ['ADMIN', 'FINANCE'], isActive: true }, { isSelf: true })).toBeNull();
    // Another Admin can still be changed or disabled.
    expect(accountProblem({ roles: ['FINANCE'], isActive: false }, { isSelf: false })).toBeNull();
  });
});

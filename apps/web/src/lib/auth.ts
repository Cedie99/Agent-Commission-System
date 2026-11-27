import { hasPermission, isPayeeScoped, PAYEE_ROLES, type AuthUser, type Permission } from '@ocs/shared';

const KEY = 'ocs.session';

export interface Session {
  token: string;
  user: AuthUser;
}

// localStorage can throw (private mode / blocked storage) — never let that break the app.
let memory: Session | null = null;

export function getSession(): Session | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    memory = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    memory = null;
  }
  return memory;
}

export function setSession(s: Session | null) {
  memory = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * A Sales or RSR team member who sees only their own commission: a commission-earning role,
 * no power to create or approve runs, and an account linked to a person in People.
 */
export function isAgentView(): boolean {
  const s = getSession();
  return !!s?.user.personId && isPayeeScoped(s.user.roles) && s.user.roles.some((r) => PAYEE_ROLES.includes(r));
}

export function can(perm: Permission): boolean {
  const s = getSession();
  return !!s && hasPermission(s.user.roles, perm);
}

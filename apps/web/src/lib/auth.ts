import { hasPermission, type AuthUser, type Permission } from '@ocs/shared';

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

export function can(perm: Permission): boolean {
  const s = getSession();
  return !!s && hasPermission(s.user.roles, perm);
}

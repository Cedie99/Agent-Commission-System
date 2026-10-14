/**
 * CONFIDENTIALITY: the grace period (and anything that reveals it) must never reach
 * roles outside CONFIDENTIAL_VIEWER_ROLES. This is applied to EVERY response by
 * RedactionInterceptor, so individual endpoints can't forget it.
 */
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { canSeeConfidential, type RoleCode } from '@ocs/shared';
import { map, type Observable } from 'rxjs';
import type { RequestUser } from './auth';

/** Keys removed anywhere in the response tree. */
export const CONFIDENTIAL_KEYS = new Set(['graceDays', 'actualDays', 'internalNotes', 'rulesetSnapshot', 'grace']);

/** Pure: deep-copies `value` without confidential keys and without objects flagged isConfidential. */
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.filter((v) => !(isObj(v) && v.isConfidential === true)).map(redact);
  }
  if (value instanceof Date) return value;
  if (isObj(value)) {
    // Decimal-like values (Prisma.Decimal / decimal.js) serialize themselves.
    if (typeof (value as { toJSON?: unknown }).toJSON === 'function' && !(value.constructor === Object)) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (CONFIDENTIAL_KEYS.has(k)) continue;
      if (k === 'key' && value.isConfidential === true) return undefined;
      out[k] = redact(v);
    }
    return out;
  }
  return value;
}

export function redactForRoles<T>(value: T, roles: readonly RoleCode[] | undefined): T {
  if (roles && canSeeConfidential(roles)) return value;
  return redact(value) as T;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

@Injectable()
export class RedactionInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    return next.handle().pipe(map((body) => (Buffer.isBuffer(body) ? body : redactForRoles(body, req.user?.roles))));
  }
}

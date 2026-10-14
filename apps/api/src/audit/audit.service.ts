import { Global, Injectable, Module, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { tap, type Observable } from 'rxjs';
import type { RequestUser } from '../common/auth';
import { PrismaService } from '../common/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

const SECRET_KEYS = /password|token|secret/i;

function sanitize(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v;
  if (depth > 6) return '[depth]';
  if (Array.isArray(v)) return v.length > 200 ? { items: v.length } : v.map((x) => sanitize(x, depth + 1));
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toFixed();
    if (Buffer.isBuffer(v)) return `[buffer ${v.length}]`;
    return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : sanitize(x, depth + 1)]));
  }
  if (typeof v === 'bigint') return v.toString();
  return v;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Domain-level audit with before/after. Pass `tx` to write inside the same transaction. */
  async log(
    entry: { userId?: string | null; action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown; ip?: string | null },
    tx: Tx = this.prisma,
  ) {
    await tx.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        before: entry.before === undefined ? Prisma.DbNull : (sanitize(entry.before) as Prisma.InputJsonValue),
        after: entry.after === undefined ? Prisma.DbNull : (sanitize(entry.after) as Prisma.InputJsonValue),
        ip: entry.ip ?? null,
      },
    });
  }
}

/**
 * Logs EVERY successful write request (POST/PUT/PATCH/DELETE): who, what route, the request
 * body and the response id. Services additionally log domain events with before/after.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next.handle();
    const entity = ctx.getClass().name.replace(/Controller$/, '');
    return next.handle().pipe(
      tap({
        next: (res) => {
          const resId = res && typeof res === 'object' && 'id' in res ? String((res as { id: unknown }).id) : null;
          const file = (req as Request & { file?: { originalname: string; size: number } }).file;
          void this.audit
            .log({
              userId: req.user?.id ?? null,
              action: `${req.method} ${req.route?.path ?? req.path}`,
              entity,
              entityId: (req.params?.id as string | undefined) ?? resId,
              after: { body: req.body, params: req.params, file: file ? { name: file.originalname, size: file.size } : undefined, resultId: resId },
              ip: req.ip ?? null,
            })
            .catch((e: unknown) => console.error('audit log failed', e));
        },
      }),
    );
  }
}

@Global()
@Module({ providers: [AuditService, AuditInterceptor], exports: [AuditService, AuditInterceptor] })
export class AuditModule {}

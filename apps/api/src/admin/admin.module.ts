import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { AdminOverviewQuery, type AdminOverviewView, type RoleCode, type RunStatus } from '@ocs/shared';
import { RequirePermission } from '../common/auth';
import { isoDate } from '../common/convert';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { commissionForMonth, latestApprovedMonth, runsNeedingAction, statusCounts } from './overview';

/** Route-level audit entries ("POST /imports") duplicate the domain events, so the feed shows only the latter. */
const ROUTE_ACTIONS = ['POST ', 'PUT ', 'PATCH ', 'DELETE '].map((prefix) => ({ action: { startsWith: prefix } }));

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(q: AdminOverviewQuery): Promise<AdminOverviewView> {
    const [runRows, exceptionGroups, users, events] = await Promise.all([
      this.prisma.computeRun.findMany({
        orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
        take: 1000,
        select: { id: true, runType: true, periodStart: true, periodEnd: true, status: true, totals: true },
      }),
      this.prisma.exceptionItem.groupBy({ by: ['code'], where: { status: 'OPEN' }, _count: { _all: true } }),
      this.prisma.user.findMany({ include: { roles: true, person: true }, orderBy: { email: 'asc' } }),
      this.prisma.auditLog.findMany({
        where: { NOT: ROUTE_ACTIONS },
        orderBy: { at: 'desc' },
        take: 12,
        select: { at: true, userId: true, action: true, entity: true, entityId: true, after: true },
      }),
    ]);

    const runs = runRows.map((r) => ({
      id: r.id,
      runType: r.runType,
      periodStart: isoDate(r.periodStart),
      periodEnd: isoDate(r.periodEnd),
      status: r.status as RunStatus,
      grandTotal: (r.totals as { grandTotal?: string } | null)?.grandTotal ?? null,
    }));
    const month = q.month ?? latestApprovedMonth(runs) ?? isoDate(new Date()).slice(0, 7);
    const emails = new Map(users.map((u) => [u.id, u.email]));
    const byCode = exceptionGroups.map((g) => ({ code: g.code, count: g._count._all })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

    return {
      month,
      commission: commissionForMonth(month, runs),
      runs: { needingAction: runsNeedingAction(runs), counts: statusCounts(runs) },
      exceptions: { open: byCode.reduce((n, c) => n + c.count, 0), byCode },
      accounts: users.map((u) => ({
        id: u.id,
        email: u.email,
        roles: u.roles.map((r) => r.roleCode as RoleCode),
        personCode: u.person?.code ?? null,
        personName: u.person?.fullName ?? null,
        active: u.isActive,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      // Only who, what and when: never the before/after payloads.
      activity: events.map((e) => {
        const to = (e.after as { status?: unknown } | null)?.status;
        return {
          at: e.at.toISOString(),
          userEmail: e.userId ? (emails.get(e.userId) ?? null) : null,
          action: e.action,
          entity: e.entity,
          entityId: e.entityId,
          toStatus: e.action === 'run.transition' && typeof to === 'string' ? to : null,
        };
      }),
    };
  }
}

@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Get('overview')
  @RequirePermission('admin:dashboard')
  overview(@Query(new ZodPipe(AdminOverviewQuery)) q: AdminOverviewQuery) {
    return this.svc.overview(q);
  }
}

@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}

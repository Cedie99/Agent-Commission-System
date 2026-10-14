import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ResolveExceptionDto } from '@ocs/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { isoDate } from '../common/convert';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  status: z.enum(['OPEN', 'RESOLVED', 'WAIVED']).optional(),
  code: z.string().optional(),
  runId: z.string().uuid().optional(),
  q: z.string().trim().optional(),
});
type ListQuery = z.infer<typeof ListQuery>;

/**
 * Exceptions are created by compute runs (and later imports). Resolving one records Finance's
 * decision; it does not change any computed amount. Fix the data (pricelist, rate, customer)
 * and recompute the DRAFT run to clear it.
 */
@Injectable()
export class ExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListQuery) {
    const where: Prisma.ExceptionItemWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.code ? { code: q.code } : {}),
      ...(q.runId ? { runId: q.runId } : {}),
      ...(q.q ? { OR: [{ invoiceNo: { contains: q.q, mode: 'insensitive' } }, { message: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total, byCode] = await Promise.all([
      this.prisma.exceptionItem.findMany({
        where,
        include: { run: { select: { id: true, runType: true, periodStart: true, periodEnd: true, status: true } } },
        orderBy: [{ createdAt: 'desc' }, { invoiceNo: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.exceptionItem.count({ where }),
      this.prisma.exceptionItem.groupBy({ by: ['code'], where: { status: 'OPEN' }, _count: { _all: true } }),
    ]);
    return {
      items: items.map((e) => ({
        id: e.id,
        code: e.code,
        message: e.message,
        invoiceNo: e.invoiceNo,
        lineNo: e.lineNo,
        status: e.status,
        resolution: e.resolution,
        resolvedAt: e.resolvedAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
        resultLineId: e.resultLineId,
        run: e.run ? { id: e.run.id, runType: e.run.runType, period: `${isoDate(e.run.periodStart)} – ${isoDate(e.run.periodEnd)}`, status: e.run.status } : null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      openByCode: Object.fromEntries(byCode.map((b) => [b.code, b._count._all])),
    };
  }

  async resolve(id: string, dto: ResolveExceptionDto, user: RequestUser) {
    const before = await this.prisma.exceptionItem.findUnique({ where: { id }, include: { run: true } });
    if (!before) throw new NotFoundException();
    if (before.status !== 'OPEN') throw new ConflictException(`Exception is already ${before.status}`);
    const after = await this.prisma.exceptionItem.update({
      where: { id },
      data: { status: dto.status, resolution: dto.resolution, resolvedById: user.id, resolvedAt: new Date() },
    });
    await this.audit.log({ userId: user.id, action: 'exception.resolve', entity: 'ExceptionItem', entityId: id, before, after });
    return after;
  }
}

@Controller('exceptions')
export class ExceptionsController {
  constructor(private readonly svc: ExceptionsService) {}

  @Get()
  @RequirePermission('exceptions:read')
  list(@Query(new ZodPipe(ListQuery)) q: ListQuery) {
    return this.svc.list(q);
  }

  @Post(':id/resolve')
  @RequirePermission('exceptions:resolve')
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ResolveExceptionDto)) dto: ResolveExceptionDto, @CurrentUser() u: RequestUser) {
    return this.svc.resolve(id, dto, u);
  }
}

@Module({ controllers: [ExceptionsController], providers: [ExceptionsService] })
export class ExceptionsModule {}

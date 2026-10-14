import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  type OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeRun, serializeRuleSet, type CollectionInput, type InvoiceLineInput } from '@ocs/engine';
import {
  CreateRunDto,
  TransitionRunDto,
  type ComputeRunView,
  type ResultLineView,
  type RunStatus,
  type RunTotalsView,
} from '@ocs/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { dateFromIso, isoDate, isoDateOrNull, toD, toDOrNull, toPrisma, wire, wireReq } from '../common/convert';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { JobsService, QUEUES } from '../jobs/jobs.service';
import { RatesModule } from '../rates/rates.module';
import { RuleSetResolver } from '../rates/ruleset.resolver';
import { allowedTransitions, checkTransition, isPayeeScoped, PAYEE_VISIBLE_STATUSES } from './transitions';

const ResultsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(100),
  status: z.enum(['PENDING_COLLECTION', 'COMPUTED', 'EXCEPTION']).optional(),
  payeeId: z.string().uuid().optional(),
  termBucket: z.enum(['COD', 'D30', 'D60', 'D90', 'D120', 'D120_PLUS']).optional(),
  q: z.string().trim().optional(),
});
type ResultsQuery = z.infer<typeof ResultsQuery>;

const resultInclude = {
  salesInvoiceLine: { include: { customer: true, product: true } },
  components: { include: { payee: true }, orderBy: { type: 'desc' } },
} satisfies Prisma.ComputeResultLineInclude;
type ResultRow = Prisma.ComputeResultLineGetPayload<{ include: typeof resultInclude }>;

@Injectable()
export class ComputeRunsService implements OnModuleInit {
  private readonly log = new Logger(ComputeRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly resolver: RuleSetResolver,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    void this.jobs.work<{ runId: string }>(QUEUES.RUN_COMPUTE, ({ runId }) => this.compute(runId));
  }

  async create(dto: CreateRunDto, user: RequestUser) {
    const run = await this.prisma.computeRun.create({
      data: { runType: dto.runType, periodStart: dateFromIso(dto.periodStart), periodEnd: dateFromIso(dto.periodEnd), notes: dto.notes, createdById: user.id },
    });
    await this.audit.log({ userId: user.id, action: 'run.create', entity: 'ComputeRun', entityId: run.id, after: dto });
    await this.jobs.send(QUEUES.RUN_COMPUTE, { runId: run.id });
    return this.get(run.id, user);
  }

  async recompute(id: string, user: RequestUser) {
    const run = await this.prisma.computeRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException();
    if (!['DRAFT', 'FAILED'].includes(run.status)) throw new ConflictException(`Only DRAFT or FAILED runs can be recomputed (run is ${run.status})`);
    await this.prisma.$transaction([
      this.prisma.exceptionItem.deleteMany({ where: { runId: id } }),
      this.prisma.computeResultLine.deleteMany({ where: { runId: id } }),
      this.prisma.computeRun.update({ where: { id }, data: { status: 'QUEUED', error: null, totals: Prisma.DbNull } }),
    ]);
    await this.audit.log({ userId: user.id, action: 'run.recompute', entity: 'ComputeRun', entityId: id, before: { status: run.status, rulesetHash: run.rulesetHash } });
    await this.jobs.send(QUEUES.RUN_COMPUTE, { runId: id });
    return this.get(id, user);
  }

  /** Background job: resolve RuleSet → load data → engine → persist. */
  async compute(runId: string) {
    const run = await this.prisma.computeRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'QUEUED') return;
    await this.prisma.computeRun.update({ where: { id: runId }, data: { status: 'COMPUTING' } });
    try {
      const periodStart = isoDate(run.periodStart);
      const periodEnd = isoDate(run.periodEnd);
      const rs = await this.resolver.resolve(periodEnd);

      // TODO(perf): bound the pending-line scan (e.g. invoices within N days) once volumes are known.
      const lineRows = await this.prisma.salesInvoiceLine.findMany({ where: { invoiceDate: { lte: run.periodEnd } } });
      const invoiceNos = [...new Set(lineRows.map((l) => l.invoiceNo))];
      const collRows = invoiceNos.length ? await this.prisma.collection.findMany({ where: { invoiceNo: { in: invoiceNos } } }) : [];
      const paidRows = await this.prisma.computeResultLine.findMany({
        where: { status: 'COMPUTED', run: { runType: run.runType, status: { in: ['APPROVED', 'LOCKED'] }, id: { not: runId } } },
        select: { invoiceNo: true, lineNo: true },
      });

      const lines: InvoiceLineInput[] = lineRows.map((l) => ({
        invoiceNo: l.invoiceNo,
        lineNo: l.lineNo,
        invoiceDate: isoDate(l.invoiceDate),
        customerId: l.customerId,
        productId: l.productId,
        channel: l.channel,
        accountType: l.accountType,
        statedTermDays: l.statedTermDays,
        liters: toD(l.liters),
        qty: toD(l.qty),
        unitPrice: toD(l.unitPrice),
        pricelistPrice: toDOrNull(l.pricelistPrice),
        approvedStandardDiscount: l.approvedStandardDiscount,
        invoiceTotal: toDOrNull(l.invoiceTotal),
        asId: l.asId,
        ssId: l.ssId,
        smId: l.smId,
      }));
      const collections: CollectionInput[] = collRows.map((c) => ({
        invoiceNo: c.invoiceNo,
        amount: toD(c.amount),
        clearedDate: isoDateOrNull(c.clearedDate),
        status: c.status,
        reference: c.checkNo ? `${c.reference}/${c.checkNo}` : c.reference,
      }));

      const out = computeRun(rs, {
        runType: run.runType,
        periodStart,
        periodEnd,
        lines,
        collections,
        alreadyPaid: paidRows.map((p) => `${p.invoiceNo}#${p.lineNo}`),
      });

      const lineIdByKey = new Map(lineRows.map((l) => [`${l.invoiceNo}#${l.lineNo}`, l.id]));
      const resultRows: Prisma.ComputeResultLineCreateManyInput[] = [];
      const componentRows: Prisma.CommissionComponentCreateManyInput[] = [];
      const exceptionRows: Prisma.ExceptionItemCreateManyInput[] = [];
      for (const r of out.results) {
        const id = randomUUID();
        resultRows.push({
          id,
          runId,
          salesInvoiceLineId: lineIdByKey.get(`${r.invoiceNo}#${r.lineNo}`)!,
          invoiceNo: r.invoiceNo,
          lineNo: r.lineNo,
          status: r.status,
          recognitionDate: r.recognitionDate ? dateFromIso(r.recognitionDate) : null,
          actualDays: r.actualDays ?? null,
          termBucket: r.termBucket ?? null,
          pricingType: r.pricingType ?? null,
          collectedAmount: toPrisma(r.collectedAmount),
          invoiceTotal: toPrisma(r.invoiceTotal),
          totalAmount: toPrisma(r.totalAmount),
          exceptions: r.exceptions as unknown as Prisma.InputJsonValue,
        });
        for (const c of r.components) {
          componentRows.push({
            resultLineId: id,
            type: c.type,
            payeeRole: c.payeeRole,
            payeeId: c.payeeId,
            basis: toPrisma(c.basis),
            rate: toPrisma(c.rate),
            amount: toPrisma(c.amount),
            rateEntryId: c.rateEntryId,
            explanation: c.explanation,
            internalNotes: [...r.internalNotes, c.internalNotes].filter(Boolean).join(' · ') || null,
          });
        }
        for (const e of r.exceptions) {
          exceptionRows.push({ runId, resultLineId: id, code: e.code, message: e.message, invoiceNo: r.invoiceNo, lineNo: r.lineNo });
        }
      }

      const payeeIds = out.totalsByPayee.map((p) => p.payeeId);
      const people = new Map((await this.prisma.person.findMany({ where: { id: { in: payeeIds } } })).map((p) => [p.id, p.fullName]));
      const totals: RunTotalsView & { excludedEarlier: number; alreadyPaid: number; warnings: string[] } = {
        computed: out.summary.computed,
        pending: out.summary.pending,
        exceptions: out.summary.exceptions,
        excludedEarlier: out.summary.excludedEarlier,
        alreadyPaid: out.summary.alreadyPaid,
        grandTotal: out.summary.grandTotal.toFixed(2),
        byType: Object.fromEntries(Object.entries(out.summary.byType).map(([k, v]) => [k, v!.toFixed(2)])),
        byPayee: out.totalsByPayee.map((p) => ({
          payeeId: p.payeeId,
          payeeName: people.get(p.payeeId) ?? p.payeeId,
          payeeRole: p.payeeRole,
          volume: (p.byType.VOLUME ?? toD('0')).toFixed(2),
          price: (p.byType.PRICE ?? toD('0')).toFixed(2),
          total: p.total.toFixed(2),
          lineCount: p.lineCount,
        })),
        warnings: out.warnings,
      };

      await this.prisma.$transaction(
        async (tx) => {
          for (let i = 0; i < resultRows.length; i += 1000) await tx.computeResultLine.createMany({ data: resultRows.slice(i, i + 1000) });
          for (let i = 0; i < componentRows.length; i += 1000) await tx.commissionComponent.createMany({ data: componentRows.slice(i, i + 1000) });
          for (let i = 0; i < exceptionRows.length; i += 1000) await tx.exceptionItem.createMany({ data: exceptionRows.slice(i, i + 1000) });
          await tx.computeRun.update({
            where: { id: runId },
            data: {
              status: 'DRAFT',
              rulesetSnapshot: serializeRuleSet(rs) as unknown as Prisma.InputJsonValue,
              rulesetHash: rs.hash,
              engineVersion: out.engineVersion,
              totals: totals as unknown as Prisma.InputJsonValue,
            },
          });
        },
        { timeout: 300_000 },
      );
      this.log.log(`run ${runId}: ${out.summary.computed} computed, ${out.summary.pending} pending, ${out.summary.exceptions} exceptions, ₱${totals.grandTotal}`);
    } catch (e) {
      this.log.error(e);
      await this.prisma.computeRun.update({ where: { id: runId }, data: { status: 'FAILED', error: e instanceof Error ? e.message : String(e) } });
    }
  }

  async transition(id: string, dto: TransitionRunDto, user: RequestUser) {
    const run = await this.prisma.computeRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException();
    const check = checkTransition({ status: run.status as RunStatus, submittedById: run.submittedById }, dto.to, user);
    if (!check.ok) throw new HttpException(check.reason, check.status);

    if (dto.to === 'SUBMITTED') {
      // Double-pay guard: no COMPUTED line here may already be COMPUTED in another active run of this type.
      const clash = await this.prisma.$queryRaw<{ invoiceNo: string; lineNo: number; otherRun: string; otherStatus: string }[]>`
        SELECT a."invoiceNo", a."lineNo", b."runId" AS "otherRun", r.status::text AS "otherStatus"
          FROM "ComputeResultLine" a
          JOIN "ComputeResultLine" b ON b."salesInvoiceLineId" = a."salesInvoiceLineId" AND b."runId" <> a."runId" AND b.status = 'COMPUTED'
          JOIN "ComputeRun" r ON r.id = b."runId"
         WHERE a."runId" = ${id}::uuid AND a.status = 'COMPUTED'
           AND r."runType"::text = ${run.runType} AND r.status IN ('SUBMITTED','APPROVED','LOCKED')
         LIMIT 20`;
      if (clash.length) {
        throw new ConflictException({
          message: `${clash.length}+ line(s) are already in another submitted/approved/locked run. Recompute this run or return the other run first.`,
          lines: clash,
        });
      }
    }

    const now = new Date();
    const data: Prisma.ComputeRunUpdateInput = { status: dto.to };
    if (dto.to === 'SUBMITTED') Object.assign(data, { submittedById: user.id, submittedAt: now });
    if (dto.to === 'APPROVED') Object.assign(data, { approvedById: user.id, approvedAt: now });
    if (dto.to === 'LOCKED') Object.assign(data, { lockedById: user.id, lockedAt: now });
    if (dto.to === 'DRAFT') Object.assign(data, { submittedById: null, submittedAt: null });
    await this.prisma.$transaction(async (tx) => {
      // Optimistic check: status unchanged since we read it.
      const n = await tx.computeRun.updateMany({ where: { id, status: run.status }, data: data as Prisma.ComputeRunUpdateManyMutationInput });
      if (n.count !== 1) throw new ConflictException('Run status changed concurrently; reload and retry');
      await this.audit.log(
        { userId: user.id, action: `run.transition`, entity: 'ComputeRun', entityId: id, before: { status: run.status }, after: { status: dto.to, comment: dto.comment } },
        tx,
      );
    });
    return this.get(id, user);
  }

  async list(user: RequestUser) {
    const rows = await this.prisma.computeRun.findMany({
      where: isPayeeScoped(user.roles) ? { status: { in: PAYEE_VISIBLE_STATUSES } } : {},
      orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const emails = await this.emails(rows.map((r) => r.createdById));
    return rows.map((r) => this.runView(r, emails, user, false));
  }

  async get(id: string, user: RequestUser) {
    const r = await this.prisma.computeRun.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    this.assertVisible(r.status as RunStatus, user);
    const emails = await this.emails([r.createdById]);
    return { ...this.runView(r, emails, user, true), allowedTransitions: allowedTransitions({ status: r.status as RunStatus, submittedById: r.submittedById }, user) };
  }

  async results(id: string, q: ResultsQuery, user: RequestUser) {
    const run = await this.prisma.computeRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException();
    this.assertVisible(run.status as RunStatus, user);
    const scoped = isPayeeScoped(user.roles);
    const payeeId = scoped ? (user.personId ?? '00000000-0000-0000-0000-000000000000') : q.payeeId;
    const where: Prisma.ComputeResultLineWhereInput = {
      runId: id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.termBucket ? { termBucket: q.termBucket } : {}),
      ...(payeeId ? { components: { some: { payeeId } } } : {}),
      ...(q.q
        ? {
            OR: [
              { invoiceNo: { contains: q.q, mode: 'insensitive' } },
              { salesInvoiceLine: { customer: { name: { contains: q.q, mode: 'insensitive' } } } },
              { salesInvoiceLine: { customer: { eric6Code: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.computeResultLine.findMany({ where, include: resultInclude, orderBy: [{ invoiceNo: 'asc' }, { lineNo: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.computeResultLine.count({ where }),
    ]);
    return { items: items.map((r) => this.resultView(r, scoped ? payeeId : undefined)), total, page: q.page, pageSize: q.pageSize };
  }

  async resultLine(id: string, lineId: string, user: RequestUser) {
    const run = await this.prisma.computeRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException();
    this.assertVisible(run.status as RunStatus, user);
    const r = await this.prisma.computeResultLine.findFirst({ where: { id: lineId, runId: id }, include: resultInclude });
    if (!r) throw new NotFoundException();
    const scoped = isPayeeScoped(user.roles);
    if (scoped && !r.components.some((c) => c.payeeId === user.personId)) throw new NotFoundException();
    return this.resultView(r, scoped ? (user.personId ?? undefined) : undefined);
  }

  // ───────── views ─────────

  private assertVisible(status: RunStatus, user: RequestUser) {
    if (isPayeeScoped(user.roles) && !PAYEE_VISIBLE_STATUSES.includes(status)) throw new ForbiddenException('Run not yet approved');
  }

  private runView(r: Prisma.ComputeRunGetPayload<object>, emails: Map<string, string>, user: RequestUser, withSnapshot: boolean): ComputeRunView {
    let totals = r.totals as unknown as RunTotalsView | null;
    if (totals && isPayeeScoped(user.roles)) {
      // Payees only see their own totals.
      const own = totals.byPayee.filter((p) => p.payeeId === user.personId);
      totals = { ...totals, byPayee: own, grandTotal: own.reduce((acc, p) => acc.plus(toD(p.total)), toD('0')).toFixed(2), byType: {} };
    }
    return {
      id: r.id,
      runType: r.runType,
      periodStart: isoDate(r.periodStart),
      periodEnd: isoDate(r.periodEnd),
      status: r.status as RunStatus,
      rulesetHash: r.rulesetHash,
      engineVersion: r.engineVersion,
      totals,
      error: r.error,
      createdBy: emails.get(r.createdById) ?? r.createdById,
      createdAt: r.createdAt.toISOString(),
      submittedAt: r.submittedAt?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      lockedAt: r.lockedAt?.toISOString() ?? null,
      notes: r.notes,
      // CONFIDENTIAL — stripped by RedactionInterceptor for non-Finance roles.
      ...(withSnapshot ? { rulesetSnapshot: r.rulesetSnapshot } : {}),
    };
  }

  private resultView(r: ResultRow, onlyPayee?: string): ResultLineView {
    const l = r.salesInvoiceLine;
    const comps = onlyPayee ? r.components.filter((c) => c.payeeId === onlyPayee) : r.components;
    return {
      id: r.id,
      invoiceNo: r.invoiceNo,
      lineNo: r.lineNo,
      invoiceDate: isoDate(l.invoiceDate),
      customerCode: l.customer.eric6Code,
      customerName: l.customer.name,
      productCode: l.product.eric6Code,
      channel: l.channel,
      status: r.status,
      recognitionDate: isoDateOrNull(r.recognitionDate),
      actualDays: r.actualDays, // CONFIDENTIAL — redacted for non-Finance roles
      termBucket: r.termBucket,
      pricingType: r.pricingType,
      liters: wireReq(l.liters),
      qty: wireReq(l.qty),
      unitPrice: wireReq(l.unitPrice),
      pricelistPrice: wire(l.pricelistPrice),
      collectedAmount: wireReq(r.collectedAmount),
      invoiceTotal: wireReq(r.invoiceTotal),
      totalAmount: onlyPayee ? comps.reduce((a, c) => a.plus(toD(c.amount)), toD('0')).toFixed(4) : wireReq(r.totalAmount),
      components: comps.map((c) => ({
        id: c.id,
        type: c.type,
        payeeRole: c.payeeRole,
        payeeId: c.payeeId,
        payeeName: c.payee.fullName,
        basis: wireReq(c.basis),
        rate: wireReq(c.rate),
        amount: wireReq(c.amount),
        explanation: c.explanation,
        internalNotes: c.internalNotes, // CONFIDENTIAL
      })),
      exceptions: (r.exceptions as unknown as ResultLineView['exceptions']) ?? [],
    };
  }

  private async emails(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, email: true } });
    return new Map(users.map((u) => [u.id, u.email]));
  }
}

@Controller('compute-runs')
export class ComputeRunsController {
  constructor(private readonly svc: ComputeRunsService) {}

  @Post()
  @RequirePermission('runs:create')
  create(@Body(new ZodPipe(CreateRunDto)) dto: CreateRunDto, @CurrentUser() u: RequestUser) {
    return this.svc.create(dto, u);
  }

  @Get()
  @RequirePermission('runs:read')
  list(@CurrentUser() u: RequestUser) {
    return this.svc.list(u);
  }

  @Get(':id')
  @RequirePermission('runs:read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: RequestUser) {
    return this.svc.get(id, u);
  }

  @Get(':id/results')
  @RequirePermission('runs:read')
  results(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodPipe(ResultsQuery)) q: ResultsQuery, @CurrentUser() u: RequestUser) {
    return this.svc.results(id, q, u);
  }

  @Get(':id/results/:lineId')
  @RequirePermission('runs:read')
  resultLine(@Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string, @CurrentUser() u: RequestUser) {
    return this.svc.resultLine(id, lineId, u);
  }

  @Post(':id/recompute')
  @RequirePermission('runs:create')
  recompute(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: RequestUser) {
    return this.svc.recompute(id, u);
  }

  @Post(':id/transition')
  @RequirePermission('runs:read')
  transition(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(TransitionRunDto)) dto: TransitionRunDto, @CurrentUser() u: RequestUser) {
    return this.svc.transition(id, dto, u);
  }
}

@Module({ imports: [RatesModule], controllers: [ComputeRunsController], providers: [ComputeRunsService] })
export class ComputeRunsModule {}

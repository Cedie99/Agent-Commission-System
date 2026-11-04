import { Controller, Get, Injectable, Module, NotFoundException, Query } from '@nestjs/common';
import { buildInvoiceContexts } from '@ocs/engine';
import { commissionTeam, D, MyCommissionQuery, ZERO, type MyCommissionView, type RunStatus } from '@ocs/shared';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { dateFromIso, isoDate, toD } from '../common/convert';
import { toEngineCollection, toEngineLine } from '../common/engine-input';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { PAYEE_VISIBLE_STATUSES } from '../compute-runs/transitions';
import { monthBounds, monthOf, summarizeMonth, waitingInvoices, type MonthRun } from './summary';

/**
 * The signed-in agent's own commission for a month. Always scoped to the caller's person
 * and to APPROVED/LOCKED runs, whatever their role, so it can't show anyone else's money.
 */
@Injectable()
export class MyCommissionService {
  constructor(private readonly prisma: PrismaService) {}

  async get(q: MyCommissionQuery, user: RequestUser): Promise<MyCommissionView> {
    if (!user.personId) throw new NotFoundException('Your account is not linked to a person in People.');
    const personId = user.personId;
    const person = await this.prisma.person.findUnique({ where: { id: personId }, include: { manager: { select: { code: true } } } });
    if (!person) throw new NotFoundException('Your person record was not found.');
    const role = await this.prisma.role.findUnique({ where: { code: person.role } });

    const month = q.month ?? (await this.latestMonth(personId)) ?? isoDate(new Date()).slice(0, 7);
    const { first, last } = monthBounds(month);
    const candidates = await this.prisma.computeRun.findMany({
      where: { status: { in: PAYEE_VISIBLE_STATUSES }, periodStart: { lte: dateFromIso(last) }, periodEnd: { gte: dateFromIso(first) } },
    });
    const runs: MonthRun[] = candidates
      .map((r) => ({ id: r.id, runType: r.runType, periodStart: isoDate(r.periodStart), periodEnd: isoDate(r.periodEnd), status: r.status as RunStatus }))
      .filter((r) => monthOf(r.periodStart, r.periodEnd) === month);
    const runIds = runs.map((r) => r.id);

    const [components, heldForReview, waitingForPayment] = await Promise.all([
      this.prisma.commissionComponent.findMany({
        where: { payeeId: personId, resultLine: { runId: { in: runIds } } },
        select: { type: true, amount: true, resultLineId: true, resultLine: { select: { runId: true, salesInvoiceLine: { select: { liters: true } } } } },
      }),
      // Held lines have no components, so they are matched by the AS frozen on the invoice line.
      this.prisma.computeResultLine.count({ where: { runId: { in: runIds }, status: 'EXCEPTION', salesInvoiceLine: { asId: personId } } }),
      this.waitingForPayment(personId),
    ]);

    const summary = summarizeMonth(
      month,
      runs,
      components.map((c) => ({ runId: c.resultLine.runId, resultLineId: c.resultLineId, type: c.type, amount: toD(c.amount), liters: toD(c.resultLine.salesInvoiceLine.liters) })),
    );
    return {
      month,
      person: {
        code: person.code,
        fullName: person.fullName,
        role: person.role,
        roleName: role?.name ?? person.role,
        team: commissionTeam([person.role]),
        managerCode: person.manager?.code ?? null,
      },
      ...summary,
      waitingForPayment,
      heldForReview,
    };
  }

  /** The month of my latest approved or locked run, so the dashboard opens where the money is. */
  private async latestMonth(personId: string): Promise<string | null> {
    const run = await this.prisma.computeRun.findFirst({
      where: { status: { in: PAYEE_VISIBLE_STATUSES }, resultLines: { some: { components: { some: { payeeId: personId } } } } },
      orderBy: [{ periodEnd: 'desc' }, { periodStart: 'desc' }],
      select: { periodStart: true, periodEnd: true },
    });
    return run ? monthOf(isoDate(run.periodStart), isoDate(run.periodEnd)) : null;
  }

  /** My invoices that aren't fully collected, judged by the engine's own collection rule. */
  private async waitingForPayment(personId: string) {
    // My lines not yet paid in an approved or locked run (paid lines were fully collected by definition).
    const mine = await this.prisma.salesInvoiceLine.findMany({
      where: { asId: personId, resultLines: { none: { status: 'COMPUTED', run: { status: { in: PAYEE_VISIBLE_STATUSES } } } } },
      select: { invoiceNo: true, invoiceDate: true, customer: { select: { name: true } } },
    });
    if (mine.length === 0) return { count: 0, items: [] };
    const invoiceNos = [...new Set(mine.map((l) => l.invoiceNo))];
    const [lines, collections, tolerance] = await Promise.all([
      // Every line of those invoices: the invoice total may include lines that aren't mine.
      this.prisma.salesInvoiceLine.findMany({ where: { invoiceNo: { in: invoiceNos } } }),
      this.prisma.collection.findMany({ where: { invoiceNo: { in: invoiceNos } } }),
      this.prisma.engineSetting.findFirst({
        where: { key: 'collectionTolerance', effectiveFrom: { lte: dateFromIso(isoDate(new Date())) } },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);
    const contexts = buildInvoiceContexts(lines.map(toEngineLine), collections.map(toEngineCollection));
    const info = new Map(mine.map((l) => [l.invoiceNo, { invoiceDate: isoDate(l.invoiceDate), customerName: l.customer.name }]));
    return waitingInvoices(contexts.values(), info, tolerance ? D(String(tolerance.value)) : ZERO);
  }
}

@Controller('my-commission')
export class MyCommissionController {
  constructor(private readonly svc: MyCommissionService) {}

  @Get()
  @RequirePermission('runs:read')
  get(@Query(new ZodPipe(MyCommissionQuery)) q: MyCommissionQuery, @CurrentUser() u: RequestUser) {
    return this.svc.get(q, u);
  }
}

@Module({ controllers: [MyCommissionController], providers: [MyCommissionService] })
export class MyCommissionModule {}

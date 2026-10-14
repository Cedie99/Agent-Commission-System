import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { serializeRuleSet } from '@ocs/engine';
import { PricelistDto, RateTableDto, zIsoDate, type RateTableType, type RateTableView } from '@ocs/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { dateFromIso, dateFromIsoOrNull, isoDate, isoDateOrNull, toPrisma, wireReq } from '../common/convert';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { RuleSetResolver } from './ruleset.resolver';

const NewVersionDto = z.object({ effectiveFrom: zIsoDate, name: z.string().trim().min(1).max(200).optional() });
type NewVersionDto = z.infer<typeof NewVersionDto>;

function dayBefore(iso: string): Date {
  const d = dateFromIso(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function overlaps(aFrom: Date, aTo: Date | null, bFrom: Date, bTo: Date | null): boolean {
  return (bTo === null || aFrom <= bTo) && (aTo === null || bFrom <= aTo);
}

@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─────────── rate tables ───────────

  async listTables(type?: RateTableType): Promise<RateTableView[]> {
    const rows = await this.prisma.rateTable.findMany({
      where: type ? { type } : {},
      include: { entries: true },
      orderBy: [{ type: 'asc' }, { effectiveFrom: 'desc' }],
    });
    return rows.map((t) => this.tableView(t));
  }

  async getTable(id: string) {
    const t = await this.prisma.rateTable.findUnique({ where: { id }, include: { entries: true } });
    if (!t) throw new NotFoundException();
    return { ...this.tableView(t), usedByFinalRuns: await this.usedByFinalRuns(t.entries.map((e) => e.id)) };
  }

  async createTable(dto: RateTableDto, user: RequestUser) {
    await this.assertNoOverlap('rateTable', dto.type, dto.effectiveFrom, dto.effectiveTo ?? null);
    this.assertUniqueEntries(dto);
    const t = await this.prisma.rateTable.create({
      data: {
        type: dto.type,
        name: dto.name,
        effectiveFrom: dateFromIso(dto.effectiveFrom),
        effectiveTo: dateFromIsoOrNull(dto.effectiveTo),
        entries: { create: dto.entries.map((e) => ({ ...e, rate: toPrisma(e.rate) })) },
      },
      include: { entries: true },
    });
    await this.audit.log({ userId: user.id, action: 'rateTable.create', entity: 'RateTable', entityId: t.id, after: t });
    return this.tableView(t);
  }

  /** Replace a table's header + entries. Refused if any APPROVED/LOCKED run used it — create a new version instead. */
  async updateTable(id: string, dto: RateTableDto, user: RequestUser) {
    const before = await this.prisma.rateTable.findUnique({ where: { id }, include: { entries: true } });
    if (!before) throw new NotFoundException();
    if (before.type !== dto.type) throw new BadRequestException('Cannot change a table type');
    if (await this.usedByFinalRuns(before.entries.map((e) => e.id))) {
      throw new ConflictException('This rate table was used by an approved/locked run. Create a new version with a later effective date instead.');
    }
    await this.assertNoOverlap('rateTable', dto.type, dto.effectiveFrom, dto.effectiveTo ?? null, id);
    this.assertUniqueEntries(dto);
    const after = await this.prisma.$transaction(async (tx) => {
      await tx.rateEntry.deleteMany({ where: { rateTableId: id } });
      return tx.rateTable.update({
        where: { id },
        data: {
          name: dto.name,
          effectiveFrom: dateFromIso(dto.effectiveFrom),
          effectiveTo: dateFromIsoOrNull(dto.effectiveTo),
          entries: { create: dto.entries.map((e) => ({ ...e, rate: toPrisma(e.rate) })) },
        },
        include: { entries: true },
      });
    });
    await this.audit.log({ userId: user.id, action: 'rateTable.update', entity: 'RateTable', entityId: id, before, after });
    return this.tableView(after);
  }

  /** Copy a table into a new version starting `effectiveFrom`; closes the source the day before. */
  async newTableVersion(id: string, dto: NewVersionDto, user: RequestUser) {
    const src = await this.prisma.rateTable.findUnique({ where: { id }, include: { entries: true } });
    if (!src) throw new NotFoundException();
    if (dto.effectiveFrom <= isoDate(src.effectiveFrom)) throw new BadRequestException('New version must start after the source version');
    const others = await this.prisma.rateTable.findMany({ where: { type: src.type, id: { not: id }, effectiveFrom: { gte: dateFromIso(dto.effectiveFrom) } } });
    if (others.length) throw new ConflictException('A later version already exists; edit that one instead');
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.rateTable.update({ where: { id }, data: { effectiveTo: dayBefore(dto.effectiveFrom) } });
      return tx.rateTable.create({
        data: {
          type: src.type,
          name: dto.name ?? `${src.name} (from ${dto.effectiveFrom})`,
          effectiveFrom: dateFromIso(dto.effectiveFrom),
          effectiveTo: src.effectiveTo && isoDate(src.effectiveTo) >= dto.effectiveFrom ? src.effectiveTo : null,
          entries: { create: src.entries.map(({ channel, pricingType, termBucket, kind, rate }) => ({ channel, pricingType, termBucket, kind, rate })) },
        },
        include: { entries: true },
      });
    });
    await this.audit.log({ userId: user.id, action: 'rateTable.newVersion', entity: 'RateTable', entityId: created.id, before: { sourceId: id }, after: created });
    return this.tableView(created);
  }

  // ─────────── pricelists ───────────

  async listPricelists() {
    const rows = await this.prisma.pricelist.findMany({ orderBy: { effectiveFrom: 'desc' }, include: { _count: { select: { items: true } } } });
    return rows.map((p) => ({ id: p.id, name: p.name, effectiveFrom: isoDate(p.effectiveFrom), effectiveTo: isoDateOrNull(p.effectiveTo), itemCount: p._count.items }));
  }

  async getPricelist(id: string) {
    const p = await this.prisma.pricelist.findUnique({ where: { id }, include: { items: { include: { product: true }, orderBy: { product: { eric6Code: 'asc' } } } } });
    if (!p) throw new NotFoundException();
    return {
      id: p.id,
      name: p.name,
      effectiveFrom: isoDate(p.effectiveFrom),
      effectiveTo: isoDateOrNull(p.effectiveTo),
      items: p.items.map((i) => ({ id: i.id, productId: i.productId, productCode: i.product.eric6Code, productName: i.product.name, price: wireReq(i.price) })),
    };
  }

  async createPricelist(dto: PricelistDto, user: RequestUser) {
    await this.assertNoOverlap('pricelist', null, dto.effectiveFrom, dto.effectiveTo ?? null);
    const p = await this.prisma.pricelist.create({
      data: {
        name: dto.name,
        effectiveFrom: dateFromIso(dto.effectiveFrom),
        effectiveTo: dateFromIsoOrNull(dto.effectiveTo),
        items: { create: dto.items.map((i) => ({ productId: i.productId, price: toPrisma(i.price) })) },
      },
    });
    await this.audit.log({ userId: user.id, action: 'pricelist.create', entity: 'Pricelist', entityId: p.id, after: dto });
    return this.getPricelist(p.id);
  }

  async updatePricelist(id: string, dto: PricelistDto, user: RequestUser) {
    const before = await this.getPricelist(id);
    await this.assertNoOverlap('pricelist', null, dto.effectiveFrom, dto.effectiveTo ?? null, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.pricelistItem.deleteMany({ where: { pricelistId: id } });
      await tx.pricelist.update({
        where: { id },
        data: {
          name: dto.name,
          effectiveFrom: dateFromIso(dto.effectiveFrom),
          effectiveTo: dateFromIsoOrNull(dto.effectiveTo),
          items: { create: dto.items.map((i) => ({ productId: i.productId, price: toPrisma(i.price) })) },
        },
      });
    });
    const after = await this.getPricelist(id);
    await this.audit.log({ userId: user.id, action: 'pricelist.update', entity: 'Pricelist', entityId: id, before, after });
    return after;
  }

  async newPricelistVersion(id: string, dto: NewVersionDto, user: RequestUser) {
    const src = await this.prisma.pricelist.findUnique({ where: { id }, include: { items: true } });
    if (!src) throw new NotFoundException();
    if (dto.effectiveFrom <= isoDate(src.effectiveFrom)) throw new BadRequestException('New version must start after the source version');
    const later = await this.prisma.pricelist.count({ where: { id: { not: id }, effectiveFrom: { gte: dateFromIso(dto.effectiveFrom) } } });
    if (later) throw new ConflictException('A later pricelist already exists; edit that one instead');
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.pricelist.update({ where: { id }, data: { effectiveTo: dayBefore(dto.effectiveFrom) } });
      return tx.pricelist.create({
        data: {
          name: dto.name ?? `${src.name} (from ${dto.effectiveFrom})`,
          effectiveFrom: dateFromIso(dto.effectiveFrom),
          items: { create: src.items.map((i) => ({ productId: i.productId, price: i.price })) },
        },
      });
    });
    await this.audit.log({ userId: user.id, action: 'pricelist.newVersion', entity: 'Pricelist', entityId: created.id, before: { sourceId: id } });
    return this.getPricelist(created.id);
  }

  // ─────────── helpers ───────────

  private tableView(t: { id: string; type: string; name: string; effectiveFrom: Date; effectiveTo: Date | null; entries: { id: string; channel: string | null; pricingType: string | null; termBucket: string; kind: string; rate: { toFixed(dp: number): string } }[] }): RateTableView {
    return {
      id: t.id,
      type: t.type,
      name: t.name,
      effectiveFrom: isoDate(t.effectiveFrom),
      effectiveTo: isoDateOrNull(t.effectiveTo),
      entries: t.entries.map((e) => ({ id: e.id, channel: e.channel, pricingType: e.pricingType, termBucket: e.termBucket, kind: e.kind, rate: e.rate.toFixed(4) })),
    };
  }

  private assertUniqueEntries(dto: RateTableDto) {
    const seen = new Set<string>();
    for (const e of dto.entries) {
      const k = `${e.channel}|${e.pricingType}|${e.termBucket}`;
      if (seen.has(k)) throw new BadRequestException(`Duplicate entry ${k.replace(/\|/g, ' / ')}`);
      seen.add(k);
      if (dto.type === 'VOLUME' && (!e.channel || !e.pricingType)) throw new BadRequestException('Volume entries need channel and pricing type');
      if (dto.type === 'PRICE' && (e.channel || e.pricingType)) throw new BadRequestException('Price entries are by term bucket only (channels are configured in settings)');
    }
  }

  private async assertNoOverlap(kind: 'rateTable' | 'pricelist', type: RateTableType | null, from: string, to: string | null, excludeId?: string) {
    const rows =
      kind === 'rateTable'
        ? await this.prisma.rateTable.findMany({ where: { type: type!, ...(excludeId ? { id: { not: excludeId } } : {}) } })
        : await this.prisma.pricelist.findMany({ where: excludeId ? { id: { not: excludeId } } : {} });
    const f = dateFromIso(from);
    const t = dateFromIsoOrNull(to);
    const hit = rows.find((r) => overlaps(f, t, r.effectiveFrom, r.effectiveTo));
    if (hit) {
      throw new ConflictException(
        `Effective dates overlap "${hit.name}" (${isoDate(hit.effectiveFrom)} – ${isoDateOrNull(hit.effectiveTo) ?? 'open'}). Close it first or use "new version".`,
      );
    }
  }

  private async usedByFinalRuns(entryIds: string[]): Promise<boolean> {
    if (!entryIds.length) return false;
    const runs = await this.prisma.computeRun.findMany({ where: { status: { in: ['APPROVED', 'LOCKED'] } }, select: { rulesetSnapshot: true } });
    return runs.some((r) => {
      const s = JSON.stringify(r.rulesetSnapshot ?? '');
      return entryIds.some((id) => s.includes(id));
    });
  }
}

@Controller('rates')
export class RatesController {
  constructor(
    private readonly rates: RatesService,
    private readonly resolver: RuleSetResolver,
  ) {}

  @Get('tables')
  @RequirePermission('rates:read')
  listTables(@Query('type') type?: RateTableType) {
    return this.rates.listTables(type);
  }

  @Get('tables/:id')
  @RequirePermission('rates:read')
  getTable(@Param('id', ParseUUIDPipe) id: string) {
    return this.rates.getTable(id);
  }

  @Post('tables')
  @RequirePermission('rates:write')
  createTable(@Body(new ZodPipe(RateTableDto)) dto: RateTableDto, @CurrentUser() u: RequestUser) {
    return this.rates.createTable(dto, u);
  }

  @Put('tables/:id')
  @RequirePermission('rates:write')
  updateTable(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(RateTableDto)) dto: RateTableDto, @CurrentUser() u: RequestUser) {
    return this.rates.updateTable(id, dto, u);
  }

  @Post('tables/:id/new-version')
  @RequirePermission('rates:write')
  newTableVersion(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(NewVersionDto)) dto: NewVersionDto, @CurrentUser() u: RequestUser) {
    return this.rates.newTableVersion(id, dto, u);
  }

  @Get('pricelists')
  @RequirePermission('rates:read')
  listPricelists() {
    return this.rates.listPricelists();
  }

  @Get('pricelists/:id')
  @RequirePermission('rates:read')
  getPricelist(@Param('id', ParseUUIDPipe) id: string) {
    return this.rates.getPricelist(id);
  }

  @Post('pricelists')
  @RequirePermission('rates:write')
  createPricelist(@Body(new ZodPipe(PricelistDto)) dto: PricelistDto, @CurrentUser() u: RequestUser) {
    return this.rates.createPricelist(dto, u);
  }

  @Put('pricelists/:id')
  @RequirePermission('rates:write')
  updatePricelist(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PricelistDto)) dto: PricelistDto, @CurrentUser() u: RequestUser) {
    return this.rates.updatePricelist(id, dto, u);
  }

  @Post('pricelists/:id/new-version')
  @RequirePermission('rates:write')
  newPricelistVersion(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(NewVersionDto)) dto: NewVersionDto, @CurrentUser() u: RequestUser) {
    return this.rates.newPricelistVersion(id, dto, u);
  }

  /** Preview the RuleSet the engine would use as of a date. CONFIDENTIAL (contains graceDays). */
  @Get('resolve')
  @RequirePermission('settings:confidential')
  async resolve(@Query('asOf', new ZodPipe(zIsoDate)) asOf: string) {
    return serializeRuleSet(await this.resolver.resolve(asOf));
  }
}

@Module({ controllers: [RatesController], providers: [RatesService, RuleSetResolver], exports: [RuleSetResolver] })
export class RatesModule {}

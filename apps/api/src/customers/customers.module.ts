import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CustomerDto, zPaging, type Paging } from '@ocs/shared';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { dateFromIsoOrNull, isoDateOrNull } from '../common/convert';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';

const include = { as: true, ss: true, sm: true } satisfies Prisma.CustomerInclude;
type Row = Prisma.CustomerGetPayload<{ include: typeof include }>;

function view(c: Row) {
  return {
    id: c.id,
    eric6Code: c.eric6Code,
    name: c.name,
    channel: c.channel,
    accountType: c.accountType,
    asId: c.asId,
    asName: c.as?.fullName ?? null,
    ssId: c.ssId,
    ssName: c.ss?.fullName ?? null,
    smId: c.smId,
    smName: c.sm?.fullName ?? null,
    hasCIS: c.hasCIS,
    hasCAS: c.hasCAS,
    casCosignedBySM: c.casCosignedBySM,
    lastOrderDate: isoDateOrNull(c.lastOrderDate),
    active: c.active,
  };
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(p: Paging & { channel?: string }) {
    const where: Prisma.CustomerWhereInput = {
      ...(p.q ? { OR: [{ eric6Code: { contains: p.q, mode: 'insensitive' } }, { name: { contains: p.q, mode: 'insensitive' } }] } : {}),
      ...(p.channel ? { channel: p.channel as Prisma.EnumChannelFilter['equals'] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, include, orderBy: { eric6Code: 'asc' }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
      this.prisma.customer.count({ where }),
    ]);
    return { items: items.map(view), total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const c = await this.prisma.customer.findUnique({ where: { id }, include });
    if (!c) throw new NotFoundException();
    return view(c);
  }

  async create(dto: CustomerDto, user: RequestUser) {
    const c = await this.prisma.customer.create({ data: { ...dto, lastOrderDate: dateFromIsoOrNull(dto.lastOrderDate) }, include });
    await this.audit.log({ userId: user.id, action: 'customer.create', entity: 'Customer', entityId: c.id, after: c });
    return view(c);
  }

  async update(id: string, dto: CustomerDto, user: RequestUser) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const c = await this.prisma.customer.update({ where: { id }, data: { ...dto, lastOrderDate: dateFromIsoOrNull(dto.lastOrderDate) }, include });
    await this.audit.log({ userId: user.id, action: 'customer.update', entity: 'Customer', entityId: id, before, after: c });
    return view(c);
  }
}

@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  @Get()
  @RequirePermission('customers:read')
  list(@Query(new ZodPipe(zPaging.passthrough())) q: Paging & { channel?: string }) {
    return this.svc.list(q);
  }

  @Get(':id')
  @RequirePermission('customers:read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Post()
  @RequirePermission('customers:write')
  create(@Body(new ZodPipe(CustomerDto)) dto: CustomerDto, @CurrentUser() u: RequestUser) {
    return this.svc.create(dto, u);
  }

  @Put(':id')
  @RequirePermission('customers:write')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CustomerDto)) dto: CustomerDto, @CurrentUser() u: RequestUser) {
    return this.svc.update(id, dto, u);
  }
}

@Module({ controllers: [CustomersController], providers: [CustomersService] })
export class CustomersModule {}

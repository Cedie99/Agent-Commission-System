import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PersonDto, zPaging, type Paging } from '@ocs/shared';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { dateFromIsoOrNull, isoDateOrNull } from '../common/convert';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';

const include = { manager: true, _count: { select: { customersAsAS: true, reports: true } } } satisfies Prisma.PersonInclude;
type Row = Prisma.PersonGetPayload<{ include: typeof include }>;

function view(p: Row) {
  return {
    id: p.id,
    code: p.code,
    fullName: p.fullName,
    role: p.role,
    managerId: p.managerId,
    managerName: p.manager?.fullName ?? null,
    status: p.status,
    email: p.email,
    startDate: isoDateOrNull(p.startDate),
    endDate: isoDateOrNull(p.endDate),
    customerCount: p._count.customersAsAS,
    reportCount: p._count.reports,
  };
}

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(p: Paging & { role?: string }) {
    const where: Prisma.PersonWhereInput = {
      ...(p.q ? { OR: [{ code: { contains: p.q, mode: 'insensitive' } }, { fullName: { contains: p.q, mode: 'insensitive' } }] } : {}),
      ...(p.role ? { role: p.role as Prisma.EnumRoleCodeFilter['equals'] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.person.findMany({ where, include, orderBy: [{ role: 'asc' }, { code: 'asc' }], skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
      this.prisma.person.count({ where }),
    ]);
    return { items: items.map(view), total, page: p.page, pageSize: p.pageSize };
  }

  async get(id: string) {
    const p = await this.prisma.person.findUnique({ where: { id }, include });
    if (!p) throw new NotFoundException();
    return view(p);
  }

  private data(dto: PersonDto) {
    return { ...dto, startDate: dateFromIsoOrNull(dto.startDate), endDate: dateFromIsoOrNull(dto.endDate) };
  }

  async create(dto: PersonDto, user: RequestUser) {
    const p = await this.prisma.person.create({ data: this.data(dto), include });
    await this.audit.log({ userId: user.id, action: 'person.create', entity: 'Person', entityId: p.id, after: p });
    return view(p);
  }

  async update(id: string, dto: PersonDto, user: RequestUser) {
    if (dto.managerId === id) throw new BadRequestException('A person cannot report to themselves');
    const before = await this.prisma.person.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const p = await this.prisma.person.update({ where: { id }, data: this.data(dto), include });
    await this.audit.log({ userId: user.id, action: 'person.update', entity: 'Person', entityId: id, before, after: p });
    return view(p);
  }
}

@Controller('people')
export class PeopleController {
  constructor(private readonly svc: PeopleService) {}

  @Get()
  @RequirePermission('people:read')
  list(@Query(new ZodPipe(zPaging.passthrough())) q: Paging & { role?: string }) {
    return this.svc.list(q);
  }

  @Get(':id')
  @RequirePermission('people:read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(id);
  }

  @Post()
  @RequirePermission('people:write')
  create(@Body(new ZodPipe(PersonDto)) dto: PersonDto, @CurrentUser() u: RequestUser) {
    return this.svc.create(dto, u);
  }

  @Put(':id')
  @RequirePermission('people:write')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PersonDto)) dto: PersonDto, @CurrentUser() u: RequestUser) {
    return this.svc.update(id, dto, u);
  }
}

@Module({ controllers: [PeopleController], providers: [PeopleService] })
export class PeopleModule {}

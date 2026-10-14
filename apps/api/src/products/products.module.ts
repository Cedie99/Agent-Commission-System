import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ProductDto, zPaging, type Paging } from '@ocs/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { toPrisma, wireReq } from '../common/convert';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';

type ProductDto = z.infer<typeof ProductDto>;
type Row = Prisma.ProductGetPayload<object>;
const view = (p: Row) => ({ id: p.id, eric6Code: p.eric6Code, name: p.name, litersPerUnit: wireReq(p.litersPerUnit), category: p.category, active: p.active });

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(p: Paging) {
    const where: Prisma.ProductWhereInput = p.q
      ? { OR: [{ eric6Code: { contains: p.q, mode: 'insensitive' } }, { name: { contains: p.q, mode: 'insensitive' } }] }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy: { eric6Code: 'asc' }, skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
      this.prisma.product.count({ where }),
    ]);
    return { items: items.map(view), total, page: p.page, pageSize: p.pageSize };
  }

  async create(dto: ProductDto, user: RequestUser) {
    const p = await this.prisma.product.create({ data: { ...dto, litersPerUnit: toPrisma(dto.litersPerUnit) } });
    await this.audit.log({ userId: user.id, action: 'product.create', entity: 'Product', entityId: p.id, after: p });
    return view(p);
  }

  async update(id: string, dto: ProductDto, user: RequestUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const p = await this.prisma.product.update({ where: { id }, data: { ...dto, litersPerUnit: toPrisma(dto.litersPerUnit) } });
    await this.audit.log({ userId: user.id, action: 'product.update', entity: 'Product', entityId: id, before, after: p });
    return view(p);
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly svc: ProductsService) {}

  @Get()
  @RequirePermission('customers:read')
  list(@Query(new ZodPipe(zPaging)) q: Paging) {
    return this.svc.list(q);
  }

  @Post()
  @RequirePermission('customers:write')
  create(@Body(new ZodPipe(ProductDto)) dto: ProductDto, @CurrentUser() u: RequestUser) {
    return this.svc.create(dto, u);
  }

  @Put(':id')
  @RequirePermission('customers:write')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ProductDto)) dto: ProductDto, @CurrentUser() u: RequestUser) {
    return this.svc.update(id, dto, u);
  }
}

@Module({ controllers: [ProductsController], providers: [ProductsService] })
export class ProductsModule {}

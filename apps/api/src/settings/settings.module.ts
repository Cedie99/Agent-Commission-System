import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canSeeConfidential, FIELDS_BY_TYPE, ImportMappingConfig, zIsoDate, type ImportType } from '@ocs/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { dateFromIso, isoDate } from '../common/convert';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';

const SetSettingDto = z.object({ value: z.unknown(), effectiveFrom: zIsoDate, description: z.string().max(1000).optional() });
type SetSettingDto = z.infer<typeof SetSettingDto>;

const MappingDto = z.object({ importType: z.enum(['SALES', 'COLLECTIONS']), name: z.string().trim().min(1).max(200), isDefault: z.boolean().default(false), config: ImportMappingConfig });
type MappingDto = z.infer<typeof MappingDto>;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser) {
    const rows = await this.prisma.engineSetting.findMany({
      where: canSeeConfidential(user.roles) ? {} : { isConfidential: false },
      orderBy: [{ key: 'asc' }, { effectiveFrom: 'desc' }],
    });
    return rows.map((r) => ({ id: r.id, key: r.key, value: r.value, effectiveFrom: isoDate(r.effectiveFrom), isConfidential: r.isConfidential, description: r.description }));
  }

  /** Settings are versioned: a change is a new row with its own effectiveFrom. */
  async set(key: string, dto: SetSettingDto, user: RequestUser) {
    const prev = await this.prisma.engineSetting.findFirst({ where: { key }, orderBy: { effectiveFrom: 'desc' } });
    if (!prev) throw new NotFoundException(`Unknown setting ${key}`);
    if (key === 'graceDays' && !(Number.isInteger(dto.value) && (dto.value as number) >= 0)) throw new BadRequestException('graceDays must be a non-negative integer');
    const row = await this.prisma.engineSetting.upsert({
      where: { key_effectiveFrom: { key, effectiveFrom: dateFromIso(dto.effectiveFrom) } },
      update: { value: dto.value as Prisma.InputJsonValue, description: dto.description ?? prev.description },
      create: {
        key,
        value: dto.value as Prisma.InputJsonValue,
        effectiveFrom: dateFromIso(dto.effectiveFrom),
        isConfidential: prev.isConfidential,
        description: dto.description ?? prev.description,
      },
    });
    await this.audit.log({ userId: user.id, action: 'setting.set', entity: 'EngineSetting', entityId: row.id, before: prev, after: row });
    return { id: row.id, key: row.key, value: row.value, effectiveFrom: isoDate(row.effectiveFrom), isConfidential: row.isConfidential };
  }

  listMappings(type?: ImportType) {
    return this.prisma.importMapping.findMany({ where: type ? { importType: type } : {}, orderBy: [{ importType: 'asc' }, { name: 'asc' }] });
  }

  fields() {
    return FIELDS_BY_TYPE;
  }

  async upsertMapping(id: string | null, dto: MappingDto, user: RequestUser) {
    const required = FIELDS_BY_TYPE[dto.importType].filter((f) => f.required).map((f) => f.field);
    const missing = required.filter((f) => !dto.config.columns[f]?.length);
    if (missing.length) throw new BadRequestException(`Mapping is missing required fields: ${missing.join(', ')}`);
    const before = id ? await this.prisma.importMapping.findUnique({ where: { id } }) : null;
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.importMapping.updateMany({ where: { importType: dto.importType }, data: { isDefault: false } });
      const data = { importType: dto.importType, name: dto.name, isDefault: dto.isDefault, config: dto.config as Prisma.InputJsonValue };
      return id ? tx.importMapping.update({ where: { id }, data }) : tx.importMapping.create({ data });
    });
    await this.audit.log({ userId: user.id, action: id ? 'importMapping.update' : 'importMapping.create', entity: 'ImportMapping', entityId: row.id, before, after: row });
    return row;
  }
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('engine')
  @RequirePermission('settings:read')
  list(@CurrentUser() u: RequestUser) {
    return this.settings.list(u);
  }

  @Put('engine/:key')
  @RequirePermission('settings:confidential')
  set(@Param('key') key: string, @Body(new ZodPipe(SetSettingDto)) dto: SetSettingDto, @CurrentUser() u: RequestUser) {
    return this.settings.set(key, dto, u);
  }

  @Get('import-mappings')
  @RequirePermission('imports:read')
  mappings(@Query('type') type?: ImportType) {
    return this.settings.listMappings(type);
  }

  @Get('import-fields')
  @RequirePermission('imports:read')
  fields() {
    return this.settings.fields();
  }

  @Post('import-mappings')
  @RequirePermission('settings:read')
  createMapping(@Body(new ZodPipe(MappingDto)) dto: MappingDto, @CurrentUser() u: RequestUser) {
    return this.settings.upsertMapping(null, dto, u);
  }

  @Put('import-mappings/:id')
  @RequirePermission('settings:read')
  updateMapping(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(MappingDto)) dto: MappingDto, @CurrentUser() u: RequestUser) {
    return this.settings.upsertMapping(id, dto, u);
  }
}

@Module({ controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}

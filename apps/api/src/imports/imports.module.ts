import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  type OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma, type ImportType } from '@prisma/client';
import { CreateImportDto, ImportMappingConfig, type CollectionRow, type ImportBatchView, type ImportRowError } from '@ocs/shared';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, type RequestUser } from '../common/auth';
import { dateFromIso, dateFromIsoOrNull, isoDate, toPrisma, toPrismaOrNull } from '../common/convert';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod.pipe';
import { JobsService, QUEUES } from '../jobs/jobs.service';
import {
  collectionKey,
  duplicatesWithinFile,
  mapHeaders,
  readSheet,
  resolveSalesRow,
  salesKey,
  validateRows,
  type ResolvedSalesLine,
  type SalesRefs,
} from './parse';

const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? './uploads');
const MAX_MB = Number.parseInt(process.env.MAX_UPLOAD_MB ?? '20', 10);

const RowsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(200),
  filter: z.enum(['all', 'errors', 'duplicates', 'valid']).default('all'),
});

@Injectable()
export class ImportsService implements OnModuleInit {
  private readonly log = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await mkdir(UPLOAD_DIR, { recursive: true });
    void this.jobs.work<{ batchId: string }>(QUEUES.IMPORT_VALIDATE, ({ batchId }) => this.validate(batchId));
  }

  async upload(file: Express.Multer.File | undefined, dto: z.infer<typeof CreateImportDto>, user: RequestUser) {
    if (!file) throw new BadRequestException('No file uploaded (field "file")');
    if (!/\.(xlsx|csv)$/i.test(file.originalname)) throw new BadRequestException('Only .xlsx and .csv files are supported');
    const mapping = dto.mappingId
      ? await this.prisma.importMapping.findUnique({ where: { id: dto.mappingId } })
      : await this.prisma.importMapping.findFirst({ where: { importType: dto.type, isDefault: true } });
    if (!mapping || mapping.importType !== dto.type) throw new BadRequestException(`No ${dto.type} column mapping configured`);

    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    const storedPath = join(UPLOAD_DIR, `${randomUUID()}-${basename(file.originalname).replace(/[^\w.-]/g, '_')}`);
    await writeFile(storedPath, file.buffer);
    const batch = await this.prisma.importBatch.create({
      data: { type: dto.type, fileName: file.originalname, fileHash, storedPath, mappingId: mapping.id, uploadedById: user.id },
    });
    await this.jobs.send(QUEUES.IMPORT_VALIDATE, { batchId: batch.id });
    return this.view(batch.id);
  }

  /** Background job: parse, map, validate, resolve references, detect duplicates, stage rows. */
  async validate(batchId: string) {
    const batch = await this.prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { mapping: true } });
    if (batch.status !== 'UPLOADED') return;
    await this.prisma.importBatch.update({ where: { id: batchId }, data: { status: 'VALIDATING' } });
    const fileErrors: ImportRowError[] = [];
    try {
      const cfg = ImportMappingConfig.parse(batch.mapping?.config ?? {});
      const sheet = await readSheet(await readFile(batch.storedPath), batch.fileName, cfg);
      const { index, missing } = mapHeaders(batch.type, sheet.headers, cfg);
      if (missing.length) {
        fileErrors.push({ rowNo: cfg.headerRow, message: `Missing required columns: ${missing.join(', ')}. Found headers: ${sheet.headers.filter(Boolean).join(', ')}` });
        return await this.finish(batchId, { status: 'FAILED', rowCount: sheet.rows.length, fileErrors });
      }
      const prior = await this.prisma.importBatch.findFirst({ where: { fileHash: batch.fileHash, status: 'COMMITTED', id: { not: batchId } } });
      if (prior) fileErrors.push({ rowNo: 0, message: `Warning: identical file already committed on ${prior.committedAt?.toISOString().slice(0, 10)} (${prior.fileName})` });

      const staged = batch.type === 'SALES' ? await this.stageSales(sheet, index, cfg) : await this.stageCollections(sheet, index, cfg);
      await this.prisma.$transaction(async (tx) => {
        await tx.importRow.deleteMany({ where: { batchId } });
        for (let i = 0; i < staged.length; i += 1000) {
          await tx.importRow.createMany({
            data: staged.slice(i, i + 1000).map((r) => ({
              batchId,
              rowNo: r.rowNo,
              raw: r.raw as Prisma.InputJsonValue,
              parsed: r.parsed === null ? Prisma.DbNull : (r.parsed as Prisma.InputJsonValue),
              errors: r.errors.length ? (r.errors as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
              isDuplicate: r.isDuplicate,
            })),
          });
        }
      });
      const validCount = staged.filter((r) => !r.errors.length && !r.isDuplicate).length;
      await this.finish(batchId, {
        status: validCount > 0 ? 'VALIDATED' : 'FAILED',
        rowCount: staged.length,
        validCount,
        errorCount: staged.filter((r) => r.errors.length).length,
        duplicateCount: staged.filter((r) => r.isDuplicate && !r.errors.length).length,
        fileErrors: validCount > 0 ? fileErrors : [...fileErrors, { rowNo: 0, message: 'No valid rows to commit' }],
      });
    } catch (e) {
      this.log.error(e);
      fileErrors.push({ rowNo: 0, message: `Could not read file: ${e instanceof Error ? e.message : String(e)}` });
      await this.finish(batchId, { status: 'FAILED', fileErrors });
    }
  }

  private async finish(
    batchId: string,
    r: { status: 'VALIDATED' | 'FAILED'; rowCount?: number; validCount?: number; errorCount?: number; duplicateCount?: number; fileErrors: ImportRowError[] },
  ) {
    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: r.status,
        rowCount: r.rowCount ?? 0,
        validCount: r.validCount ?? 0,
        errorCount: r.errorCount ?? 0,
        duplicateCount: r.duplicateCount ?? 0,
        errors: r.fileErrors as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async stageSales(sheet: Awaited<ReturnType<typeof readSheet>>, index: Record<string, number>, cfg: ImportMappingConfig) {
    const rows = validateRows('SALES', sheet, index, cfg);
    const valid = rows.filter((r) => r.parsed);
    const custCodes = [...new Set(valid.map((r) => r.parsed!.customerCode!))];
    const prodCodes = [...new Set(valid.map((r) => r.parsed!.productCode!))];
    const personCodes = [...new Set(valid.flatMap((r) => [r.parsed!.asCode, r.parsed!.ssCode, r.parsed!.smCode]).filter((c): c is string => !!c))];
    const [customers, products, people, pricelists] = await Promise.all([
      this.prisma.customer.findMany({ where: { eric6Code: { in: custCodes } } }),
      this.prisma.product.findMany({ where: { eric6Code: { in: prodCodes } } }),
      this.prisma.person.findMany({ where: { code: { in: personCodes } } }),
      this.prisma.pricelist.findMany({ include: { items: true }, orderBy: { effectiveFrom: 'desc' } }),
    ]);
    const refs: SalesRefs = {
      customers: new Map(customers.map((c) => [c.eric6Code, { id: c.id, channel: c.channel, accountType: c.accountType, asId: c.asId, ssId: c.ssId, smId: c.smId }])),
      products: new Map(products.map((p) => [p.eric6Code, { id: p.id, litersPerUnit: p.litersPerUnit.toFixed(4) }])),
      people: new Map(people.map((p) => [p.code, p.id])),
      srp: (productId, invoiceDate) => {
        const pl = pricelists.find((p) => isoDate(p.effectiveFrom) <= invoiceDate && (!p.effectiveTo || isoDate(p.effectiveTo) >= invoiceDate));
        const item = pl?.items.find((i) => i.productId === productId);
        return item ? item.price.toFixed(4) : null;
      },
    };
    const inFile = duplicatesWithinFile(rows, (p) => salesKey(p));
    const keys = valid.map((r) => ({ invoiceNo: r.parsed!.invoiceNo!, lineNo: r.parsed!.lineNo! }));
    const existing = new Set<string>();
    for (let i = 0; i < keys.length; i += 500) {
      const found = await this.prisma.salesInvoiceLine.findMany({ where: { OR: keys.slice(i, i + 500) }, select: { invoiceNo: true, lineNo: true } });
      for (const f of found) existing.add(salesKey(f));
    }
    return rows.map((r) => {
      if (!r.parsed) return { ...r, isDuplicate: false, parsed: null as ResolvedSalesLine | null };
      const res = resolveSalesRow(r.parsed, r.rowNo, refs);
      const errors = [...res.errors];
      let isDuplicate = false;
      if (inFile.has(r.rowNo)) {
        isDuplicate = true;
        errors.push({ rowNo: r.rowNo, field: 'invoiceNo', message: `Duplicate of row ${inFile.get(r.rowNo)} (same invoice no + line no)` });
      } else if (existing.has(salesKey(r.parsed))) {
        isDuplicate = true;
      }
      return { rowNo: r.rowNo, raw: r.raw, parsed: res.line ?? null, errors, isDuplicate };
    });
  }

  private async stageCollections(sheet: Awaited<ReturnType<typeof readSheet>>, index: Record<string, number>, cfg: ImportMappingConfig) {
    const rows = validateRows('COLLECTIONS', sheet, index, cfg);
    const inFile = duplicatesWithinFile(rows, (p) => collectionKey(p));
    const valid = rows.filter((r) => r.parsed);
    const existing = new Set<string>();
    for (let i = 0; i < valid.length; i += 500) {
      const found = await this.prisma.collection.findMany({
        where: { OR: valid.slice(i, i + 500).map((r) => ({ invoiceNo: r.parsed!.invoiceNo!, reference: r.parsed!.reference!, checkNo: r.parsed!.checkNo ?? '' })) },
        select: { invoiceNo: true, reference: true, checkNo: true },
      });
      for (const f of found) existing.add(collectionKey(f));
    }
    const knownInvoices = new Set(
      (await this.prisma.salesInvoiceLine.findMany({ where: { invoiceNo: { in: [...new Set(valid.map((r) => r.parsed!.invoiceNo!))] } }, select: { invoiceNo: true }, distinct: ['invoiceNo'] })).map(
        (x) => x.invoiceNo,
      ),
    );
    return rows.map((r) => {
      const errors = [...r.errors];
      let isDuplicate = false;
      let parsed: (CollectionRow & { warnings: string[] }) | null = null;
      if (r.parsed) {
        parsed = { ...r.parsed, warnings: knownInvoices.has(r.parsed.invoiceNo!) ? [] : ['Invoice not imported yet (collection will be kept and matched later)'] };
        if (inFile.has(r.rowNo)) {
          isDuplicate = true;
          errors.push({ rowNo: r.rowNo, field: 'reference', message: `Duplicate of row ${inFile.get(r.rowNo)} (same invoice + reference + check no)` });
        } else if (existing.has(collectionKey(r.parsed))) isDuplicate = true;
      }
      return { rowNo: r.rowNo, raw: r.raw, parsed, errors, isDuplicate };
    });
  }

  /** Insert valid, non-duplicate rows into SalesInvoiceLine / Collection. */
  async commit(batchId: string, user: RequestUser) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException();
    if (batch.status !== 'VALIDATED') throw new ConflictException(`Batch is ${batch.status}; only VALIDATED batches can be committed`);
    const rows = await this.prisma.importRow.findMany({ where: { batchId, isDuplicate: false, errors: { equals: Prisma.DbNull } }, orderBy: { rowNo: 'asc' } });
    const count = await this.prisma.$transaction(
      async (tx) => {
        if (batch.type === 'SALES') {
          const data = rows.map((r) => {
            const p = r.parsed as unknown as ResolvedSalesLine;
            return {
              batchId,
              invoiceNo: p.invoiceNo,
              lineNo: p.lineNo,
              invoiceDate: dateFromIso(p.invoiceDate),
              customerId: p.customerId,
              productId: p.productId,
              channel: p.channel as Prisma.SalesInvoiceLineCreateManyInput['channel'],
              accountType: p.accountType as Prisma.SalesInvoiceLineCreateManyInput['accountType'],
              statedTermDays: p.statedTermDays,
              qty: toPrisma(p.qty),
              liters: toPrisma(p.liters),
              unitPrice: toPrisma(p.unitPrice),
              pricelistPrice: toPrismaOrNull(p.pricelistPrice),
              approvedStandardDiscount: p.approvedStandardDiscount,
              invoiceTotal: toPrismaOrNull(p.invoiceTotal),
              asId: p.asId,
              ssId: p.ssId,
              smId: p.smId,
            };
          });
          return (await tx.salesInvoiceLine.createMany({ data })).count;
        }
        const data = rows.map((r) => {
          const p = r.parsed as unknown as CollectionRow;
          return {
            batchId,
            invoiceNo: p.invoiceNo!,
            reference: p.reference!,
            checkNo: p.checkNo ?? '',
            amount: toPrisma(p.amount!),
            status: p.status,
            clearedDate: dateFromIsoOrNull(p.clearedDate),
            paymentDate: dateFromIsoOrNull(p.paymentDate),
          };
        });
        return (await tx.collection.createMany({ data })).count;
      },
      { timeout: 120_000 },
    );
    await this.prisma.importBatch.update({ where: { id: batchId }, data: { status: 'COMMITTED', committedAt: new Date() } });
    await this.audit.log({ userId: user.id, action: 'import.commit', entity: 'ImportBatch', entityId: batchId, after: { type: batch.type, inserted: count } });
    return { ...(await this.view(batchId)), inserted: count };
  }

  async discard(batchId: string, user: RequestUser) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException();
    if (batch.status === 'COMMITTED') throw new ConflictException('Committed batches cannot be discarded');
    await this.prisma.importBatch.update({ where: { id: batchId }, data: { status: 'DISCARDED' } });
    await this.audit.log({ userId: user.id, action: 'import.discard', entity: 'ImportBatch', entityId: batchId, before: { status: batch.status } });
    return this.view(batchId);
  }

  async list(type?: ImportType) {
    const rows = await this.prisma.importBatch.findMany({ where: type ? { type } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
    const users = await this.userEmails(rows.map((r) => r.uploadedById));
    return rows.map((b) => this.batchView(b, users.get(b.uploadedById) ?? b.uploadedById));
  }

  async view(id: string): Promise<ImportBatchView> {
    const b = await this.prisma.importBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException();
    const users = await this.userEmails([b.uploadedById]);
    return this.batchView(b, users.get(b.uploadedById) ?? b.uploadedById);
  }

  async rows(id: string, q: z.infer<typeof RowsQuery>) {
    const where: Prisma.ImportRowWhereInput = {
      batchId: id,
      ...(q.filter === 'errors' ? { NOT: { errors: { equals: Prisma.DbNull } } } : {}),
      ...(q.filter === 'duplicates' ? { isDuplicate: true } : {}),
      ...(q.filter === 'valid' ? { isDuplicate: false, errors: { equals: Prisma.DbNull } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.importRow.findMany({ where, orderBy: { rowNo: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.importRow.count({ where }),
    ]);
    return { items: items.map((r) => ({ rowNo: r.rowNo, raw: r.raw, parsed: r.parsed, errors: r.errors ?? [], isDuplicate: r.isDuplicate })), total, page: q.page, pageSize: q.pageSize };
  }

  async errorReport(id: string): Promise<{ fileName: string; buffer: Buffer }> {
    const b = await this.prisma.importBatch.findUnique({ where: { id } });
    if (!b) throw new NotFoundException();
    const rows = await this.prisma.importRow.findMany({ where: { batchId: id, OR: [{ NOT: { errors: { equals: Prisma.DbNull } } }, { isDuplicate: true }] }, orderBy: { rowNo: 'asc' } });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Errors');
    const rawKeys = [...new Set(rows.flatMap((r) => Object.keys((r.raw as object) ?? {})))];
    ws.addRow(['Row No', 'Problem', ...rawKeys]).font = { bold: true };
    for (const fe of (b.errors as unknown as ImportRowError[]) ?? []) ws.addRow([fe.rowNo || '', fe.message]);
    for (const r of rows) {
      const errs = ((r.errors as unknown as ImportRowError[]) ?? []).map((e) => e.message);
      if (r.isDuplicate && !errs.length) errs.push('Already imported (duplicate) — skipped');
      const raw = (r.raw as Record<string, unknown>) ?? {};
      ws.addRow([r.rowNo, errs.join('; '), ...rawKeys.map((k) => (raw[k] === null || raw[k] === undefined ? '' : String(raw[k])))]);
    }
    ws.columns.forEach((c, i) => (c.width = i === 1 ? 70 : 16));
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { fileName: `${b.fileName.replace(/\.(xlsx|csv)$/i, '')}-errors.xlsx`, buffer };
  }

  private async userEmails(ids: string[]) {
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, email: true } });
    return new Map(users.map((u) => [u.id, u.email]));
  }

  private batchView(b: Prisma.ImportBatchGetPayload<object>, uploadedBy: string): ImportBatchView {
    return {
      id: b.id,
      type: b.type,
      fileName: b.fileName,
      status: b.status,
      rowCount: b.rowCount,
      validCount: b.validCount,
      errorCount: b.errorCount,
      duplicateCount: b.duplicateCount,
      uploadedBy,
      createdAt: b.createdAt.toISOString(),
      committedAt: b.committedAt?.toISOString() ?? null,
      errors: (b.errors as unknown as ImportRowError[]) ?? [],
    };
  }
}

@Controller('imports')
export class ImportsController {
  constructor(private readonly svc: ImportsService) {}

  @Post()
  @RequirePermission('imports:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MB * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Body(new ZodPipe(CreateImportDto)) dto: z.infer<typeof CreateImportDto>, @CurrentUser() u: RequestUser) {
    return this.svc.upload(file, dto, u);
  }

  @Get()
  @RequirePermission('imports:read')
  list(@Query('type') type?: ImportType) {
    return this.svc.list(type);
  }

  @Get(':id')
  @RequirePermission('imports:read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.view(id);
  }

  @Get(':id/rows')
  @RequirePermission('imports:read')
  rows(@Param('id', ParseUUIDPipe) id: string, @Query(new ZodPipe(RowsQuery)) q: z.infer<typeof RowsQuery>) {
    return this.svc.rows(id, q);
  }

  @Get(':id/error-report')
  @RequirePermission('imports:read')
  async errorReport(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { fileName, buffer } = await this.svc.errorReport(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Post(':id/commit')
  @RequirePermission('imports:write')
  commit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: RequestUser) {
    return this.svc.commit(id, u);
  }

  @Post(':id/discard')
  @RequirePermission('imports:write')
  discard(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: RequestUser) {
    return this.svc.discard(id, u);
  }
}

@Module({ controllers: [ImportsController], providers: [ImportsService] })
export class ImportsModule {}

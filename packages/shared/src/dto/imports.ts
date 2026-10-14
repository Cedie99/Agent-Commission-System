import { z } from 'zod';
import { CHANNELS, COLLECTION_STATUSES, IMPORT_TYPES, type ImportType } from '../enums';
import { D } from '../money';
import { cellToIsoDate } from '../zod';

/**
 * Logical import fields. A column mapping (ImportMapping.columns) maps each field to one
 * or more header aliases found in the ERIC6 export. The real ERIC6 headers aren't known
 * yet, so this is config-driven: edit the mapping, not the code.
 */
export interface ImportFieldDef {
  field: string;
  label: string;
  required: boolean;
  kind: 'string' | 'int' | 'decimal' | 'date' | 'bool' | 'enum';
  help?: string;
}

export const SALES_FIELDS: ImportFieldDef[] = [
  { field: 'invoiceNo', label: 'Invoice No', required: true, kind: 'string' },
  { field: 'lineNo', label: 'Line No', required: true, kind: 'int' },
  { field: 'invoiceDate', label: 'Invoice Date', required: true, kind: 'date' },
  { field: 'customerCode', label: 'Customer Code', required: true, kind: 'string', help: 'ERIC6 customer code; must exist in Customers' },
  { field: 'productCode', label: 'Product Code', required: true, kind: 'string', help: 'ERIC6 item code; must exist in Products' },
  { field: 'qty', label: 'Quantity', required: true, kind: 'decimal' },
  { field: 'unitPrice', label: 'Unit Price', required: true, kind: 'decimal' },
  { field: 'statedTermDays', label: 'Terms (days)', required: true, kind: 'int', help: '0 = COD' },
  { field: 'liters', label: 'Liters', required: false, kind: 'decimal', help: 'If absent: qty × product liters/unit' },
  { field: 'pricelistPrice', label: 'Pricelist Price (SRP)', required: false, kind: 'decimal', help: 'If absent: looked up from Pricelists by invoice date' },
  { field: 'approvedStandardDiscount', label: 'Approved Std Discount', required: false, kind: 'bool' },
  { field: 'invoiceTotal', label: 'Invoice Total', required: false, kind: 'decimal', help: 'Gross invoice amount used for the full-collection test' },
  { field: 'channel', label: 'Channel', required: false, kind: 'enum', help: 'Overrides the customer master' },
  { field: 'asCode', label: 'AS Code', required: false, kind: 'string', help: 'Overrides the customer master' },
  { field: 'ssCode', label: 'SS Code', required: false, kind: 'string' },
  { field: 'smCode', label: 'SM Code', required: false, kind: 'string' },
];

export const COLLECTION_FIELDS: ImportFieldDef[] = [
  { field: 'invoiceNo', label: 'Invoice No', required: true, kind: 'string' },
  { field: 'reference', label: 'OR / CR No', required: true, kind: 'string' },
  { field: 'checkNo', label: 'Check No', required: false, kind: 'string', help: 'Blank for cash' },
  { field: 'amount', label: 'Amount Applied', required: true, kind: 'decimal' },
  { field: 'clearedDate', label: 'Cleared Date', required: false, kind: 'date', help: 'Blank = not yet cleared (PDC / pending)' },
  { field: 'status', label: 'Status', required: false, kind: 'enum', help: 'CLEARED / PENDING / BOUNCED. Default: CLEARED if cleared date present, else PENDING' },
  { field: 'paymentDate', label: 'Payment Date', required: false, kind: 'date' },
];

export const FIELDS_BY_TYPE: Record<ImportType, ImportFieldDef[]> = {
  SALES: SALES_FIELDS,
  COLLECTIONS: COLLECTION_FIELDS,
};

export const ImportMappingConfig = z.object({
  /** Worksheet name or 1-based index. Default: first sheet. */
  sheet: z.union([z.string(), z.number().int().min(1)]).optional(),
  /** 1-based header row. */
  headerRow: z.number().int().min(1).default(1),
  /** field → header aliases (case/space-insensitive match). */
  columns: z.record(z.string(), z.array(z.string()).min(1)),
  /** Values like 'Y', 'YES', 'TRUE', '1' count as true for bool fields. */
  trueValues: z.array(z.string()).default(['Y', 'YES', 'TRUE', '1', 'X']),
});
export type ImportMappingConfig = z.infer<typeof ImportMappingConfig>;

export const CreateImportDto = z.object({
  type: z.enum(IMPORT_TYPES),
  mappingId: z.string().uuid().optional(),
});

// ---------- row validation ----------
const decimalCell = (label: string) =>
  z.unknown().transform((v, ctx) => {
    try {
      const d = D.fromExcel(v);
      if (d === null) return null;
      return d.toFixed(4);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: not a number (${String(v)})` });
      return z.NEVER;
    }
  });

const requiredDecimal = (label: string) =>
  decimalCell(label).refine((v) => v !== null, { message: `${label} is required` });

const dateCell = (label: string, required: boolean) =>
  z.unknown().transform((v, ctx) => {
    const iso = cellToIsoDate(v);
    if (iso === null && v !== null && v !== undefined && v !== '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: unrecognised date "${String(v)}"` });
      return z.NEVER;
    }
    if (iso === null && required) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required` });
      return z.NEVER;
    }
    return iso;
  });

const stringCell = (label: string, required: boolean) =>
  z.unknown().transform((v, ctx) => {
    const s = v === null || v === undefined ? '' : String(typeof v === 'object' && 'result' in (v as object) ? (v as { result: unknown }).result : v).trim();
    if (!s && required) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required` });
      return z.NEVER;
    }
    return s || null;
  });

const intCell = (label: string, required: boolean) =>
  z.unknown().transform((v, ctx) => {
    if (v === null || v === undefined || String(v).trim() === '') {
      if (required) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required` });
        return z.NEVER;
      }
      return null;
    }
    const s = String(v).trim().replace(/\s*days?$/i, '');
    if (/^COD$/i.test(s)) return 0;
    if (!/^\d+$/.test(s)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: expected a whole number (${String(v)})` });
      return z.NEVER;
    }
    return Number.parseInt(s, 10);
  });

export function boolCell(trueValues: string[]) {
  return z.unknown().transform((v) => {
    if (v === true) return true;
    if (v === null || v === undefined || v === false) return false;
    return trueValues.map((t) => t.toUpperCase()).includes(String(v).trim().toUpperCase());
  });
}

const enumCell = <T extends readonly [string, ...string[]]>(label: string, values: T) =>
  z.unknown().transform((v, ctx) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const s = String(v).trim().toUpperCase();
    if (!(values as readonly string[]).includes(s)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: "${String(v)}" is not one of ${values.join(', ')}` });
      return z.NEVER;
    }
    return s as T[number];
  });

export function salesRowSchema(trueValues: string[]) {
  return z
    .object({
      invoiceNo: stringCell('Invoice No', true),
      lineNo: intCell('Line No', true),
      invoiceDate: dateCell('Invoice Date', true),
      customerCode: stringCell('Customer Code', true),
      productCode: stringCell('Product Code', true),
      qty: requiredDecimal('Quantity'),
      unitPrice: requiredDecimal('Unit Price'),
      statedTermDays: intCell('Terms', true),
      liters: decimalCell('Liters'),
      pricelistPrice: decimalCell('Pricelist Price'),
      approvedStandardDiscount: boolCell(trueValues),
      invoiceTotal: decimalCell('Invoice Total'),
      channel: enumCell('Channel', CHANNELS),
      asCode: stringCell('AS Code', false),
      ssCode: stringCell('SS Code', false),
      smCode: stringCell('SM Code', false),
    })
    .superRefine((r, ctx) => {
      if (r.unitPrice !== null && D(r.unitPrice).isNegative()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['unitPrice'], message: 'Unit Price cannot be negative' });
      }
    });
}
export type SalesRow = z.infer<ReturnType<typeof salesRowSchema>>;

export function collectionRowSchema() {
  return z
    .object({
      invoiceNo: stringCell('Invoice No', true),
      reference: stringCell('OR / CR No', true),
      checkNo: stringCell('Check No', false),
      amount: requiredDecimal('Amount'),
      clearedDate: dateCell('Cleared Date', false),
      status: enumCell('Status', COLLECTION_STATUSES),
      paymentDate: dateCell('Payment Date', false),
    })
    .transform((r) => ({ ...r, status: r.status ?? (r.clearedDate ? 'CLEARED' : 'PENDING') }))
    .superRefine((r, ctx) => {
      if (r.status === 'CLEARED' && !r.clearedDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clearedDate'], message: 'CLEARED payments need a cleared date' });
      }
      if (r.amount !== null && !D(r.amount).gt(0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Amount must be > 0' });
      }
    });
}
export type CollectionRow = z.infer<ReturnType<typeof collectionRowSchema>>;

export interface ImportRowError {
  rowNo: number;
  field?: string;
  message: string;
}

export interface ImportBatchView {
  id: string;
  type: ImportType;
  fileName: string;
  status: string;
  rowCount: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  uploadedBy: string;
  createdAt: string;
  committedAt: string | null;
  errors: ImportRowError[];
}

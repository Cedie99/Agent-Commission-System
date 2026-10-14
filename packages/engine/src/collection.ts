import { roundMoney, sum, ZERO, type Decimal } from '@ocs/shared/money';
import type { CollectionInput, EngineException, InvoiceContext, InvoiceLineInput, IsoDate } from './types';

export type CollectionState =
  | { state: 'FULL'; recognitionDate: IsoDate; collected: Decimal; lastReference: string }
  | { state: 'PARTIAL'; collected: Decimal };

/**
 * Commission is earned only when the invoice is FULLY collected.
 * Only CLEARED payments with a cleared date count (PDCs and bounced checks don't).
 * Recognition date = the cleared date on which cumulative cleared payments first reach
 * the invoice total, i.e. the cleared date of the last check/cash needed to fully pay it.
 *
 * @param asOf only payments cleared on/before this date count (the run's periodEnd).
 */
export function resolveCollection(total: Decimal, collections: CollectionInput[], tolerance: Decimal, asOf?: IsoDate): CollectionState {
  const cleared = collections
    .filter((c) => c.status === 'CLEARED' && c.clearedDate !== null && (asOf === undefined || c.clearedDate <= asOf))
    .sort((a, b) => (a.clearedDate! < b.clearedDate! ? -1 : a.clearedDate! > b.clearedDate! ? 1 : a.reference.localeCompare(b.reference)));

  const target = total.minus(tolerance);
  let running = ZERO;
  for (const c of cleared) {
    running = running.plus(c.amount);
    if (running.gte(target)) {
      return { state: 'FULL', recognitionDate: c.clearedDate!, collected: sum(cleared.map((x) => x.amount)), lastReference: c.reference };
    }
  }
  return { state: 'PARTIAL', collected: running };
}

/**
 * Group lines and collections per invoice. Invoice total = the exported invoiceTotal if present
 * (all lines must agree), otherwise Σ(qty × unitPrice) rounded to 2 dp.
 */
export function buildInvoiceContexts(lines: InvoiceLineInput[], collections: CollectionInput[]): Map<string, InvoiceContext> {
  const byInvoice = new Map<string, InvoiceLineInput[]>();
  for (const l of lines) {
    const arr = byInvoice.get(l.invoiceNo) ?? [];
    arr.push(l);
    byInvoice.set(l.invoiceNo, arr);
  }
  const colls = new Map<string, CollectionInput[]>();
  for (const c of collections) {
    const arr = colls.get(c.invoiceNo) ?? [];
    arr.push(c);
    colls.set(c.invoiceNo, arr);
  }
  const out = new Map<string, InvoiceContext>();
  for (const [invoiceNo, invLines] of byInvoice) {
    const problems: EngineException[] = [];
    const exported = invLines.map((l) => l.invoiceTotal).filter((t): t is Decimal => t !== undefined && t !== null);
    let total: Decimal;
    if (exported.length > 0) {
      total = exported[0]!;
      if (exported.some((t) => !t.eq(total))) {
        problems.push({ code: 'INVALID_INVOICE_TOTAL', message: `Invoice ${invoiceNo}: lines disagree on the invoice total` });
      }
    } else {
      total = roundMoney(sum(invLines.map((l) => l.qty.times(l.unitPrice))));
    }
    if (!total.gt(0)) {
      problems.push({ code: 'INVALID_INVOICE_TOTAL', message: `Invoice ${invoiceNo}: invoice total must be > 0 (got ${total.toFixed(2)})` });
    }
    out.set(invoiceNo, { invoiceNo, total, collections: colls.get(invoiceNo) ?? [], problems });
  }
  return out;
}

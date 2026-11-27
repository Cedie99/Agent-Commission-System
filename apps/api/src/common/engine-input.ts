/**
 * Prisma rows → engine inputs. Used by the run computation and by the agent dashboard,
 * so both apply the engine's rules (invoice totals, cleared payments) to identical data.
 */
import type { Collection, SalesInvoiceLine } from '@prisma/client';
import type { CollectionInput, InvoiceLineInput } from '@ocs/engine';
import { isoDate, isoDateOrNull, toD, toDOrNull } from './convert';

export function toEngineLine(l: SalesInvoiceLine): InvoiceLineInput {
  return {
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
  };
}

export function toEngineCollection(c: Collection): CollectionInput {
  return {
    invoiceNo: c.invoiceNo,
    amount: toD(c.amount),
    clearedDate: isoDateOrNull(c.clearedDate),
    status: c.status,
    reference: c.checkNo ? `${c.reference}/${c.checkNo}` : c.reference,
  };
}

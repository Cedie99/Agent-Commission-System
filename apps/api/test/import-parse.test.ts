import { describe, expect, it } from 'vitest';
import { ImportMappingConfig } from '@ocs/shared';
import { duplicatesWithinFile, mapHeaders, parseCsv, resolveSalesRow, salesKey, validateRows, type SalesRefs, type Sheet } from '../src/imports/parse';

const salesCfg = ImportMappingConfig.parse({
  columns: {
    invoiceNo: ['Invoice No', 'SI No'],
    lineNo: ['Line No'],
    invoiceDate: ['Invoice Date'],
    customerCode: ['Customer Code'],
    productCode: ['Item Code'],
    qty: ['Qty'],
    unitPrice: ['Unit Price'],
    statedTermDays: ['Terms'],
    pricelistPrice: ['SRP'],
  },
});

function sheetFromCsv(text: string): Sheet {
  const [header, ...rows] = parseCsv(text);
  return { headers: header!, rows: rows.map((r, i) => [i + 2, r]) };
}

const refs: SalesRefs = {
  customers: new Map([['C-001', { id: 'cust-1', channel: 'EU', accountType: 'AS_GENERATED', asId: 'as-1', ssId: null, smId: null }]]),
  products: new Map([['P-018', { id: 'prod-1', litersPerUnit: '18.0000' }]]),
  people: new Map([['AS-002', 'as-2']]),
  srp: (productId, date) => (productId === 'prod-1' && date >= '2026-01-01' ? '1950.0000' : null),
};

describe('import parsing', () => {
  it('maps headers case/space-insensitively and reports missing required columns', () => {
    const m = mapHeaders('SALES', ['SI no', 'LINE NO', 'invoice date', 'Customer  Code', 'Item Code', 'Qty', 'Unit Price', 'Remarks'], salesCfg);
    expect(m.index).toMatchObject({ invoiceNo: 0, lineNo: 1, invoiceDate: 2, customerCode: 3, productCode: 4, qty: 5, unitPrice: 6 });
    expect(m.missing).toEqual(['Terms (days)']);
    expect(m.unmapped).toEqual(['Remarks']);
  });

  it('keeps leading zeros in codes (CSV is not type-coerced)', () => {
    expect(parseCsv('a,b\n"007","x, y"\n')).toEqual([
      ['a', 'b'],
      ['007', 'x, y'],
    ]);
  });

  const csv = [
    'Invoice No,Line No,Invoice Date,Customer Code,Item Code,Qty,Unit Price,Terms,SRP',
    'SI-1,1,09/01/2026,C-001,P-018,50,"2,000.00",30,',
    'SI-1,2,2026-09-01,C-001,P-018,abc,100,30 days,',
    'SI-1,1,2026-09-01,C-001,P-018,1,100,COD,',
    'SI-2,1,2026-02-30,C-999,P-018,1,100,45,',
  ].join('\n');

  it('validates rows with readable errors', () => {
    const sheet = sheetFromCsv(csv);
    const { index } = mapHeaders('SALES', sheet.headers, salesCfg);
    const rows = validateRows('SALES', sheet, index, salesCfg);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.parsed).toMatchObject({ invoiceDate: '2026-09-01', qty: '50.0000', unitPrice: '2000.0000', statedTermDays: 30 });
    expect(rows[1]!.errors.map((e) => e.message)).toEqual(['Quantity: not a number (abc)']);
    expect(rows[2]!.parsed?.statedTermDays).toBe(0); // "COD"
    expect(rows[3]!.errors[0]!.message).toMatch(/unrecognised date/);
  });

  it('flags duplicates within the file by invoiceNo + lineNo', () => {
    const sheet = sheetFromCsv(csv);
    const { index } = mapHeaders('SALES', sheet.headers, salesCfg);
    const dup = duplicatesWithinFile(validateRows('SALES', sheet, index, salesCfg), (p) => salesKey(p));
    expect([...dup.entries()]).toEqual([[4, 2]]);
  });

  it('resolves references, derives liters and looks up SRP by invoice date', () => {
    const sheet = sheetFromCsv(csv);
    const { index } = mapHeaders('SALES', sheet.headers, salesCfg);
    const [row] = validateRows('SALES', sheet, index, salesCfg);
    const res = resolveSalesRow(row!.parsed!, 2, refs);
    expect(res.errors).toEqual([]);
    expect(res.line).toMatchObject({
      customerId: 'cust-1',
      channel: 'EU',
      asId: 'as-1',
      liters: '900.0000',
      litersSource: 'PRODUCT',
      pricelistPrice: '1950.0000',
      pricelistSource: 'PRICELIST',
    });
  });

  it('unknown customer is a row error', () => {
    const res = resolveSalesRow(
      { invoiceNo: 'X', lineNo: 1, invoiceDate: '2026-01-01', customerCode: 'NOPE', productCode: 'P-018', qty: '1', unitPrice: '1', statedTermDays: 30, liters: null, pricelistPrice: null, approvedStandardDiscount: false, invoiceTotal: null, channel: null, asCode: null, ssCode: null, smCode: null },
      7,
      refs,
    );
    expect(res.errors).toEqual([{ rowNo: 7, field: 'customerCode', message: 'Unknown customer code "NOPE"' }]);
  });
});

import { describe, expect, it } from 'vitest';
import { cellToIsoDate } from '../src/zod';
import { D, formatPercent, formatPHP, formatRate, roundMoney } from '../src/money';

describe('money', () => {
  it('refuses JS numbers at runtime', () => {
    // @ts-expect-error numbers are a type error too
    // eslint-disable-next-line no-restricted-syntax -- deliberately testing the runtime guard
    expect(() => D(3.5)).toThrow(/refuses JS number/);
  });

  it('parses Excel cells safely', () => {
    expect(D.fromExcel(0.1)!.plus(D.fromExcel(0.2)!).toFixed(4)).toBe('0.3000');
    expect(D.fromExcel('₱1,234.50')!.toFixed(2)).toBe('1234.50');
    expect(D.fromExcel('(1,000.00)')!.toFixed(2)).toBe('-1000.00');
    expect(D.fromExcel('')).toBeNull();
    expect(D.fromExcel({ result: 12 })!.toFixed(0)).toBe('12');
    expect(() => D.fromExcel('abc')).toThrow();
  });

  it('formats PHP', () => {
    expect(formatPHP(D('1234.5'))).toBe('₱1,234.50');
    expect(formatPHP('-1234567.125')).toBe('-₱1,234,567.13');
    expect(formatPHP('0')).toBe('₱0.00');
  });

  it('formats rates and percents', () => {
    expect(formatRate('3.5')).toBe('3.50');
    expect(formatRate('0.125')).toBe('0.125');
    expect(formatPercent('0.8')).toBe('80%');
  });

  it('rounds half up', () => {
    expect(roundMoney(D('2.345')).toFixed(2)).toBe('2.35');
    expect(roundMoney(D('-2.345')).toFixed(2)).toBe('-2.35');
  });

  it('parses dates', () => {
    expect(cellToIsoDate(new Date(Date.UTC(2026, 0, 31)))).toBe('2026-01-31');
    expect(cellToIsoDate('01/31/2026')).toBe('2026-01-31');
    expect(cellToIsoDate('2026-02-30')).toBeNull();
    expect(cellToIsoDate(46053)).toBe('2026-01-31');
  });
});

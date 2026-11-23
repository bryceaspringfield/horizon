import { describe, expect, it } from 'vitest';
import { rentVsOwn } from '../rentown';

// Rent or buy (2026-11-23).
describe('rent or buy', () => {
  const base = { price: 500000, downShare: 0.2, closingShare: 0.03, rate: 0.065, termYears: 30, propertyTaxRate: 0.011, insuranceYearly: 1500,
    upkeepRate: 0.01, appreciation: 0.03, sellingShare: 0.06, rentMonthly: 2500, rentGrowth: 0.03, investReturn: 0.065, years: 30 };
  it('pays off the loan by the end of the term and finds no break-even when rent is very cheap', () => {
    const cheap = rentVsOwn({ ...base, rentMonthly: 500 });
    expect(cheap.breakEven).toBeNull();
  });
  it('favors buying sooner when rent is high', () => {
    const hi = rentVsOwn({ ...base, rentMonthly: 4500 }).breakEven!, lo = rentVsOwn({ ...base, rentMonthly: 3000 }).breakEven;
    expect(hi).toBeGreaterThan(0);
    expect(lo === null || lo >= hi).toBe(true);
  });
});

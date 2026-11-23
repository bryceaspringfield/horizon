import { describe, expect, it } from 'vitest';
import { ukPerson } from '../uk';

describe('UK tax, 2026 to 2027', () => {
  it('taxes a £50,000 salary as HMRC does', () => {
    // income tax: (50,000 - 12,570) x 20% = 7,486; NI: (50,000 - 12,570) x 8% = 2,994.40
    const r = ukPerson({ earned: 50000, pension: 0, savings: 0, dividends: 0, gains: 0, employment: 50000 });
    expect(r.income).toBeCloseTo(7486, 2);
    expect(r.ni).toBeCloseTo(2994.4, 2);
  });
  it('tapers the personal allowance away by £125,140', () => {
    // no allowance: 37,700 x 20% + (125,140 - 37,700) x 40% + (130,000 - 125,140) x 45%
    const r = ukPerson({ earned: 130000, pension: 0, savings: 0, dividends: 0, gains: 0, employment: 0 });
    expect(r.allowance).toBe(0);
    expect(r.income).toBeCloseTo(37700 * 0.2 + 87440 * 0.4 + 4860 * 0.45, 2);
  });
  it('taxes dividends above the allowance at the ordinary rate', () => {
    const r = ukPerson({ earned: 20000, pension: 0, savings: 0, dividends: 2500, gains: 0, employment: 0 });
    expect(r.income).toBeCloseTo((20000 - 12570) * 0.2 + 2000 * 0.1075, 2);
  });
});

describe('Scotland and the pension lump sum', () => {
  it('taxes a £50,000 Scottish salary on the Scottish bands', () => {
    const r = ukPerson({ earned: 50000, pension: 0, savings: 0, dividends: 0, gains: 0, employment: 0 }, 1, true);
    const above = 50000 - 12570;
    expect(r.income).toBeCloseTo(3967 * 0.19 + (16956 - 3967) * 0.2 + (31092 - 16956) * 0.21 + (above - 31092) * 0.42, 2);
  });
});

import { ukTax } from '../uk';
describe('UK lump sum allowance', () => {
  it('stops the tax-free quarter once the allowance is used', () => {
    const t = { year: 2026, status: 'single', index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 100000, interest: 0, qualifiedDividends: 0, longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0, ukLumpSum: true } as any;
    expect(ukTax({ ...t, ukLumpLeft: 268275 }).ukLumpUsed).toBe(25000);
    expect(ukTax({ ...t, ukLumpLeft: 10000 }).ukLumpUsed).toBe(10000);
    expect(ukTax({ ...t, ukLumpLeft: 0 }).total).toBeGreaterThan(ukTax({ ...t, ukLumpLeft: 268275 }).total);
  });
});

describe('UK savings rates from 2027', () => {
  it('taxes savings 2 points higher from 2027', () => {
    const p = { earned: 50000, pension: 0, savings: 10000, dividends: 0, gains: 0, employment: 0 };
    expect(ukPerson(p, 1, false, 2027).income - ukPerson(p, 1, false, 2026).income).toBeCloseTo(0.02 * (10000 - 500), 2);
  });
});

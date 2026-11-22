import { describe, expect, it } from 'vitest';
import { bracketTax, computeTax, taxableSocialSecurity, stateTax, fica } from '../tax';
import { benefitAtClaim, rmdStartAge } from '../retirement';
import federal from '../../data/federal.json';

const base = { status: 'mfj' as const, index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 0, interest: 0,
  qualifiedDividends: 0, longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0, state: 'TX' };

describe('federal income tax, 2026', () => {
  it('matches Rev. Proc. 2025-32 Table 1 at its thresholds', () => {
    const b = federal.brackets.mfj as [number, number][];
    expect(bracketTax(100800, b)).toBeCloseTo(11600, 2);
    expect(bracketTax(211400, b)).toBeCloseTo(35932, 2);
    expect(bracketTax(768700, b)).toBeCloseTo(206583.5, 2);
  });
  it('taxes $132,200 of joint wages as $100,000 of taxable income', () => {
    const t = computeTax({ ...base, wages: 132200 });
    expect(t.taxableIncome).toBeCloseTo(100000, 2);
    expect(t.federal).toBeCloseTo(2480 + 0.12 * (100000 - 24800), 2);
    expect(t.marginalRate).toBe(0.12);
  });
  it('stacks long-term gains on ordinary income', () => {
    // $50,000 of ordinary taxable income and $100,000 of gains: $48,900 at 0% (up to $98,900), the rest at 15%.
    const t = computeTax({ ...base, otherOrdinary: 50000 + 32200, longTermGains: 100000 });
    expect(t.capitalGains).toBeCloseTo((150000 - 98900) * 0.15, 2);
  });
  it('taxes at most 85% of Social Security', () => {
    expect(taxableSocialSecurity(40000, 0, 'mfj')).toBe(0);
    expect(taxableSocialSecurity(40000, 200000, 'mfj')).toBeCloseTo(34000, 2);
  });
  it('caps Social Security tax at the wage base', () => {
    expect(fica(300000, 0, 'single', 1)).toBeCloseTo(184500 * 0.062 + 300000 * 0.0145 + 100000 * 0.009, 2);
  });
});

describe('state income tax', () => {
  it('is zero in Texas and flat in Illinois', () => {
    expect(stateTax('TX', 100000, 0, 'single', 1)).toBe(0);
    expect(stateTax('IL', 100000, 0, 'single', 1)).toBeGreaterThan(4000);
    expect(stateTax('IL', 100000, 0, 'single', 1)).toBeLessThan(4950);
  });
});

describe('Social Security and RMDs', () => {
  it('reduces a claim at 62 by 30% and raises a claim at 70 by 24%', () => {
    expect(benefitAtClaim(1000, 62)).toBeCloseTo(700, 0);
    expect(benefitAtClaim(1000, 70)).toBeCloseTo(1240, 0);
  });
  it('starts RMDs at 73 or 75 by birth year', () => {
    expect(rmdStartAge(1955)).toBe(73);
    expect(rmdStartAge(1965)).toBe(75);
  });
});

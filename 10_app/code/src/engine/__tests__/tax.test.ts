import { describe, expect, it } from 'vitest';
import { acaNetPremium, bracketTax, computeTax, fica, medicarePremium, rulesFor, saltCap, stateTax, taxableSocialSecurity } from '../tax';
import { benefitAtClaim, rmdStartAge, spousalAtClaim } from '../retirement';

const base = { year: 2026, status: 'mfj' as const, index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 0, interest: 0,
  qualifiedDividends: 0, longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0, state: 'TX' };

describe('federal income tax', () => {
  it('matches Rev. Proc. 2025-32 Table 1 (2026) at its thresholds', () => {
    const b = rulesFor(2026).rules.brackets.mfj;
    expect(bracketTax(100800, b)).toBeCloseTo(11600, 2);
    expect(bracketTax(211400, b)).toBeCloseTo(35932, 2);
    expect(bracketTax(768700, b)).toBeCloseTo(206583.5, 2);
  });
  it('matches Rev. Proc. 2026-35 Table 1 (2027) at its thresholds', () => {
    const b = rulesFor(2027).rules.brackets.mfj;
    expect(bracketTax(104050, b)).toBeCloseTo(11974, 2);
    expect(bracketTax(218250, b)).toBeCloseTo(37098, 2);
    expect(bracketTax(793650, b)).toBeCloseTo(213290.5, 2);
  });
  it('uses the newest table at or before a year', () => {
    expect(rulesFor(2026).year).toBe(2026);
    expect(rulesFor(2040).year).toBe(2027);
    expect(rulesFor(2020).year).toBe(2026);
  });
  it('taxes $132,200 of joint wages in 2026 as $100,000 of taxable income', () => {
    const t = computeTax({ ...base, wages: 132200 });
    expect(t.taxableIncome).toBeCloseTo(100000, 2);
    expect(t.federal).toBeCloseTo(2480 + 0.12 * (100000 - 24800), 2);
  });
  it('stacks long-term gains on ordinary income', () => {
    const t = computeTax({ ...base, otherOrdinary: 50000 + 32200, longTermGains: 100000 });
    expect(t.capitalGains).toBeCloseTo((150000 - 98900) * 0.15, 2);
  });
  it('taxes at most 85% of Social Security', () => {
    expect(taxableSocialSecurity(40000, 0, 'mfj')).toBe(0);
    expect(taxableSocialSecurity(40000, 200000, 'mfj')).toBeCloseTo(34000, 2);
  });
  it('caps Social Security tax at each year\'s wage base', () => {
    expect(fica(300000, 0, 'single', 2026, 1)).toBeCloseTo(184500 * 0.062 + 300000 * 0.0145 + 100000 * 0.009, 2);
    expect(fica(300000, 0, 'single', 2027, 1)).toBeCloseTo(192300 * 0.062 + 300000 * 0.0145 + 100000 * 0.009, 2);
  });
});

describe('itemized deductions and the SALT cap', () => {
  it('caps state and local taxes at $40,400 in 2026, down to $10,000 for high incomes and from 2030', () => {
    expect(saltCap(2026, 300000)).toBe(40400);
    expect(saltCap(2026, 605000)).toBe(10400);
    expect(saltCap(2026, 900000)).toBe(10000);
    expect(saltCap(2030, 100000)).toBe(10000);
  });
  it('itemizes only when it beats the standard deduction', () => {
    const low = computeTax({ ...base, wages: 200000, itemize: true, itemizedOther: 5000, propertyTax: 3000 });
    expect(low.itemized).toBe(false);
    const high = computeTax({ ...base, wages: 400000, state: 'CA', itemize: true, itemizedOther: 25000, propertyTax: 12000 });
    expect(high.itemized).toBe(true);
    expect(high.deduction).toBeCloseTo(25000 + 40400, 0);
  });
});

describe('health premiums', () => {
  it('charges the 2026 Part B premium with no surcharge at low income', () => {
    expect(medicarePremium(2026, 100000, 'single', 0, 1, 1)).toBeCloseTo(202.9 * 12, 2);
  });
  it('adds the top IRMAA tier above $750,000 joint (2027 table)', () => {
    expect(medicarePremium(2027, 800000, 'mfj', 0, 1, 1)).toBeCloseTo((209.4 + 502.4 + 96.4) * 12, 2);
  });
  it('limits the ACA premium to 9.96% of income at 350% of the poverty line in 2026, and gives no credit above 400%', () => {
    const magi = 3.5 * 21150;
    expect(acaNetPremium(2026, magi, 2, 2, 12000, 1)).toBeCloseTo(magi * 0.0996, 2);
    expect(acaNetPremium(2026, 4.1 * 21150, 2, 2, 12000, 1)).toBe(24000);
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
  it('pays a spouse half the partner\'s PIA at 67 and 32.5% at 62', () => {
    expect(spousalAtClaim(3000, 67)).toBeCloseTo(1500, 0);
    expect(spousalAtClaim(3000, 62)).toBeCloseTo(975, 0);
  });
  it('starts RMDs at 73 or 75 by birth year', () => {
    expect(rmdStartAge(1955)).toBe(73);
    expect(rmdStartAge(1965)).toBe(75);
  });
});

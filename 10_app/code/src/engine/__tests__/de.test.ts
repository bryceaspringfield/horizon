import { describe, expect, it } from 'vitest';
import { deSoli, deTariff } from '../de';

describe('German income tax, 2026', () => {
  it('follows the § 32a tariff', () => {
    expect(deTariff(12348)).toBe(0);
    expect(deTariff(50000)).toBe(10548);
    expect(deTariff(100000)).toBe(Math.floor(0.42 * 100000 - 11135.63));
    expect(deTariff(300000)).toBe(Math.floor(0.45 * 300000 - 19470.38));
  });
  it('charges the solidarity surcharge only above the threshold, phased in', () => {
    expect(deSoli(20000, false)).toBe(0);
    expect(deSoli(21000, false)).toBeCloseTo(0.119 * 650, 2);
    expect(deSoli(60000, false)).toBeCloseTo(0.055 * 60000, 2);
  });
});

import { deTax } from '../de';
describe('church tax', () => {
  it('adds 9% of income tax and lowers the flat rate on investment income', () => {
    const base = { year: 2026, status: 'single', index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 60000, interest: 11000, qualifiedDividends: 0, longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0 } as any;
    const without = deTax(base), withChurch = deTax({ ...base, deChurch: 0.09 });
    expect(withChurch.capitalGains).toBeCloseTo(10000 * (0.25 / 1.0225) * (1.055 + 0.09), 2);
    // no wages, so the taxable income is the 60,000 of other income: church tax is 9% of its tariff
    expect(withChurch.federal - without.federal).toBeCloseTo(0.09 * deTariff(60000), 2);
  });
});

describe('pension allowance', () => {
  it('takes € 102 off a statutory pension before tax', () => {
    const base = { year: 2026, status: 'single', index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 0, interest: 0, qualifiedDividends: 0, longTermGains: 0, socialSecurity: 30000, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 1 } as any;
    expect(deTax(base).taxableIncome).toBeCloseTo(0.84 * 30000 - 102, 6);
  });
});

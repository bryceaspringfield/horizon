// ProjectionLab features added in batch 2: a home sale's gain and exclusion, the mortgage debt limit, Medigap, a benefit
// COLA modifier, the qualified share of dividends, gifts out of the plan, bonus income, the self-employed health
// deduction, solo 401(k) and SEP contributions, and the dependent care credit.
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';
import { computeTax } from '../tax';
import type { Plan } from '../types';

const single = (): Plan => {
  const p = examplePlan(2026);
  p.people = [p.people[0]]; p.assumptions.filingStatus = 'single'; p.assumptions.state = 'TX';
  p.accounts = p.accounts.filter((a) => a.ownerId === 'p1' && a.kind !== 'asset' && a.kind !== 'debt');
  p.socialSecurity = [p.socialSecurity[0]]; p.incomes = [p.incomes[0]]; p.deductions = { itemize: false, propertyTaxRate: 0, charity: 0 };
  p.strategy.rothConversionBracket = 0; p.strategy.harvestZeroGains = false; p.assumptions.dividendYield = 0;
  return p;
};
const year = (p: Plan, y: number) => simulate(structuredClone(p)).years.find((r) => r.year === y)!;

describe('ProjectionLab features, batch 2', () => {
  it('a home sale taxes the gain above the exclusion, after selling costs', () => {
    const p = single();
    const home = { id: 'home', name: 'Home', kind: 'asset' as const, ownerId: 'p1', balance: 900000, allocation: { stocks: 0, bonds: 0, cash: 0 }, appreciation: 0, realEstate: true, saleYear: 2026 };
    p.accounts.push({ ...home, costBasis: 300000, sellingCosts: 0.06, primaryResidence: true });
    const sold = year(p, 2026);
    // gain: 900,000 less 6% costs less 300,000 = 546,000; a single owner excludes 250,000
    expect(sold.taxes.assetGain).toBeCloseTo(546000);
    expect(sold.taxes.homeExclusion).toBe(250000);
    expect(sold.taxes.capitalGains).toBeGreaterThan(40000);
    p.accounts[p.accounts.length - 1] = { ...home, costBasis: 300000, sellingCosts: 0.06 };
    expect(year(p, 2026).taxes.capitalGains).toBeGreaterThan(sold.taxes.capitalGains + 30000);
    p.accounts[p.accounts.length - 1] = home;
    expect(year(p, 2026).taxes.assetGain).toBeUndefined();
  });

  it('mortgage interest counts on the first $750,000 of home debt where the limit is on', () => {
    const p = single();
    p.accounts.push({ id: 'home', name: 'Home', kind: 'asset', ownerId: 'p1', balance: 2000000, allocation: { stocks: 0, bonds: 0, cash: 0 }, appreciation: 0, realEstate: true });
    p.accounts.push({ id: 'mort', name: 'Mortgage', kind: 'debt', ownerId: 'p1', balance: 1500000, allocation: { stocks: 0, bonds: 0, cash: 0 }, interestRate: 0.06, payment: 108000, securedBy: 'home' });
    p.incomes[0].amount = 500000; p.deductions = { itemize: true, propertyTaxRate: 0, charity: 0 };
    const full = year(p, 2026).taxes.deduction;
    p.deductions.mortgageDebtLimit = 750000;
    // half the interest is left out: the debt is twice the limit (interest runs on the balance after the year's payment)
    const cut = full - year(p, 2026).taxes.deduction;
    expect(cut).toBeGreaterThan(43000);
    expect(cut).toBeLessThan(45100);
  });

  it('Medigap adds its premium from 65, and a benefit COLA modifier bends Social Security', () => {
    const p = single();
    const at = p.people[0].birthYear + 70;
    const base = year(p, at);
    p.healthcare.medigap = 200;
    expect(year(p, at).taxes.medicare).toBeGreaterThan(base.taxes.medicare + 2400);
    p.healthcare.medigap = undefined; p.assumptions.benefitCola = -0.01;
    expect(year(p, at).socialSecurity / base.socialSecurity).toBeCloseTo(Math.pow(0.99, at - 2026), 4);
  });

  it('the qualified share splits dividends between gains rates and ordinary income', () => {
    const base = { year: 2026, status: 'single' as const, index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 0, interest: 0, qualifiedDividends: 0,
      longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0, state: 'TX' };
    expect(computeTax({ ...base, wages: 100000, interest: 10000 }).total).toBeGreaterThan(computeTax({ ...base, wages: 100000, qualifiedDividends: 10000 }).total);
    const p = single(); p.assumptions.dividendYield = 0.03; p.accounts.find((a) => a.id === 'a_brok')!.balance = 1000000;
    const all = year(p, 2026).taxes.total;
    p.assumptions.qualifiedDividendShare = 0.5;
    expect(year(p, 2026).taxes.total).toBeGreaterThan(all + 500);
  });

  it('a transfer out of the plan is a gift: the money leaves, and a traditional withdrawal is taxed', () => {
    const p = single();
    p.strategy.transfers = [{ id: 't', name: 'Gift', from: 'a_cash', to: 'external', amount: 10000, startYear: 2026, endYear: 2026 }];
    const y = year(p, 2026);
    expect(y.expenses.__gifts).toBeCloseTo(10000);
    expect(y.transfers).toBeCloseTo(10000);
  });

  it('a bonus is taxed as wages, with payroll tax', () => {
    const p = single();
    const before = year(p, 2026).taxes.fica;
    p.incomes.push({ id: 'b', name: 'Bonus', kind: 'bonus', ownerId: 'p1', amount: 20000, growth: 0, startYear: 2026, endYear: 2026, inflationAdjusted: true, taxable: true });
    expect(year(p, 2026).taxes.fica - before).toBeCloseTo(20000 * 0.0765, 0);
  });

  it('self-employment: the health premium and solo 401(k) or SEP contributions come off taxable income', () => {
    const p = single();
    p.incomes = [{ id: 'se', name: 'Consulting', kind: 'selfEmployment', ownerId: 'p1', amount: 150000, growth: 0, startYear: 2026, inflationAdjusted: true, taxable: true }];
    p.strategy.rothIraContribution = 0; p.strategy.hsaContribution = 0;
    const plain = year(p, 2026);
    p.incomes[0].healthPremium = 12000;
    const health = year(p, 2026);
    expect(plain.taxes.taxableIncome - health.taxes.taxableIncome).toBeGreaterThan(9000);
    p.incomes[0].contributionRate = 0.1; p.incomes[0].employerContributionRate = 0.2;
    const solo = year(p, 2026);
    // a deferral of 15,000 and an employer contribution of 30,000 reach the traditional account
    expect(solo.contributions.a_401k).toBeCloseTo(45000);
    expect(health.taxes.taxableIncome - solo.taxes.taxableIncome).toBeGreaterThan(35000);
    expect(solo.taxes.fica).toBeCloseTo(plain.taxes.fica);
  });

  it('the dependent care credit is 20% of childcare costs, up to $3,000 for one child and $6,000 for two', () => {
    const base = { year: 2026, status: 'mfj' as const, index: 1, wages: 150000, selfEmployment: 0, otherOrdinary: 0, interest: 0, qualifiedDividends: 0,
      longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0, state: 'TX' };
    const none = computeTax(base).total;
    expect(none - computeTax({ ...base, dependentCare: 10000, childrenUnder13: 1 }).total).toBeCloseTo(600);
    expect(none - computeTax({ ...base, dependentCare: 10000, childrenUnder13: 2 }).total).toBeCloseTo(1200);
    expect(none - computeTax({ ...base, dependentCare: 2000, childrenUnder13: 2 }).total).toBeCloseTo(400);
    expect(computeTax({ ...base, dependentCare: 10000 }).total).toBe(none);
  });
});

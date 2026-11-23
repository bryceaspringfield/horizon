// Requests from ProjectionLab's board, first batch: RSU cliffs, bonuses, the 401(k) Roth split, inflation-linked
// accounts, a later withdrawal order, and capital loss carryforward.
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { meanPath, simulate } from '../simulate';
import type { Plan } from '../types';

const single = (): Plan => {
  const p = examplePlan(2026);
  p.people = [p.people[0]]; p.assumptions.filingStatus = 'single'; p.assumptions.state = 'TX';
  p.accounts = p.accounts.filter((a) => a.ownerId === 'p1' && a.kind !== 'asset' && a.kind !== 'debt');
  p.socialSecurity = [p.socialSecurity[0]]; p.incomes = [p.incomes[0]]; p.deductions = { itemize: false, propertyTaxRate: 0, charity: 0 };
  p.strategy.rothConversionBracket = 0; p.strategy.harvestZeroGains = false;
  return p;
};

describe('requests from the board, batch 1', () => {
  it('an RSU grant with a one-year cliff vests nothing, then two parts, then one a year', () => {
    const p = single();
    p.incomes.push({ id: 'rsu', name: 'Grant', kind: 'rsu', ownerId: 'p1', amount: 80000, growth: 0, startYear: 2026, inflationAdjusted: false, taxable: true, vestYears: 4, vestCliffYears: 1, nominal: true });
    const y = simulate(p).years;
    expect([0, 1, 2, 3, 4].map((i) => Math.round(y[i].income.rsu ?? 0))).toEqual([0, 40000, 20000, 20000, 0]);
    delete p.incomes[1].vestCliffYears;
    expect([0, 1, 2, 3].map((i) => Math.round(simulate(p).years[i].income.rsu))).toEqual([20000, 20000, 20000, 20000]);
  });

  it('a bonus adds its share of the salary to pay', () => {
    const p = single();
    const base = simulate(structuredClone(p)).years[0].income.i_sal1;
    p.incomes[0].bonusRate = 0.15;
    expect(simulate(p).years[0].income.i_sal1).toBeCloseTo(base * 1.15);
  });

  it('a 401(k) contribution splits between the pre-tax and the Roth side', () => {
    const p = single();
    p.incomes[0].contributionRate = 0.1; p.incomes[0].employerMatch = 0; p.strategy.rothIraContribution = 0;
    p.incomes[0].contributionRothShare = 0.25;
    const y = simulate(p).years[0];
    expect(y.contributions.a_401k).toBeCloseTo(9000);
    expect(y.contributions.a_roth).toBeCloseTo(3000);
    const all = single(); all.incomes[0].contributionRate = 0.1; all.incomes[0].employerMatch = 0; all.strategy.rothIraContribution = 0;
    expect(simulate(all).years[0].taxes.taxableIncome - y.taxes.taxableIncome).toBeCloseTo(-3000);
  });

  it('an inflation-linked account earns inflation plus its fixed rate', () => {
    const p = single();
    p.accounts.push({ id: 'ibond', name: 'I bonds', kind: 'taxable', ownerId: 'p1', balance: 10000, costBasis: 10000, allocation: { stocks: 0, bonds: 0, cash: 0 }, inflationLinked: 0.012 });
    const y = simulate(p).years;
    const infl = meanPath(p).inflation[0];
    expect(y[1].balances.ibond / y[0].balances.ibond).toBeCloseTo(1 + infl + 0.012, 3);
  });

  it('the withdrawal order changes from the chosen year', () => {
    const p = single();
    p.strategy.retirementAge = { p1: 36 }; p.strategy.cashTarget = 0;
    p.accounts.find((a) => a.id === 'a_cash')!.balance = 0;
    p.accounts.find((a) => a.id === 'a_brok')!.balance = 3000000; p.accounts.find((a) => a.id === 'a_roth')!.balance = 3000000;
    p.strategy.withdrawalOrder = ['cash', 'taxable', 'traditional', 'roth', 'hsa'];
    p.strategy.withdrawalOrderLater = { year: 2035, order: ['cash', 'roth', 'taxable', 'traditional', 'hsa'] };
    const y = simulate(p).years;
    const at = (yr: number) => y.find((r) => r.year === yr)!.withdrawals;
    expect(at(2030).a_brok ?? 0).toBeGreaterThan(10000);
    expect(at(2030).a_roth ?? 0).toBe(0);
    expect(at(2036).a_roth ?? 0).toBeGreaterThan(10000);
    expect(at(2036).a_brok ?? 0).toBe(0);
  });

  it('a capital loss offsets $3,000 of income a year and the rest carries forward', () => {
    const p = single();
    p.strategy.retirementAge = { p1: 36 }; p.strategy.cashTarget = 0;
    p.accounts = p.accounts.filter((a) => a.id === 'a_cash' || a.id === 'a_brok');
    p.accounts.find((a) => a.id === 'a_cash')!.balance = 0;
    const brok = p.accounts.find((a) => a.id === 'a_brok')!;
    brok.balance = 2000000; brok.costBasis = 2600000; brok.allocation = { stocks: 0, bonds: 0, cash: 1 };
    p.incomes = [{ id: 'pen', name: 'Pension', kind: 'pension', ownerId: 'p1', amount: 30000, growth: 0, startYear: 2026, inflationAdjusted: true, taxable: true }];
    p.assumptions.dividendYield = 0;
    const withLoss = simulate(structuredClone(p)).years[1];
    brok.costBasis = 2000000;
    const even = simulate(structuredClone(p)).years[1];
    // sold at a loss: no gains tax, and $3,000 less ordinary income than the same sale at cost
    expect(withLoss.taxes.capitalGains).toBe(0);
    // (the two plans draw slightly different amounts, since their taxes differ)
    const less = even.taxes.ordinaryTaxable! - withLoss.taxes.ordinaryTaxable!;
    expect(less).toBeGreaterThan(2900);
    expect(less).toBeLessThan(3001);
  });
});

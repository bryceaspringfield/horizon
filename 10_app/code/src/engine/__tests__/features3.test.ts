import { describe, expect, it } from 'vitest';
import { examplePlan as example } from '../defaults';

// these tests check mechanics on flat assumptions: the horizon bands (engine/assumptions.ts) are left out
const examplePlan = (...args: Parameters<typeof example>) => { const p = example(...args); delete p.assumptions.horizons; return p; };
import { simulate } from '../simulate';
import { computeTax } from '../tax';
import type { Plan } from '../types';

const base = () => examplePlan(2026);
const run = (p: Plan) => simulate(structuredClone(p));
const at = (p: Plan, year: number) => run(p).years.find((y) => y.year === year)!;
const tax0 = { year: 2026, status: 'single' as const, index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 0, interest: 0,
  qualifiedDividends: 0, longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0, state: 'TX' };

describe('accounts', () => {
  it('grows an account at its own return in place of the market mix', () => {
    const p = base();
    p.accounts.find((a) => a.id === 'a_roth')!.customReturn = 0.02;
    const y = run(p).years[0];
    expect(y.balances.a_roth).toBeCloseTo((40000 + (y.contributions.a_roth ?? 0)) * 1.02, 0);
  });
  it('pays a taxable account\'s dividends out as income without reinvesting them', () => {
    const p = base();
    // A second brokerage account, which surplus pay (sent to the first) never reaches.
    p.accounts.push({ id: 't2', name: 'Dividend fund', kind: 'taxable', ownerId: 'p1', balance: 100000, costBasis: 100000, allocation: { stocks: 1, bonds: 0, cash: 0 }, dividendsPaidOut: true });
    const y = at(p, 2026);
    const paid = 100000 * p.assumptions.dividendYield;
    expect(y.income.div_t2).toBeCloseTo(paid, 0);
    expect(y.balances.t2).toBeCloseTo(100000 * (1 + p.assumptions.returns.stocks) - paid, 0);
  });
  it('taxes HSA money spent outside healthcare, with 20% more before 65', () => {
    const p = base();
    p.strategy.withdrawalOrder = ['hsa', 'cash', 'taxable', 'traditional', 'roth'];
    p.incomes = [];
    p.accounts = p.accounts.filter((a) => a.id !== 'a_mort');
    p.expenses = [{ id: 'e', name: 'Living', kind: 'living', amount: 5000, startYear: 2026, growth: 0 }];
    const y = at(p, 2026);
    expect(computeTax({ ...tax0, otherOrdinary: 10000, hsaPenaltyBase: 10000 }).penalty).toBeCloseTo(2000, 6);
    expect(y.withdrawals.a_hsa).toBeGreaterThan(0);
    expect(y.taxes.penalty).toBeCloseTo(y.withdrawals.a_hsa * 0.2, 0);
  });
});

describe('transfers and gifts', () => {
  it('moves money on a schedule, a traditional-to-Roth move counting as a conversion', () => {
    const p = base();
    p.strategy.transfers = [{ id: 't', name: 'Convert', from: 'a_401k', to: 'a_roth', amount: 10000, startYear: 2027, endYear: 2028 }];
    const y = at(p, 2027);
    expect(y.transfers).toBeCloseTo(10000 * (1 + p.assumptions.inflation), -1);
    expect(y.rothConversion).toBeGreaterThanOrEqual(y.transfers! - 1);
    expect(at(p, 2029).transfers).toBe(0);
  });
  it('pays charity from the IRA after 71 as a QCD, counted in the RMD and left out of income', () => {
    const p = base();
    p.deductions.charity = 20000;
    p.strategy.qcd = true;
    const q = structuredClone(p);
    q.strategy.qcd = false;
    const year = p.people[0].birthYear + 71;
    const a = at(p, year), b = at(q, year);
    expect(a.qcd).toBeCloseTo(20000 * Math.pow(1 + p.assumptions.inflation, year - 2026), -1);
    expect(a.taxes.taxableIncome).toBeLessThan(b.taxes.taxableIncome);
  });
});

describe('taxes', () => {
  it('takes the 20% QBI deduction below the threshold, and none above the phase-in range', () => {
    const low = computeTax({ ...tax0, selfEmployment: 100000 });
    // 20% of business income less half its tax, capped at 20% of taxable income before the deduction.
    const se = 100000 * 0.9235 * 0.062;
    expect(low.qbi).toBeCloseTo(Math.min(0.2 * (100000 - se), 0.2 * (100000 - se - 16100)), 2);
    const high = computeTax({ ...tax0, selfEmployment: 400000 });
    expect(high.qbi).toBe(400);
  });
  it('uses one flat rate on all income in the flat tax model', () => {
    const t = computeTax({ ...tax0, wages: 100000, longTermGains: 20000, flatRate: 0.25 });
    expect(t.total).toBeCloseTo(30000, 0);
    expect(t.fica).toBe(0);
  });
});

describe('amounts over time', () => {
  it('changes an expense from a year on', () => {
    const p = base();
    p.expenses.find((e) => e.id === 'e_living')!.steps = [{ year: 2030, amount: 50000 }];
    const ys = run(p).years;
    const k = ys.find((y) => y.year === 2030)!.expenses.e_living / ys.find((y) => y.year === 2029)!.expenses.e_living;
    expect(k).toBeCloseTo((50000 / 70000) * 1.025, 2);
  });
  it('reads a future-dollar amount as that year\'s dollars', () => {
    const p = base();
    p.expenses.push({ id: 'e_n', name: 'Boat', kind: 'oneTime', amount: 30000, startYear: 2036, growth: 0, nominal: true });
    expect(at(p, 2036).expenses.e_n).toBeCloseTo(30000, 0);
  });
});

describe('household and metrics', () => {
  it('takes the leaving partner out of the plan at a separation', () => {
    const p = base();
    p.events = [{ id: 's', kind: 'separation', name: 'Divorce', year: 2030, personId: 'p2', keepShare: 0.5, expenseFactor: 0.6, support: 0, supportYears: 0 }];
    const before = at(p, 2029), after = at(p, 2030);
    expect(before.income.i_sal2).toBeGreaterThan(0);
    expect(after.income.i_sal2).toBeUndefined();
    expect(after.balances.a_401k2).toBeLessThan(before.balances.a_401k2 * 0.6);
    expect(after.expenses.e_living).toBeLessThan(before.expenses.e_living * 0.65);
  });
  it('reaches financial independence no later when real assets count', () => {
    const p = base();
    const q = structuredClone(p);
    q.strategy.fiCountsRealAssets = true;
    const a = run(p).financialIndependenceYear, b = run(q).financialIndependenceYear;
    expect(b).not.toBeNull();
    expect(b!).toBeLessThanOrEqual(a ?? 9999);
    expect(run(p).years[0].financialNetWorth).toBeLessThan(run(p).years[0].netWorth);
  });
});

import { describe, expect, it } from 'vitest';
import { examplePlan as example } from '../defaults';

// these tests check mechanics on flat assumptions: the horizon bands (engine/assumptions.ts) are left out
const examplePlan = (...args: Parameters<typeof example>) => { const p = example(...args); delete p.assumptions.horizons; return p; };
import { simulate } from '../simulate';
import { runMonteCarlo } from '../montecarlo';

describe('the example plan', () => {
  const plan = examplePlan(2026);
  const p = simulate(structuredClone(plan));
  it('runs every year to the last death', () => {
    expect(p.years[0].year).toBe(2026);
    expect(p.years[p.years.length - 1].year).toBe(plan.people[1].birthYear + plan.people[1].lifeExpectancy);
  });
  it('balances each year: no negative liquid account', () => {
    for (const y of p.years) for (const [id, v] of Object.entries(y.balances)) {
      const kind = plan.accounts.find((a) => a.id === id)?.kind;
      if (kind !== 'debt') expect(v).toBeGreaterThan(-1);
    }
  });
  it('takes RMDs from 75 for people born after 1959', () => {
    const at75 = p.years.find((y) => y.ages.p1 === 75)!;
    expect(at75.rmd).toBeGreaterThan(0);
    expect(p.years.find((y) => y.ages.p1 === 74 && y.ages.p2 < 75)!.rmd).toBe(0);
  });
  it('pays off the mortgage', () => {
    const late = p.years.find((y) => y.year === 2060)!;
    expect(late.balances.a_mort).toBeCloseTo(0, 0);
  });
  it('gives a Monte Carlo success rate between 0 and 1', () => {
    const mc = runMonteCarlo(plan, 'normal', 200);
    expect(mc.successRate).toBeGreaterThanOrEqual(0);
    expect(mc.successRate).toBeLessThanOrEqual(1);
    const bt = runMonteCarlo(plan, 'backtest');
    expect(bt.trials).toBe(98);
  });
});

describe('cash flow balance', () => {
  it('matches money in with money out in a working year', () => {
    const plan = examplePlan(2026);
    const y = simulate(structuredClone(plan)).years[0];
    const inflow = Object.values(y.income).reduce((t, v) => t + v, 0) + y.socialSecurity + y.employerMatch
      + Object.values(y.withdrawals).reduce((t, v) => t + v, 0);
    const outflow = y.totalExpenses + y.taxes.total + Object.values(y.contributions).reduce((t, v) => t + v, 0);
    expect(Math.abs(inflow - outflow)).toBeLessThan(1);
  });
});

describe('the new plan features', () => {
  const plan = examplePlan(2026);
  it('shares one 401(k) limit between two salaries of one person', () => {
    const p = structuredClone(plan);
    p.incomes.push({ ...p.incomes[0], id: 'i_side', name: 'Second job', amount: 100000, contributionRate: 0.3 });
    p.incomes[0].contributionRate = 0.3;
    const y = simulate(p).years[0];
    const own = y.contributions.a_401k - y.employerMatch * 0; // employer match lands in the same account
    expect(own).toBeLessThanOrEqual(24500 + 120000 * 0.05 + 100000 * 0.05 + 1);
  });
  it('charges Medicare from 65 and ACA premiums between retirement and 65', () => {
    const years = simulate(structuredClone(plan)).years;
    const at66 = years.find((y) => y.ages.p1 === 66)!;
    expect(at66.taxes.medicare).toBeGreaterThan(0);
    const at61 = years.find((y) => y.ages.p1 === 61)!;
    expect(at61.taxes.aca).toBeGreaterThan(0);
    expect(years[0].taxes.aca).toBe(0);
  });
  it('withdraws in proportion to balances when asked', () => {
    const p = structuredClone(plan);
    p.strategy.withdrawalMethod = 'proportional';
    const years = simulate(p).years;
    const r = years.find((y) => y.ages.p1 === 62)!;
    expect((r.withdrawals.a_roth ?? 0) > 0 && (r.withdrawals.a_401k ?? 0) > 0).toBe(true);
  });
  it('opens a plan saved before these features', async () => {
    const { upgradePlan } = await import('../defaults');
    const old = structuredClone(plan) as unknown as Record<string, unknown>;
    delete old.deductions; delete old.healthcare;
    const up = upgradePlan(old as never);
    expect(simulate(up).years.length).toBeGreaterThan(50);
  });
});

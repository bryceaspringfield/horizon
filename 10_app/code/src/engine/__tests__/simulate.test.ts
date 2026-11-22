import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
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

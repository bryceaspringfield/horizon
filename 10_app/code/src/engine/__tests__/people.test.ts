import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';

// A plan holds any number of people (Bryce, 2026-11-23): the first two are the couple, and a third person's own
// Social Security adds to the household's income.
describe('more than two people', () => {
  it('simulates a third person and adds the third person\'s Social Security', () => {
    const plan = examplePlan();
    const base = simulate(plan);
    const p3 = { id: 'p3', name: 'Parent', birthYear: plan.startYear - 70, lifeExpectancy: 95 };
    plan.people.push(p3);
    plan.socialSecurity.push({ ownerId: 'p3', pia: 1500, claimAge: 67 });
    const r = simulate(plan);
    expect(r.years.length).toBeGreaterThan(0);
    const y0 = r.years[0], b0 = base.years[0];
    expect(y0.ages.p3).toBe(70);
    expect(y0.socialSecurity - b0.socialSecurity).toBeGreaterThan(1500 * 12 * 0.9);
  });
});

describe('credit card cash back', () => {
  it('credits the card\'s rate on its share of spending, untaxed', () => {
    const plan = examplePlan();
    const base = simulate(plan).years[0];
    plan.accounts.push({ id: 'card', name: 'Visa', kind: 'debt', ownerId: plan.people[0].id, balance: 0, allocation: { stocks: 0, bonds: 0, cash: 0 },
      cardSpendShare: 0.5, cashBackRate: 0.02 });
    const y = simulate(plan).years[0];
    const spend = plan.expenses.reduce((t, e) => t + (base.expenses[e.id] ?? 0), 0);
    expect(y.income.cb_card).toBeCloseTo(spend * 0.5 * 0.02, 0);
    expect(y.income.cb_card).toBeGreaterThan(0);
  });
});

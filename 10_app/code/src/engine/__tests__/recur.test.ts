import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';

describe('expense recurrence', () => {
  it('charges an expense only every N years from its start', () => {
    const plan = examplePlan();
    plan.expenses.push({ id: 'car', name: 'Car', kind: 'other', amount: 30000, startYear: (plan.startYear + 1), growth: 0, everyYears: 8 });
    const r = simulate(plan);
    const at = (y: number) => r.years.find((x) => x.year === y)?.expenses.car ?? 0;
    expect(at((plan.startYear + 1))).toBeGreaterThan(0);
    expect(at(plan.startYear + 2)).toBe(0);
    expect(at(plan.startYear + 9)).toBeGreaterThan(0);
  });
});

describe('municipal bonds', () => {
  it('lowers the tax on a taxable account of bonds', () => {
    const plan = examplePlan();
    plan.accounts.push({ id: 'muni', name: 'Bonds', kind: 'taxable', ownerId: plan.people[0].id, balance: 2000000, costBasis: 2000000, allocation: { stocks: 0, bonds: 1, cash: 0 } } as any);
    const base = simulate(plan).years[0].taxes.total;
    plan.accounts.find((x) => x.id === 'muni')!.municipalShare = 1;
    expect(simulate(plan).years[0].taxes.total).toBeLessThan(base);
  });
});

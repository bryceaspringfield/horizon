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

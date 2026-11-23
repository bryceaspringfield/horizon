import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { expandEvents, rothSplit } from '../simulate';

// Roth or traditional each year (Bryce, 2026-11-23): Roth while the year's marginal rate is at or below the expected
// retirement rate, traditional above it.
describe('automatic Roth split', () => {
  it('goes traditional in a high-paid year and Roth in a low-paid one', () => {
    const plan = examplePlan();
    plan.strategy.autoRoth = true;
    const inc = plan.incomes.find((i) => i.kind === 'salary')!;
    inc.amount = 30000; inc.growth = 0;
    inc.steps = [{ year: plan.startYear + 3, amount: 400000 }];
    const split = rothSplit(expandEvents(structuredClone(plan)));
    expect(split[plan.startYear]).toBe(1);
    expect(split[plan.startYear + 4]).toBe(0);
  });
});

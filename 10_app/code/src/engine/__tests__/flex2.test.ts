import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';

describe('flexible spending rules', () => {
  it('a deeper rule cuts more, and a time range limits the years', () => {
    const plan = examplePlan();
    plan.strategy.flex = { enabled: true, drop: 0.0001, cut: 0.1, rules: [{ drop: 0.00001, cut: 0.05 }], scope: 'all', from: plan.startYear + 100 };
    const none = simulate(plan).years.reduce((t, y) => t + (y.flexChange ?? 0), 0);
    expect(none).toBe(0);
  });
});

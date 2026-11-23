import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';

// Per-account withdrawal and liquidity rules (ProjectionLab parity, 2026-11-23).
describe('account withdrawal rules', () => {
  it('never draws from an account kept whole, and leaves it out of liquid assets', () => {
    const plan = examplePlan();
    const acc = plan.accounts.find((a) => a.kind === 'taxable')!;
    acc.withdrawRule = 'never'; acc.liquidFrom = 'never';
    const r = simulate(plan);
    expect(r.years.every((y) => !(y.withdrawals?.[acc.id] > 0))).toBe(true);
    const base = simulate(examplePlan()).years[0];
    expect(r.years[0].liquidNetWorth).toBeLessThan(base.liquidNetWorth);
  });
});

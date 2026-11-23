import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { strategyImpact, withoutStrategy } from '../impact';

describe('strategy impact', () => {
  it('turns the focused strategy off and measures the difference', () => {
    const plan = examplePlan();
    plan.strategy.harvestZeroGains = true;
    expect(withoutStrategy(plan, 'harvest').strategy.harvestZeroGains).toBe(false);
    const r = strategyImpact(plan, 'harvest');
    expect(r.moreTaxes).toBeCloseTo(r.on.taxes - r.off.taxes, 6);
    expect(Number.isFinite(r.moreLegacy)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { netLegacy } from '../estate';
import { simulate } from '../simulate';

describe('estate settlement costs', () => {
  it('takes administration, liquidation, and gains tax without a stepped-up basis off the legacy', () => {
    const plan = examplePlan();
    const base = netLegacy(plan, simulate(plan));
    plan.estate = { ...(plan.estate ?? { heirsTaxRate: 0.24, exemption: 15000000 }), adminShare: 0.01, liquidationShare: 0.06, steppedUp: false, gainsRate: 0.15 };
    const r = netLegacy(plan, simulate(plan));
    expect(r.admin).toBeCloseTo(0.01 * Math.max(0, r.grossEstate), 2);
    expect(r.netLegacy).toBeCloseTo(base.netLegacy - r.admin - r.liquidation - r.gainsTax, 2);
  });
});

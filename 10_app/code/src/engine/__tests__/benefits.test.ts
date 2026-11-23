import { describe, expect, it } from 'vitest';
import { applyMit } from '../benefits';
import type { Income } from '../types';

describe('MIT benefits preset', () => {
  it('fills the premium, paychecks, HSA deposit, and match from the 2026 tables', () => {
    const inc = { id: 's', name: 'MIT', kind: 'salary', ownerId: 'p', amount: 100000, growth: 0, startYear: 2026, inflationAdjusted: true, taxable: true } as Income;
    const r = applyMit(inc, 'staff', 'hdhp', 'family');
    expect(r.paychecks).toBe(24);
    expect(r.deductions).toEqual([{ name: 'MIT medical: BCBS High Deductible Health Plan', amount: 306, per: 'paycheck', treatment: 'all' }]);
    expect(r.employerHsa).toBe(1000);
    expect([r.employerMatch, r.matchLimit]).toEqual([1, 0.05]);
    expect(applyMit(r, 'staff', 'ppo', 'employee').deductions).toHaveLength(1);
  });
});

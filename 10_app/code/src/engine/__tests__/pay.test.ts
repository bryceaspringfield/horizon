import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { expandEvents, simulate } from '../simulate';

// Paycheck deductions, dated raises, and a salary frozen until a year (Bryce, 2026-11-23).
const run = (plan: ReturnType<typeof examplePlan>) => simulate(expandEvents(structuredClone(plan))).years;

describe('pay', () => {
  it('takes a pre-tax health premium from pay and lowers income and payroll tax', () => {
    const plan = examplePlan();
    const inc = plan.incomes.find((i) => i.kind === 'salary')!;
    const base = run(plan)[0];
    inc.deductions = [{ name: 'Health', amount: 200, per: 'paycheck', treatment: 'all' }];
    inc.paychecks = 26;
    const y = run(plan)[0];
    expect(y.expenses['ded_' + inc.id + '_0']).toBeCloseTo(5200, 0);
    expect(y.taxes.fica).toBeLessThan(base.taxes.fica);
    expect(y.taxes.federal).toBeLessThan(base.taxes.federal);
  });
  it('leaves payroll tax alone for a deduction excluded from income tax only', () => {
    const plan = examplePlan();
    const inc = plan.incomes.find((i) => i.kind === 'salary')!;
    const base = run(plan)[0];
    inc.deductions = [{ name: 'Plan', amount: 3000, per: 'year', treatment: 'incomeTax' }];
    const y = run(plan)[0];
    expect(y.taxes.fica).toBeCloseTo(base.taxes.fica, 0);
    expect(y.taxes.federal).toBeLessThan(base.taxes.federal);
  });
  it('blends a raise dated inside the year', () => {
    const plan = examplePlan();
    const inc = plan.incomes.find((i) => i.kind === 'salary')!;
    inc.growth = 0; inc.inflationAdjusted = false;
    const y0 = plan.startYear + 1;
    inc.steps = [{ year: y0, date: y0 + '-07-02', amount: inc.amount * 2, nominal: true }];
    const ys = run(plan);
    const before = ys.find((r) => r.year === y0 - 1)!.income[inc.id];
    const mid = ys.find((r) => r.year === y0)!.income[inc.id];
    const after = ys.find((r) => r.year === y0 + 1)!.income[inc.id];
    expect(mid / before).toBeGreaterThan(1.45);
    expect(mid / before).toBeLessThan(1.55);
    expect(after / before).toBeCloseTo(2, 2);
  });
  it('holds a salary flat until the year it starts keeping pace with inflation', () => {
    const plan = examplePlan();
    plan.assumptions.inflation = 0.03;
    const inc = plan.incomes.find((i) => i.kind === 'salary')!;
    inc.growth = 0; inc.inflationAdjusted = true; inc.indexFrom = plan.startYear + 3;
    const ys = run(plan);
    expect(ys[2].income[inc.id]).toBeCloseTo(ys[0].income[inc.id], 0);
    expect(ys[4].income[inc.id]).toBeGreaterThan(ys[3].income[inc.id] * 1.02);
  });
});

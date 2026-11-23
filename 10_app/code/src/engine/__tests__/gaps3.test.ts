// ProjectionLab features, batch 3: flexible spending with discretionary shares, Coast FI, invested-assets, and debt-free
// milestones, and the plan's warnings.
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';
import { planWarnings } from '../warnings';

describe('ProjectionLab features, batch 3', () => {
  it('flexible spending cuts the discretionary share after a crash and leaves essentials alone', () => {
    const p = examplePlan(2026);
    p.assumptions.crash = { enabled: true, year: 2030, drop: 0.5 };
    p.expenses.find((e) => e.id === 'e_living')!.discretionary = 0.4;
    const plain = simulate(structuredClone(p)).years;
    p.strategy.flex = { enabled: true, drop: 0.2, cut: 0.5 };
    const flex = simulate(structuredClone(p)).years;
    const at = (ys: typeof flex, y: number) => ys.find((r) => r.year === y)!;
    expect(at(flex, 2029).flexChange).toBeUndefined();
    // the year after the crash, 40% of living expenses is discretionary and half of it is cut: a fifth less
    expect(at(flex, 2031).expenses.e_living / at(plain, 2031).expenses.e_living).toBeCloseTo(0.8);
    expect(at(flex, 2031).flexChange).toBeLessThan(0);
    expect(at(flex, 2031).expenses.e_health ?? 0).toBeCloseTo(at(plain, 2031).expenses.e_health ?? 0);
    expect(at(plain, 2031).discretionary).toBeGreaterThan(0);
  });

  it('Coast FI, invested-assets, and debt-free milestones are reached in the right years', () => {
    const p = examplePlan(2026);
    p.milestones = [
      { id: 'coast', name: 'Coast FI', kind: 'coastFi' },
      { id: 'liq', name: 'One million invested', kind: 'liquidNetWorth', netWorth: 1000000 },
      { id: 'free', name: 'Debt-free', kind: 'debtFree' },
      { id: 'fi', name: 'FI', kind: 'financialIndependence' },
    ];
    const proj = simulate(p);
    const when = (id: string) => proj.years.find((y) => y.milestonesReached.includes(id))?.year;
    expect(when('coast')).toBeDefined();
    expect(when('coast')!).toBeLessThanOrEqual(when('fi')!);
    const liq = proj.years.find((y) => y.year === when('liq'))!;
    expect(liq.liquidNetWorth).toBeGreaterThan(1000000);
    const free = proj.years.find((y) => y.year === when('free'))!;
    expect(free.balances.a_mort).toBeGreaterThan(-1);
    expect(proj.years.find((y) => y.year === when('free')! - 1)!.balances.a_mort).toBeLessThan(-1);
  });

  it('warnings name a shortfall, a growing debt, an unreached milestone, and an unset exchange rate', () => {
    const p = examplePlan(2026);
    expect(planWarnings(p, simulate(structuredClone(p))).filter((w) => w.level === 'problem')).toEqual([]);
    p.expenses.find((e) => e.id === 'e_living')!.amount = 400000;
    p.accounts.push({ id: 'card', name: 'Card', kind: 'debt', ownerId: 'p1', balance: 20000, allocation: { stocks: 0, bonds: 0, cash: 0 }, interestRate: 0.25, payment: 1000 });
    p.milestones.push({ id: 'ten', name: 'Ten million', kind: 'netWorth', netWorth: 1e10 });
    p.accounts[0].currency = 'EUR';
    const w = planWarnings(p, simulate(structuredClone(p))).map((x) => x.text).join(' | ');
    expect(w).toMatch(/Money runs short in \d{4}/);
    expect(w).toContain('"Card" is less than its yearly interest');
    expect(w).toContain('"Ten million" is not reached');
    expect(w).toContain('Amounts in EUR convert at a rate of 1 to USD');
  });
});

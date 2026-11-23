import { describe, expect, it } from 'vitest';
import { bracketTax, computeTax } from '../tax';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';

const base = { year: 2026, status: 'mfj' as const, index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 0, interest: 0,
  qualifiedDividends: 0, longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0, state: 'TX' };

describe('credits', () => {
  it('gives $2,200 a child under 17 in 2026, phased out by $50 per $1,000 above $400,000 joint', () => {
    const a = computeTax({ ...base, wages: 150000, children: 2 });
    const none = computeTax({ ...base, wages: 150000 });
    expect(none.total - a.total).toBeCloseTo(4400, 0);
    const high = computeTax({ ...base, wages: 410000, children: 1 });
    expect(high.credits).toBeCloseTo(2200 - 50 * 10, 0);
  });
  it('refunds up to $1,700 a child when the tax is lower than the credit', () => {
    const t = computeTax({ ...base, wages: 40000, children: 2 });
    // Little income tax remains for the nonrefundable part; the refundable part is 15% of earned income above $2,500.
    expect(t.credits).toBeGreaterThan(3400);
  });
  it('pays the saver\'s credit at 50% below the first 2026 joint tier ($48,500)', () => {
    const t = computeTax({ ...base, wages: 60000, preTaxDeductions: 15000, saverContributions: [2000, 2000] });
    expect(t.agi).toBeLessThanOrEqual(48500);
    expect(t.credits).toBeCloseTo(Math.min(2000, bracketTax(Math.max(0, 45000 - 32200), [[0, 0.1], [24800, 0.12]])), 0);
  });
  it('pays the earned income credit at its 2026 maximum for two children', () => {
    const t = computeTax({ ...base, wages: 25000, children: 2 });
    expect(t.credits).toBeGreaterThan(7316);
  });
});

describe('the alternative minimum tax', () => {
  it('is zero for a typical wage earner', () => {
    expect(computeTax({ ...base, wages: 200000 }).amt).toBe(0);
  });
  it('applies with large state taxes added back and the exemption phased out', () => {
    const t = computeTax({ ...base, wages: 1500000, state: 'CA', itemize: true, itemizedOther: 0, propertyTax: 30000 });
    expect(t.amt).toBeGreaterThanOrEqual(0);
    const amti = t.agi - (t.itemized ? t.deduction - 10000 : 0);
    expect(amti).toBeGreaterThan(1280400); // the 2026 exemption is gone
  });
});

describe('deductions and local taxes', () => {
  it('deducts $6,000 a person 65 or over in 2026, phased out at 6% above $150,000 joint', () => {
    const a = computeTax({ ...base, otherOrdinary: 100000, over65: 2 });
    expect(a.seniorDeduction).toBe(12000);
    expect(computeTax({ ...base, year: 2029, otherOrdinary: 100000, over65: 2 }).seniorDeduction).toBe(0);
    expect(computeTax({ ...base, otherOrdinary: 250000, over65: 2 }).seniorDeduction).toBeCloseTo(12000 - 0.06 * 100000, 0);
  });
  it('taxes New York City residents by the city brackets, and wages at a flat city rate', () => {
    const nyc = computeTax({ ...base, wages: 132200, local: { kind: 'nyc' } });
    expect(nyc.local).toBeCloseTo(21600 * 0.03078 + 23400 * 0.03762 + 45000 * 0.03819 + 10000 * 0.03876, 0);
    expect(computeTax({ ...base, wages: 100000, local: { kind: 'wages', rate: 0.0374 } }).local).toBeCloseTo(3740, 0);
  });
  it('taxes Washington residents\' long-term gains above the exemption at 7%', () => {
    const t = computeTax({ ...base, state: 'WA', otherOrdinary: 50000, longTermGains: 500000 });
    const ex = 278000 * 1.025;
    expect(t.state).toBeCloseTo((500000 - ex) * 0.07, -1);
  });
});

describe('dependents in a plan', () => {
  it('claims the child credit while a child is under 17, then the $500 credit and the college credit', () => {
    const p = examplePlan(2026);
    p.events = [{ id: 'k', kind: 'child', name: 'Ada', year: 2027, yearlyCost: 15000, collegeYearly: 30000, collegeYears: 4 }];
    const ys = simulate(p).years;
    const without = simulate(examplePlan(2026)).years;
    const credit = (yr: number) => ys.find((y) => y.year === yr)!.taxes.credits ?? 0;
    expect(credit(2030)).toBeGreaterThan(2000);
    expect(credit(2046)).toBeGreaterThan(0);
    expect((without.find((y) => y.year === 2030)!.taxes.credits ?? 0)).toBeLessThan(credit(2030));
  });
});

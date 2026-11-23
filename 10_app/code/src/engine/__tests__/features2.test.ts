import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';
import { netLegacy } from '../estate';
import { optimize } from '../optimize';
import { estateTax } from '../tax';
import type { Plan } from '../types';

const base = () => examplePlan(2026);
const run = (p: Plan) => simulate(structuredClone(p));

describe('accounts and income', () => {
  it('empties an inherited IRA within ten years, as taxable distributions', () => {
    const p = base();
    p.events = [{ id: 'i', kind: 'inheritance', name: 'Aunt', year: 2030, amount: 300000, asIra: true }];
    const ys = run(p).years;
    expect(ys.find((y) => y.year === 2031)!.withdrawals.ev_iira_i).toBeGreaterThan(0);
    expect(ys.find((y) => y.year === 2041)!.balances.ev_iira_i).toBeLessThan(1);
  });
  it('pays a cash inheritance once, untaxed', () => {
    const p = base();
    p.events = [{ id: 'c', kind: 'inheritance', name: 'Gift', year: 2028, amount: 100000, asIra: false }];
    const ys = run(p).years;
    expect(ys.find((y) => y.year === 2028)!.income.ev_inh_c).toBeGreaterThan(100000);
    expect(ys.find((y) => y.year === 2029)!.income.ev_inh_c).toBeUndefined();
  });
  it('vests an RSU grant over its years as wages kept in the taxable account', () => {
    const p = base();
    p.incomes.push({ id: 'r', name: 'RSUs', kind: 'rsu', ownerId: 'p1', amount: 80000, growth: 0, startYear: 2026, inflationAdjusted: false, taxable: true, vestYears: 4 });
    const ys = run(p).years;
    expect(ys[0].income.r).toBeCloseTo(20000, 0);
    expect(ys[4].income.r).toBeUndefined();
  });
  it('counts net rent as income and forgives a student loan as income', () => {
    const p = base();
    p.events = [{ id: 'rp', kind: 'rentalProperty', name: 'Duplex', year: 2027, price: 300000, downPayment: 0.25, rate: 0.07, termYears: 30, rent: 24000, vacancy: 0.05, costs: 0.35, appreciation: 0.03 }];
    p.accounts.push({ id: 'sl', name: 'Student loan', kind: 'debt', ownerId: 'p1', balance: 40000, allocation: { stocks: 0, bonds: 0, cash: 0 }, interestRate: 0.05, payment: 2000, forgiveYear: 2030 });
    const ys = run(p).years;
    expect(ys.find((y) => y.year === 2028)!.income.rent_ev_rental_rp).toBeGreaterThan(24000 * 0.95 * 0.65 * 0.99);
    const f = ys.find((y) => y.year === 2030)!;
    expect(f.income.forgiven_sl).toBeGreaterThan(30000);
    expect(f.balances.sl).toBe(0);
  });
});

describe('strategies', () => {
  it('keeps a direct Roth IRA contribution out above the income limit unless the backdoor is on', () => {
    const p = base();
    p.incomes[0].amount = 400000;
    const no = run(p).years[2].contributions.a_roth ?? 0;
    p.strategy.backdoorRoth = true;
    const yes = run(p).years[2].contributions.a_roth ?? 0;
    expect(yes - no).toBeGreaterThan(7000);
  });
  it('adds mega backdoor money to the Roth within the 415(c) limit', () => {
    const p = base();
    p.strategy.megaBackdoor = 100000;
    const y = run(p).years[0];
    const room = 72000 - 12000 - y.employerMatch; // the 401(k) deferral is 10% of $120,000
    expect((y.contributions.a_roth ?? 0) - 7500).toBeCloseTo(room, -2);
  });
  it('keeps ordinary taxable income at the 12% bracket top under the 12% shield', async () => {
    const { bracketTop, rulesFor } = await import('../tax');
    const p = base();
    p.strategy.withdrawalOrder = ['traditional', 'cash', 'taxable', 'roth', 'hsa'];
    p.strategy.rothConversionBracket = 0;
    p.strategy.harvestZeroGains = false;
    const open = run(p).years;
    p.strategy.shield = 'bracket12';
    const ys = run(p).years;
    let k = 1;
    const at: Record<number, number> = {};
    for (const y of ys) { at[y.year] = k; k *= 1 + p.assumptions.inflation; }
    for (const y of ys.filter((r) => r.ages.p1 >= 61 && r.ages.p1 <= 70 && r.shortfall === 0 && r.rmd === 0)) {
      const ri = at[y.year] / (at[rulesFor(y.year).year] ?? 1);
      expect(y.taxes.ordinaryTaxable ?? 0).toBeLessThanOrEqual(bracketTop(0.12, 'mfj', y.year, ri) + 1);
    }
    const trad = (rs: typeof ys) => rs.filter((r) => r.ages.p1 >= 61 && r.ages.p1 <= 70).reduce((t, r) => t + (r.withdrawals.a_401k ?? 0) + (r.withdrawals.a_401k2 ?? 0), 0);
    expect(trad(ys)).toBeLessThan(trad(open));
  });
  it('retires a person when a multi-condition milestone is met', () => {
    const p = base();
    p.strategy.retirementAge = { p1: 70, p2: 70 };
    p.milestones.push({ id: 'go', name: 'FI and 50', kind: 'all', conditions: [{ kind: 'financialIndependence' }, { kind: 'age', personId: 'p1', age: 50 }], retires: ['p1'] });
    const ys = run(p).years;
    const at = ys.find((y) => y.milestonesReached.includes('go'))!;
    expect(at.ages.p1).toBeGreaterThanOrEqual(50);
    expect(ys.find((y) => y.year === at.year + 1)!.income.i_sal1).toBeUndefined();
  });
  it('taxes by the new state after a move', () => {
    const p = base();
    p.events = [{ id: 'mv', kind: 'move', name: 'To Texas', year: 2028, state: 'TX' }];
    const ys = run(p).years;
    expect(ys.find((y) => y.year === 2027)!.taxes.state).toBeGreaterThan(5000);
    expect(ys.find((y) => y.year === 2028)!.taxes.state).toBe(0);
  });
  it('repeats a recurring purchase', () => {
    const p = base();
    p.events = [{ id: 'car', kind: 'recurring', name: 'Car', year: 2027, amount: 40000, everyYears: 8, endYear: 2060 }];
    const ys = run(p).years;
    [2027, 2035, 2043, 2051, 2059].forEach((yr, n) => expect(ys.find((y) => y.year === yr)!.expenses[`ev_rec${n}_car`]).toBeGreaterThan(40000));
    expect(ys.find((y) => y.year === 2031)!.expenses['ev_rec0_car']).toBeUndefined();
  });
});

describe('estate and optimizer', () => {
  it('taxes an estate at 40% above two exemptions for a couple', () => {
    expect(estateTax(40000000, 2026, 1, 2)).toBeCloseTo(0.4 * 10000000, 0);
    expect(estateTax(10000000, 2026, 1, 1)).toBe(0);
  });
  it('nets the heirs\' income tax on traditional accounts out of the legacy', () => {
    const p = base();
    const proj = run(p);
    const l = netLegacy(p, proj);
    expect(l.netLegacy).toBeLessThan(l.grossEstate);
    expect(l.heirsIncomeTax).toBeGreaterThanOrEqual(0);
  });
  it('ranks 60 strategies, the best first', () => {
    const r = optimize(base());
    expect(r.length).toBe(60);
    expect(r[0].netLegacyReal).toBeGreaterThanOrEqual(r[r.length - 1].netLegacyReal);
  });
});

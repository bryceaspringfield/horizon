import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { expandEvents, loanPayment, simulate } from '../simulate';
import { fireMetrics } from '../fire';
import { estimatePia } from '../retirement';
import type { Plan } from '../types';

const base = () => examplePlan(2026);
const run = (p: Plan) => simulate(structuredClone(p));

describe('life events', () => {
  it('buys a home: the down payment leaves, the home and its mortgage appear in the purchase year', () => {
    const p = base();
    p.events = [{ id: 'h', kind: 'homePurchase', name: 'Lake house', year: 2030, price: 400000, downPayment: 0.2, rate: 0.06, termYears: 30, appreciation: 0.03, closingCosts: 0.03 }];
    const ys = run(p).years;
    const before = ys.find((y) => y.year === 2029)!, at = ys.find((y) => y.year === 2030)!;
    expect(before.balances.ev_home_h).toBe(0);
    expect(at.balances.ev_home_h).toBeGreaterThan(400000);
    expect(at.balances.ev_mort_h).toBeLessThan(-300000);
    expect(at.expenses.ev_down_h).toBeGreaterThan(400000 * 0.23 - 1);
  });
  it('applies events once, however often it is asked', () => {
    const p = base();
    p.events = [{ id: 'c', kind: 'child', name: 'Ada', year: 2028, yearlyCost: 15000, collegeYearly: 30000, collegeYears: 4 }];
    const twice = expandEvents(expandEvents(structuredClone(p)));
    expect(twice.expenses.filter((e) => e.id.endsWith('_c')).length).toBe(2);
  });
  it('adds child costs to 18 and college after', () => {
    const p = base();
    p.events = [{ id: 'c', kind: 'child', name: 'Ada', year: 2028, yearlyCost: 15000, collegeYearly: 30000, collegeYears: 4 }];
    const ys = run(p).years;
    expect(ys.find((y) => y.year === 2030)!.expenses.ev_child_c).toBeGreaterThan(15000);
    expect(ys.find((y) => y.year === 2047)!.expenses.ev_college_c).toBeGreaterThan(30000);
    expect(ys.find((y) => y.year === 2050)!.expenses.ev_college_c).toBeUndefined();
  });
  it('stops pay in a career break and scales it after a pay change', () => {
    const p = base();
    p.events = [{ id: 'b', kind: 'careerBreak', name: 'Sabbatical', personId: 'p1', year: 2028, endYear: 2028 },
      { id: 'r', kind: 'payChange', name: 'Promotion', personId: 'p2', year: 2027, factor: 1.5 }];
    const ys = run(p).years;
    expect(ys.find((y) => y.year === 2028)!.income.i_sal1).toBeUndefined();
    expect(ys.find((y) => y.year === 2029)!.income.i_sal1).toBeGreaterThan(0);
    const p2026 = ys[0].income.i_sal2, p2027 = ys[1].income.i_sal2;
    expect(p2027 / p2026).toBeGreaterThan(1.5);
  });
});

describe('strategy and stress tests', () => {
  it('a glide path to 30% stocks lowers late-life wealth at these assumptions', () => {
    const p = base(), q = base();
    q.strategy.glidePath = { enabled: true, startAge: 45, endAge: 65, endStocks: 0.3 };
    expect(run(q).endingNetWorthReal).toBeLessThan(run(p).endingNetWorthReal);
  });
  it('variable percentage withdrawal spends the portfolio down by the end', () => {
    const p = base();
    p.strategy.spending = 'vpw';
    const ys = run(p).years;
    const peak = Math.max(...ys.map((y) => y.liquidNetWorth));
    expect(ys[ys.length - 1].liquidNetWorth).toBeLessThan(peak * 0.25);
  });
  it('a crash lowers net worth from its year', () => {
    const p = base(), q = base();
    q.assumptions.crash = { enabled: true, year: 2035, drop: 0.4 };
    const a = run(p).years.find((y) => y.year === 2035)!, b = run(q).years.find((y) => y.year === 2035)!;
    expect(b.liquidNetWorth).toBeLessThan(a.liquidNetWorth * 0.8);
  });
  it('extra payments pay a mortgage off sooner', () => {
    const payoff = (p: Plan) => run(p).years.find((y) => (y.balances.a_mort ?? 0) > -1)!.year;
    const q = base();
    q.accounts.find((a) => a.id === 'a_mort')!.extraPayment = 12000;
    expect(payoff(q)).toBeLessThan(payoff(base()) - 5);
  });
  it('computes a standard mortgage payment', () => {
    expect(loanPayment(300000, 0.06, 30)).toBeCloseTo(21794.67, 0);
  });
});

describe('FIRE metrics and benefit estimate', () => {
  it('orders lean, regular, and fat FI, and puts Coast FI below FI', () => {
    const p = base();
    const f = fireMetrics(p, run(p));
    expect(f.leanFiNumber).toBeLessThan(f.fiNumber);
    expect(f.fatFiNumber).toBeGreaterThan(f.fiNumber);
    expect(f.coastFiNumber).toBeLessThan(f.fiNumber);
  });
  it('estimates a PIA from a steady salary through the 2026 bend points', () => {
    // $60,000 for 35 years: AIME $5,000; PIA = 0.9*1,286 + 0.32*(5,000-1,286).
    expect(estimatePia(60000, 35)).toBeCloseTo(0.9 * 1286 + 0.32 * (5000 - 1286), 0);
  });
});

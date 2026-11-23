import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { resolve, shareOfYear, yearOf } from '../dates';
import { expandEvents, simulate } from '../simulate';

// Exact dates, event-tied points, plan-wide defaults, and contributions in dollars (Bryce, 2026-11-23).
describe('dates and defaults', () => {
  it('turns a date into a fractional year and prorates the year', () => {
    expect(yearOf('2028-01-01')).toBe(2028);
    expect(yearOf('2028-01-20')).toBeCloseTo(2028 + 19 / 366, 6);
    expect(shareOfYear(2028, 2026, yearOf('2028-01-20'))).toBeCloseTo(19 / 366, 6);
    expect(shareOfYear(2029, 2026, yearOf('2028-01-20'))).toBe(0);
  });
  it('ends an income on an exact date, paying only the part of that year', () => {
    const plan = examplePlan();
    const inc = plan.incomes.find((i) => i.kind === 'salary')!;
    const y = plan.startYear + 2;
    inc.end = { kind: 'date', date: y + '-07-02' };
    const ys = simulate(expandEvents(structuredClone(plan))).years;
    const full = ys.find((r) => r.year === y - 1)!.income[inc.id];
    const part = ys.find((r) => r.year === y)!.income[inc.id];
    expect(part / full).toBeGreaterThan(0.45);
    expect(part / full).toBeLessThan(0.56);
    expect(ys.find((r) => r.year === y + 1)!.income[inc.id]).toBeUndefined();
  });
  it('follows a life event when the event moves', () => {
    const plan = examplePlan();
    plan.events = [{ id: 'ev1', kind: 'careerBreak', name: 'Break', personId: plan.people[0].id, year: 2030, endYear: 2031 }];
    expect(resolve({ kind: 'event', eventId: 'ev1' }, plan)).toBe(2030);
    plan.events[0].year = 2033;
    expect(resolve({ kind: 'event', eventId: 'ev1' }, plan)).toBe(2033);
  });
  it('applies plan-wide ages to people without their own', () => {
    const plan = examplePlan();
    plan.assumptions.planTo = { mode: 'age', age: 99 };
    plan.assumptions.retirementAgeAll = 60;
    if (plan.people[1]) plan.people[1].ownRetirementAge = true;
    const own = plan.people[1] ? plan.strategy.retirementAge[plan.people[1].id] : undefined;
    const p = expandEvents(structuredClone(plan));
    expect(p.people[0].lifeExpectancy).toBe(99);
    expect(p.strategy.retirementAge[p.people[0].id]).toBe(60);
    if (p.people[1]) expect(p.strategy.retirementAge[p.people[1].id]).toBe(own);
  });
  it('takes a 401(k) contribution set in dollars', () => {
    const plan = examplePlan();
    const inc = plan.incomes.find((i) => i.kind === 'salary')!;
    inc.contributionAmount = 10000; inc.contributionRate = 0;
    const y = simulate(expandEvents(structuredClone(plan))).years[0];
    expect(y.contributions ? Object.values(y.contributions).reduce((t, v) => t + v, 0) : 0).toBeGreaterThan(9999);
  });
});

describe('SSDI', () => {
  it('pays the full benefit from 5 months after onset, unreduced, with Medicare 24 months later', () => {
    const plan = examplePlan();
    const ss = plan.socialSecurity[0];
    ss.ssdi = true; ss.ssdiOnset = plan.startYear + '-01-01'; ss.pia = 1500;
    const ys = simulate(expandEvents(structuredClone(plan))).years;
    expect(ys[0].socialSecurity).toBeGreaterThan(1500 * 7 * 0.95);
    expect(ys[0].socialSecurity).toBeLessThan(1500 * 7 * 1.1);
    expect(ys[1].socialSecurity).toBeGreaterThan(1500 * 12 * 0.95);
  });
});

import { expectedDeathDate } from '../lifespan';
import { describe, expect, it } from 'vitest';
import { blankAnswers, planFromAnswers, setupBenefit } from '../setup';
import { simulate } from '../simulate';

describe('first-run setup', () => {
  it('builds a single renter\'s plan from the answers, and the plan simulates', () => {
    const a = blankAnswers(2026);
    a.you = { ...a.you, name: 'Avery', birthYear: 1996, salary: 90000, contributionRate: 0.1, retirementAge: 62, traditional: 40000, roth: 15000 };
    a.state = 'TX'; a.cash = 12000; a.brokerage = 20000; a.living = 48000; a.rothIra = 3000; a.otherDebt = 18000; a.otherDebtPayment = 350;
    const p = planFromAnswers(a, 2026);
    expect(p.people).toEqual([{ id: 'p1', name: 'Avery', birthYear: 1996, lifeExpectancy: Math.round(expectedDeathDate('1996-07-01', 'unknown', 'all', []).age) }]);
    expect(p.assumptions.state).toBe('TX');
    expect(p.assumptions.filingStatus).toBe('single');
    expect(p.accounts.map((x) => x.kind).sort()).toEqual(['cash', 'debt', 'roth', 'taxable', 'traditional']);
    expect(p.accounts.find((x) => x.kind === 'taxable')!.costBasis).toBe(15000);
    expect(p.accounts.find((x) => x.kind === 'debt')!.payment).toBe(4200);
    expect(p.incomes).toHaveLength(1);
    expect(p.expenses.find((e) => e.kind === 'living')!.amount).toBe(48000);
    expect(p.strategy.retirementAge).toEqual({ p1: 62 });
    expect(p.socialSecurity[0].pia).toBe(setupBenefit(a.you));
    expect(p.socialSecurity[0].pia).toBeGreaterThan(1500);
    const years = simulate(structuredClone(p)).years;
    expect(years.length).toBe(p.people[0].lifeExpectancy - 30 + 1);
    expect(years.every((y) => Number.isFinite(y.netWorth))).toBe(true);
    expect(years[0].netWorth).toBeGreaterThan(60000);
  });

  it('builds a couple\'s plan with a home, a mortgage, and each person\'s accounts', () => {
    const a = blankAnswers(2026);
    a.hasPartner = true; a.filingStatus = 'mfj';
    a.you = { ...a.you, name: 'Sam', birthYear: 1981, salary: 140000, retirementAge: 60, traditional: 300000, socialSecurity: 3200 };
    a.partner = { ...a.partner, name: 'Riley', birthYear: 1983, salary: 0, retirementAge: 60, roth: 50000 };
    a.ownsHome = true; a.homeValue = 600000; a.mortgageBalance = 350000; a.mortgagePayment = 2400; a.living = 80000; a.hsa = 9000;
    const p = planFromAnswers(a, 2026);
    expect(p.people.map((x) => x.name)).toEqual(['Sam', 'Riley']);
    expect(p.incomes.map((i) => i.ownerId)).toEqual(['p1']);
    expect(p.socialSecurity.map((s) => s.pia)).toEqual([3200, 0]);
    const mort = p.accounts.find((x) => x.id === 'a_mort')!;
    expect(mort.payment).toBe(28800);
    expect(mort.securedBy).toBe('a_home');
    expect(p.accounts.filter((x) => x.ownerId === 'p2').map((x) => x.kind)).toEqual(['roth']);
    expect(p.deductions.propertyTaxRate).toBeGreaterThan(0);
    expect(simulate(structuredClone(p)).years.every((y) => Number.isFinite(y.netWorth))).toBe(true);
  });

  it('with nothing filled in, still builds a plan which simulates', () => {
    const p = planFromAnswers(blankAnswers(2026), 2026);
    expect(p.people[0].name).toBe('You');
    expect(p.accounts.map((x) => x.kind)).toEqual(['cash']);
    expect(simulate(structuredClone(p)).years.every((y) => Number.isFinite(y.netWorth))).toBe(true);
  });
});

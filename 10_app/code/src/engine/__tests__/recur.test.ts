import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';

describe('expense recurrence', () => {
  it('charges an expense only every N years from its start', () => {
    const plan = examplePlan();
    plan.expenses.push({ id: 'car', name: 'Car', kind: 'other', amount: 30000, startYear: (plan.startYear + 1), growth: 0, everyYears: 8 });
    const r = simulate(plan);
    const at = (y: number) => r.years.find((x) => x.year === y)?.expenses.car ?? 0;
    expect(at((plan.startYear + 1))).toBeGreaterThan(0);
    expect(at(plan.startYear + 2)).toBe(0);
    expect(at(plan.startYear + 9)).toBeGreaterThan(0);
  });
});

describe('municipal bonds', () => {
  it('lowers the tax on a taxable account of bonds', () => {
    const plan = examplePlan();
    plan.accounts.push({ id: 'muni', name: 'Bonds', kind: 'taxable', ownerId: plan.people[0].id, balance: 2000000, costBasis: 2000000, allocation: { stocks: 0, bonds: 1, cash: 0 } } as any);
    const base = simulate(plan).years[0].taxes.total;
    plan.accounts.find((x) => x.id === 'muni')!.municipalShare = 1;
    expect(simulate(plan).years[0].taxes.total).toBeLessThan(base);
  });
});

describe('annuity purchase', () => {
  it('pays the premium once and a payout every year after', () => {
    const plan = examplePlan();
    const y0 = plan.startYear, who = plan.people[0].id;
    plan.events = [...(plan.events ?? []), { id: 'a1', kind: 'annuity', name: 'SPIA', year: y0 + 1, premium: 100000, payoutRate: 0.07, payoutYear: y0 + 1, personId: who }];
    const r = simulate(plan);
    const at = (y: number) => r.years.find((x) => x.year === y)!;
    expect(at(y0 + 1).expenses['ev_ann_a1']).toBeCloseTo(100000, -2);
    const paid = (y: number) => (at(y).income['ev_annt_a1'] ?? 0) + (at(y).income['ev_annx_a1'] ?? 0);
    expect(paid(y0 + 3)).toBeCloseTo(7000, -1);
  });
});

describe('line of credit', () => {
  it('covers a shortfall up to its limit', () => {
    const plan = examplePlan();
    const y0 = plan.startYear;
    plan.expenses.push({ id: 'big', name: 'Big bill', kind: 'oneTime', amount: 1e8, startYear: y0 + 1, growth: 0 });
    const without = simulate(plan).years.find((x) => x.year === y0 + 1)!.shortfall;
    plan.accounts.push({ id: 'heloc', name: 'HELOC', kind: 'debt', ownerId: plan.people[0].id, balance: 0, allocation: { stocks: 0, bonds: 0, cash: 0 }, interestRate: 0.08, payment: 0, creditLimit: 100000 } as any);
    const r = simulate(plan).years.find((x) => x.year === y0 + 1)!;
    expect(without - r.shortfall).toBeGreaterThan(90000);
  });
});

describe('stock options', () => {
  it('taxes an NSO spread as wages and an ISO spread not at exercise', () => {
    const run = (type: 'nso' | 'iso') => {
      const plan = examplePlan();
      const y0 = plan.startYear;
      plan.incomes.push({ id: 'opt', name: 'Options', kind: 'options', ownerId: plan.people[0].id, amount: 0, growth: 0, startYear: y0 + 1, endYear: y0 + 1, inflationAdjusted: false, taxable: true, options: { type, shares: 1000, strike: 10, price: 110, growth: 0 } } as any);
      return simulate(plan).years.find((x) => x.year === y0 + 1)!;
    };
    const nso = run('nso'), iso = run('iso');
    expect(nso.income.opt).toBeCloseTo(100000, -1);
    expect(nso.taxes.total).toBeGreaterThan(iso.taxes.total);
  });
});

describe('ISO and the AMT', () => {
  it('a large ISO spread raises the alternative minimum tax', () => {
    const plan = examplePlan();
    const y0 = plan.startYear;
    const base = simulate(plan).years.find((x) => x.year === y0 + 1)!.taxes.total;
    plan.incomes.push({ id: 'iso', name: 'ISOs', kind: 'options', ownerId: plan.people[0].id, amount: 0, growth: 0, startYear: y0 + 1, endYear: y0 + 1, inflationAdjusted: false, taxable: true, options: { type: 'iso', shares: 10000, strike: 10, price: 110, growth: 0 } } as any);
    expect(simulate(plan).years.find((x) => x.year === y0 + 1)!.taxes.total).toBeGreaterThan(base + 100000);
  });
});

describe('household changes', () => {
  it('scales a shared cost when a partner moves in', () => {
    const plan = examplePlan();
    const y0 = plan.startYear;
    plan.people = plan.people.slice(0, 1);
    plan.people.push({ id: 'gf', name: 'Partner', birthYear: y0 - 30, lifeExpectancy: 90, ownLife: true, joins: `${y0 + 2}-01-01` });
    plan.expenses.push({ id: 'rent', name: 'Rent', kind: 'housing', amount: 24000, startYear: y0, growth: 0, nominal: true, scalesWithHousehold: true });
    const r = simulate(plan);
    const rent = (y: number) => r.years.find((x) => x.year === y)!.expenses.rent;
    expect((rent(y0 + 2) / rent(y0 + 1)) / (rent(y0 + 1) / rent(y0))).toBeCloseTo(Math.SQRT2, 2);
  });
});

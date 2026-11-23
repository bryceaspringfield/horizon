import { describe, expect, it } from 'vitest';
import { importProjectionLab, isProjectionLabExport } from '../projectionlab';
import { simulate } from '../simulate';

// A file shaped as ProjectionLab's export is understood to be (no schema is published): current finances under
// "today", and each plan's income, expenses, priorities, milestones, and variables.
const file = {
  meta: { version: '4.0.0' },
  today: {
    partnerStatus: 'couple', yourName: 'Sam', age: 40, spouseName: 'Lee', spouseAge: 38, location: { country: 'US', state: 'co' },
    savingsAccounts: [{ id: 's1', name: 'Emergency fund', balance: 30000, owner: 'joint' }],
    investmentAccounts: [
      { id: 'i1', name: 'Vanguard brokerage', type: 'taxable', balance: 100000, costBasis: 70000, owner: 'me' },
      { id: 'i2', name: 'Work 401k', type: '401k', balance: 250000, owner: 'me' },
      { id: 'i3', name: 'Lee Roth', type: 'roth-ira', balance: 60000, owner: 'spouse' },
      { id: 'i4', name: 'Health savings', type: 'hsa', balance: 9000, owner: 'me' },
    ],
    assets: [{ id: 'h1', name: 'House', type: 'real-estate', amount: 600000, balance: 350000, interestRate: 4.5, monthlyPayment: 2100, owner: 'joint' }],
    debts: [{ id: 'd1', name: 'Student loan', type: 'student-loans', amount: 20000, interestRate: 5.5, monthlyPayment: 300 }],
  },
  plans: [{
    id: 'pl1', name: 'Base case',
    milestones: [
      { id: 'm1', name: 'Retirement', criteria: [{ type: 'age', value: 58 }] },
      { id: 'm2', name: 'Two million', criteria: [{ type: 'netWorth', value: 2000000 }] },
      { id: 'm3', name: 'Odd', criteria: [{ type: 'loanPayoff', value: 'd1' }] },
    ],
    income: { events: [
      { id: 'e1', name: 'Sam salary', type: 'salary', owner: 'me', amount: 150000, frequency: 'yearly', start: { type: 'keyword', value: 'now' }, end: { type: 'milestone', value: 'm1' }, yearlyChange: { type: 'match-inflation' } },
      { id: 'e2', name: 'Lee salary', type: 'salary', owner: 'spouse', amount: 4000, frequency: 'biweekly', start: { type: 'keyword', value: 'now' }, end: { type: 'milestone', value: 'm1' } },
      { id: 'e3', name: 'Inheritance', type: 'other', owner: 'me', amount: 80000, frequency: 'once', start: { type: 'date', value: '2035-06-01' } },
    ] },
    expenses: { events: [
      { id: 'x1', name: 'Living expenses', type: 'living-expenses', amount: 6000, frequency: 'monthly', start: { type: 'keyword', value: 'now' } },
      { id: 'x2', name: 'Mortgage payment', type: 'debt', amount: 2100, frequency: 'monthly' },
      { id: 'x3', name: 'Kitchen', type: 'home-improvement', amount: 45000, frequency: 'once', start: { type: 'year', value: 2030 } },
    ] },
    priorities: { events: [
      { id: 'p1', name: '401k', type: '401k', owner: 'me', contribution: 10, contributionType: '%', employerMatch: 50, employerMatchLimit: 6 },
      { id: 'p2', name: 'Roth IRA', type: 'roth-ira', owner: 'spouse', contribution: 7000, contributionType: 'today$' },
      { id: 'p3', name: 'HSA', type: 'hsa', owner: 'me', contribution: 300, frequency: 'monthly' },
    ] },
    variables: { investmentReturn: 7, inflation: 3, dividendRate: 1.8, filingStatus: 'married-filing-jointly' },
  }, { id: 'pl2', name: 'Retire early', income: { events: [] }, expenses: { events: [] }, variables: {} }],
  progress: { data: [{ date: '2025-01-01', netWorth: 700000 }] },
};

describe('ProjectionLab import', () => {
  it('recognizes an export and refuses other files', () => {
    expect(isProjectionLabExport(file)).toBe(true);
    expect(isProjectionLabExport({ plans: [{ id: 'x', accounts: [] }], snapshots: [] })).toBe(false);
    expect(isProjectionLabExport(null)).toBe(false);
  });

  it('brings people, accounts, incomes, expenses, milestones, and savings across', () => {
    const r = importProjectionLab(file, 2026);
    expect(r.plans.map((p) => p.name)).toEqual(['Base case', 'Retire early']);
    const p = r.plans[0];
    expect(p.people.map((x) => [x.name, x.birthYear])).toEqual([['Sam', 1986], ['Lee', 1988]]);
    expect(p.assumptions).toMatchObject({ state: 'CO', filingStatus: 'mfj', inflation: 0.03, dividendYield: 0.018 });
    expect(p.assumptions.returns.stocks).toBe(0.07);
    const by = (name: string) => p.accounts.find((a) => a.name === name)!;
    expect(by('Emergency fund')).toMatchObject({ kind: 'cash', balance: 30000 });
    expect(by('Vanguard brokerage')).toMatchObject({ kind: 'taxable', balance: 100000, costBasis: 70000 });
    expect(by('Work 401k').kind).toBe('traditional');
    expect(by('Lee Roth')).toMatchObject({ kind: 'roth', ownerId: 'p2' });
    expect(by('Health savings').kind).toBe('hsa');
    expect(by('House')).toMatchObject({ kind: 'asset', balance: 600000, realEstate: true });
    expect(by('House: loan')).toMatchObject({ kind: 'debt', balance: 350000, interestRate: 0.045, payment: 25200, securedBy: by('House').id });
    expect(by('Student loan')).toMatchObject({ kind: 'debt', balance: 20000, interestRate: 0.055, payment: 3600 });
    const sam = p.incomes.find((i) => i.name === 'Sam salary')!;
    expect(sam).toMatchObject({ kind: 'salary', amount: 150000, startYear: 2026, endYear: 2043, contributionRate: 0.1, employerMatch: 0.5, matchLimit: 0.06 });
    expect(p.incomes.find((i) => i.name === 'Lee salary')).toMatchObject({ amount: 104000, ownerId: 'p2' });
    expect(p.incomes.find((i) => i.name === 'Inheritance')).toMatchObject({ kind: 'windfall', startYear: 2035, endYear: 2035, taxable: false });
    expect(p.expenses.map((e) => [e.name, e.kind, e.amount, e.startYear])).toEqual([['Living expenses', 'living', 72000, 2026], ['Kitchen', 'oneTime', 45000, 2030]]);
    expect(p.strategy).toMatchObject({ retirementAge: { p1: 58, p2: 58 }, rothIraContribution: 7000, hsaContribution: 3600, cashTarget: 30000 });
    expect(p.milestones.map((m) => m.kind).sort()).toEqual(['age', 'financialIndependence', 'netWorth']);
    expect(r.notes.some((n) => n.includes('"Odd"'))).toBe(true);
    expect(r.notes.some((n) => n.includes('Mortgage payment') && n.includes('twice'))).toBe(true);
    expect(r.notes.some((n) => n.includes('net worth history'))).toBe(true);
    expect(r.imported.find((x) => x.label === 'plans')!.count).toBe(2);
  });

  it('builds plans which simulate, even from a nearly empty plan', () => {
    for (const p of importProjectionLab(file, 2026).plans) {
      const proj = simulate(p);
      expect(proj.years.length).toBeGreaterThan(40);
      expect(Number.isFinite(proj.endingNetWorthReal)).toBe(true);
    }
    const bare = importProjectionLab({ today: {}, plans: [{ variables: {} }] }, 2026);
    expect(bare.plans).toHaveLength(1);
    expect(Number.isFinite(simulate(bare.plans[0]).endingNetWorthReal)).toBe(true);
  });
});

import { exportProjectionLab } from '../projectionlab';
describe('export to ProjectionLab', () => {
  it('round-trips a plan: people, accounts, incomes, expenses, and an exact date', async () => {
    const { examplePlan } = await import('../defaults');
    const plan = examplePlan(2026);
    const inc = plan.incomes[0];
    inc.end = { kind: 'date', date: '2031-04-15' };
    const out = exportProjectionLab([plan]);
    expect(isProjectionLabExport(out)).toBe(true);
    const back = importProjectionLab(out, 2026).plans[0];
    expect(back.people.length).toBe(plan.people.length);
    expect(back.incomes.length).toBe(plan.incomes.length);
    expect(back.expenses.length).toBe(plan.expenses.length);
    const total = (p: typeof plan) => p.accounts.filter((a) => a.kind !== 'debt' && a.kind !== 'asset').reduce((t, a) => t + a.balance, 0);
    expect(total(back)).toBeCloseTo(total(plan), 0);
    expect(back.incomes.find((i) => i.name === inc.name)?.end).toEqual({ kind: 'date', date: '2031-04-15' });
  });
});

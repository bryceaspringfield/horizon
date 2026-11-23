// A starting plan for a new user: a couple in their thirties, with every part of the model filled in, to edit.
import { consensus } from './assumptions';
import { expectedDeathDate } from './lifespan';
import type { Plan } from './types';

/** Fills the fields a plan saved by an earlier version lacks, so old plans open. */
export function upgradePlan(p: Plan): Plan {
  const d = examplePlan(p.startYear);
  p.deductions ??= { ...d.deductions, itemize: false, charity: 0 };
  p.healthcare ??= { ...d.healthcare };
  p.strategy.withdrawalMethod ??= 'order';
  p.strategy.harvestZeroGains ??= false;
  return p;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** A plan with nothing entered (Bryce, 2026-11-23: a new account or plan starts empty): one unnamed person, and no
 * accounts, income, expenses, benefits, events, milestones, or transfers. The birth year is needed to run the plan. */
export function emptyPlan(startYear = new Date().getFullYear()): Plan {
  const p = examplePlan(startYear);
  return {
    ...p, name: 'New plan',
    people: [{ id: 'p1', name: '', birthYear: startYear - 30, lifeExpectancy: Math.round(expectedDeathDate(startYear - 30 + '-07-01', 'unknown', 'all', []).age) }],
    accounts: [], incomes: [], expenses: [], socialSecurity: [], milestones: [], events: [],
    strategy: { ...p.strategy, retirementAge: { p1: 65 }, transfers: [] },
  };
}

export function examplePlan(startYear = new Date().getFullYear()): Plan {
  const you = { id: 'p1', name: 'You', birthYear: startYear - 35, lifeExpectancy: 92 };
  const partner = { id: 'p2', name: 'Partner', birthYear: startYear - 33, lifeExpectancy: 95 };
  return {
    id: uid(),
    name: 'My plan',
    startYear,
    people: [you, partner],
    accounts: [
      { id: 'a_cash', name: 'Checking and savings', kind: 'cash', ownerId: 'p1', balance: 25000, allocation: { stocks: 0, bonds: 0, cash: 1 } },
      { id: 'a_brok', name: 'Brokerage', kind: 'taxable', ownerId: 'p1', balance: 60000, costBasis: 45000, allocation: { stocks: 0.9, bonds: 0.1, cash: 0 }, fee: 0.0005 },
      { id: 'a_401k', name: '401(k)', kind: 'traditional', ownerId: 'p1', balance: 120000, allocation: { stocks: 0.9, bonds: 0.1, cash: 0 }, fee: 0.001 },
      { id: 'a_401k2', name: 'Partner 401(k)', kind: 'traditional', ownerId: 'p2', balance: 70000, allocation: { stocks: 0.9, bonds: 0.1, cash: 0 }, fee: 0.001 },
      { id: 'a_roth', name: 'Roth IRA', kind: 'roth', ownerId: 'p1', balance: 40000, allocation: { stocks: 1, bonds: 0, cash: 0 }, fee: 0.0005 },
      { id: 'a_hsa', name: 'HSA', kind: 'hsa', ownerId: 'p1', balance: 12000, allocation: { stocks: 1, bonds: 0, cash: 0 } },
      { id: 'a_home', name: 'Home', kind: 'asset', ownerId: 'p1', balance: 450000, allocation: { stocks: 0, bonds: 0, cash: 0 }, appreciation: 0.03, realEstate: true },
      { id: 'a_mort', name: 'Mortgage', kind: 'debt', ownerId: 'p1', balance: 320000, allocation: { stocks: 0, bonds: 0, cash: 0 }, interestRate: 0.0625, payment: 23640, securedBy: 'a_home' },
    ],
    incomes: [
      { id: 'i_sal1', name: 'Your salary', kind: 'salary', ownerId: 'p1', amount: 120000, growth: 0.01, startYear, inflationAdjusted: true, contributionRate: 0.1, employerMatch: 1, matchLimit: 0.05, taxable: true },
      { id: 'i_sal2', name: 'Partner salary', kind: 'salary', ownerId: 'p2', amount: 85000, growth: 0.01, startYear, inflationAdjusted: true, contributionRate: 0.06, employerMatch: 0.5, matchLimit: 0.06, contributionRoth: false, taxable: true },
    ],
    socialSecurity: [
      { ownerId: 'p1', pia: 3100, claimAge: 67 },
      { ownerId: 'p2', pia: 2400, claimAge: 67 },
    ],
    expenses: [
      { id: 'e_living', name: 'Living expenses', kind: 'living', amount: 70000, startYear, growth: 0 },
      { id: 'e_health', name: 'Out-of-pocket healthcare', kind: 'healthcare', amount: 4000, startYear: you.birthYear + 60, growth: 0.015 },
      { id: 'e_travel', name: 'Travel in early retirement', kind: 'travel', amount: 10000, startYear: you.birthYear + 60, endYear: you.birthYear + 75, growth: 0 },
      { id: 'e_car', name: 'New car', kind: 'oneTime', amount: 40000, startYear: startYear + 4, growth: 0 },
    ],
    milestones: [
      { id: 'm_fi', name: 'Financial independence', kind: 'financialIndependence' },
      { id: 'm_ret', name: 'Retirement', kind: 'age', personId: 'p1', age: 60 },
      { id: 'm_2m', name: '$2M net worth', kind: 'netWorth', netWorth: 2000000 },
    ],
    strategy: {
      retirementAge: { p1: 60, p2: 60 },
      withdrawalOrder: ['cash', 'taxable', 'traditional', 'roth', 'hsa'],
      withdrawalMethod: 'order',
      harvestZeroGains: true,
      cashTarget: 30000,
      iraContribution: 0,
      rothIraContribution: 7500,
      hsaContribution: 8750,
      rothConversionBracket: 0.12,
      rothConversionStart: you.birthYear + 60,
      rothConversionEnd: you.birthYear + 72,
      spending: 'expenses',
      spendingRate: 0.04,
      safeWithdrawalRate: 0.04,
    },
    assumptions: {
      // the analysts' consensus by horizon (engine/assumptions.ts, data/market_assumptions.json)
      ...consensus(),
      state: 'MA',
      filingStatus: 'mfj',
    },
    deductions: { itemize: true, propertyTaxRate: 0.011, charity: 2000 },
    healthcare: { medicare: true, partDBase: 39, aca: true, acaBenchmark: 9000 },
  };
}

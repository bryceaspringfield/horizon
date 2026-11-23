// The first-run setup: the answers a new user gives (pages/Setup.tsx) and the plan built from them.
// A plan starts from the example plan's assumptions and strategy defaults, with every person, account, income, and
// expense replaced by the user's own.
import { examplePlan, uid } from './defaults';
import { estimatePia } from './retirement';
import type { Account, FilingStatus, Plan } from './types';

export interface SetupPerson {
  name: string;
  birthYear: number;
  salary: number;
  /** Share of salary saved in a workplace plan, the employer's match of each dollar, and the match's ceiling. */
  contributionRate: number;
  employerMatch: number;
  matchLimit: number;
  retirementAge: number;
  /** Monthly Social Security benefit at full retirement age, today's dollars; 0 means estimate it from the salary. */
  socialSecurity: number;
  /** Pre-tax retirement accounts (401(k), 403(b), traditional IRA) and Roth accounts. */
  traditional: number;
  roth: number;
}

export interface SetupAnswers {
  you: SetupPerson;
  hasPartner: boolean;
  partner: SetupPerson;
  filingStatus: FilingStatus;
  state: string;
  cash: number;
  brokerage: number;
  /** What the brokerage holdings cost; 0 means unknown, taken as three quarters of the balance. */
  brokerageBasis: number;
  hsa: number;
  ownsHome: boolean;
  homeValue: number;
  mortgageBalance: number;
  mortgageRate: number;
  /** Monthly principal and interest. */
  mortgagePayment: number;
  otherDebt: number;
  otherDebtRate: number;
  otherDebtPayment: number;
  /** Yearly spending, without the mortgage, debt payments, and taxes. */
  living: number;
  rothIra: number;
  hsaContribution: number;
}

const person = (name: string, age: number, year: number): SetupPerson => ({
  name, birthYear: year - age, salary: 0, contributionRate: 0.06, employerMatch: 0.5, matchLimit: 0.06, retirementAge: 65,
  socialSecurity: 0, traditional: 0, roth: 0,
});

export function blankAnswers(year = new Date().getFullYear()): SetupAnswers {
  return {
    you: person('', 35, year), hasPartner: false, partner: person('', 35, year), filingStatus: 'single', state: 'MA',
    cash: 0, brokerage: 0, brokerageBasis: 0, hsa: 0,
    ownsHome: false, homeValue: 0, mortgageBalance: 0, mortgageRate: 0.065, mortgagePayment: 0,
    otherDebt: 0, otherDebtRate: 0.07, otherDebtPayment: 0,
    living: 0, rothIra: 0, hsaContribution: 0,
  };
}

/** The monthly benefit used for a person: their own figure, or an estimate from a career at today's salary. */
export function setupBenefit(p: SetupPerson): number {
  if (p.socialSecurity > 0) return p.socialSecurity;
  return Math.round(estimatePia(p.salary, Math.max(0, Math.min(35, p.retirementAge - 22))));
}

export function planFromAnswers(a: SetupAnswers, year = new Date().getFullYear()): Plan {
  const base = examplePlan(year);
  const people = [{ id: 'p1', a: a.you, fallback: 'You' }, ...(a.hasPartner ? [{ id: 'p2', a: a.partner, fallback: 'Partner' }] : [])];
  const none = { stocks: 0, bonds: 0, cash: 0 };
  const invested = { stocks: 0.9, bonds: 0.1, cash: 0 };
  const accounts: Account[] = [
    { id: 'a_cash', name: 'Checking and savings', kind: 'cash', ownerId: 'p1', balance: a.cash, allocation: { stocks: 0, bonds: 0, cash: 1 } },
  ];
  if (a.brokerage > 0) {
    accounts.push({ id: 'a_brok', name: 'Brokerage', kind: 'taxable', ownerId: 'p1', balance: a.brokerage,
      costBasis: a.brokerageBasis > 0 ? Math.min(a.brokerageBasis, a.brokerage) : Math.round(a.brokerage * 0.75), allocation: invested, fee: 0.0005 });
  }
  for (const { id, a: p, fallback } of people) {
    const who = people.length > 1 ? (p.name || fallback) + ': ' : '';
    // A person with a salary keeps a workplace account even at a zero balance, since their contributions go there.
    if (p.traditional > 0 || p.salary > 0) {
      accounts.push({ id: 'a_trad_' + id, name: who + '401(k) and traditional IRA', kind: 'traditional', ownerId: id, balance: p.traditional, allocation: invested, fee: 0.001 });
    }
    if (p.roth > 0 || (id === 'p1' && a.rothIra > 0)) {
      accounts.push({ id: 'a_roth_' + id, name: who + 'Roth accounts', kind: 'roth', ownerId: id, balance: p.roth, allocation: invested, fee: 0.0005 });
    }
  }
  if (a.hsa > 0 || a.hsaContribution > 0) accounts.push({ id: 'a_hsa', name: 'HSA', kind: 'hsa', ownerId: 'p1', balance: a.hsa, allocation: invested });
  if (a.ownsHome && a.homeValue > 0) {
    accounts.push({ id: 'a_home', name: 'Home', kind: 'asset', ownerId: 'p1', balance: a.homeValue, allocation: none, appreciation: 0.03, realEstate: true });
    if (a.mortgageBalance > 0) {
      accounts.push({ id: 'a_mort', name: 'Mortgage', kind: 'debt', ownerId: 'p1', balance: a.mortgageBalance, allocation: none,
        interestRate: a.mortgageRate, payment: Math.round(a.mortgagePayment * 12), securedBy: 'a_home' });
    }
  }
  if (a.otherDebt > 0) {
    accounts.push({ id: 'a_debt', name: 'Other debts', kind: 'debt', ownerId: 'p1', balance: a.otherDebt, allocation: none,
      interestRate: a.otherDebtRate, payment: Math.round(a.otherDebtPayment * 12) });
  }
  const oldest = Math.min(...people.map((p) => p.a.birthYear));
  const firstRetirement = Math.min(...people.map((p) => p.a.birthYear + p.a.retirementAge));
  return {
    ...base,
    id: uid(),
    name: 'My plan',
    startYear: year,
    people: people.map(({ id, a: p, fallback }, i) => ({ id, name: p.name.trim() || fallback, birthYear: p.birthYear, lifeExpectancy: i === 0 ? 92 : 95 })),
    accounts,
    incomes: people.filter((p) => p.a.salary > 0).map(({ id, a: p, fallback }) => ({
      id: 'i_sal_' + id, name: (p.name.trim() || fallback) + ': salary', kind: 'salary' as const, ownerId: id, amount: p.salary, growth: 0.01,
      startYear: year, inflationAdjusted: true, contributionRate: p.contributionRate, employerMatch: p.employerMatch, matchLimit: p.matchLimit, taxable: true,
    })),
    socialSecurity: people.map(({ id, a: p }) => ({ ownerId: id, pia: setupBenefit(p), claimAge: 67 })),
    expenses: [
      { id: 'e_living', name: 'Living expenses', kind: 'living', amount: a.living, startYear: year, growth: 0 },
      { id: 'e_health', name: 'Out-of-pocket healthcare', kind: 'healthcare', amount: 4000, startYear: Math.max(year, oldest + 60), growth: 0.015 },
    ],
    milestones: [
      { id: 'm_fi', name: 'Financial independence', kind: 'financialIndependence' },
      { id: 'm_ret', name: 'Retirement', kind: 'age', personId: 'p1', age: a.you.retirementAge },
    ],
    strategy: {
      ...base.strategy,
      retirementAge: Object.fromEntries(people.map((p) => [p.id, p.a.retirementAge])),
      cashTarget: Math.round(Math.max(a.cash, a.living / 4)),
      iraContribution: 0,
      rothIraContribution: a.rothIra,
      hsaContribution: a.hsaContribution,
      rothConversionStart: Math.max(year, firstRetirement),
      rothConversionEnd: Math.max(year, oldest + 72),
    },
    assumptions: { ...base.assumptions, state: a.state, filingStatus: a.filingStatus },
    deductions: { itemize: true, propertyTaxRate: a.ownsHome ? 0.011 : 0, charity: 0 },
  };
}

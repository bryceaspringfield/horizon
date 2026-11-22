// The plan a user builds, and what a simulation returns. Money is in nominal dollars of the year it occurs unless a
// field says "today's dollars"; rates are decimals (0.03 is 3%).

export type FilingStatus = 'single' | 'mfj' | 'hoh';

export interface Person {
  id: string;
  name: string;
  birthYear: number;
  /** Age at death, the plan's horizon for this person. */
  lifeExpectancy: number;
}

export type AccountKind =
  | 'cash'
  | 'taxable'
  | 'traditional' // 401(k), 403(b), 457, traditional IRA: pre-tax
  | 'roth' // Roth 401(k), Roth IRA
  | 'hsa'
  | 'college529'
  | 'asset' // home, car, other illiquid asset: no withdrawals
  | 'debt'; // mortgage, loans, credit: a negative balance paid down by a payment

export interface Allocation {
  stocks: number;
  bonds: number;
  cash: number;
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  ownerId: string;
  balance: number;
  /** Taxable accounts: the part of the balance already taxed (the cost basis). */
  costBasis?: number;
  allocation: Allocation;
  /** Assets: a fixed yearly appreciation in place of market returns. */
  appreciation?: number;
  /** Debts: yearly interest rate and the fixed yearly payment. */
  interestRate?: number;
  payment?: number;
  /** Debt tied to an asset (a mortgage on a home): paid off when the asset is sold. */
  securedBy?: string;
  /** Assets: real estate pays property tax, and its secured debt's interest is deductible when itemizing. */
  realEstate?: boolean;
  /** An asset's planned sale year; the proceeds go to the cash account. */
  saleYear?: number;
  /** Yearly expense ratio or fee. */
  fee?: number;
  /** Debts: a yearly payment beyond the required one, to pay the debt off sooner. */
  extraPayment?: number;
  /** An account opened in a later year (a home bought later and its mortgage): zero before, its balance from then. */
  startYear?: number;
}

export type IncomeKind = 'salary' | 'selfEmployment' | 'rental' | 'pension' | 'annuity' | 'other' | 'windfall';

export interface Income {
  id: string;
  name: string;
  kind: IncomeKind;
  ownerId: string;
  /** Yearly amount in today's dollars at the start year. */
  amount: number;
  /** Yearly real growth above inflation (a raise schedule). */
  growth: number;
  startYear: number;
  /** Inclusive; a missing end year runs to the owner's retirement for salary, to death for the rest. */
  endYear?: number;
  /** Whether the amount keeps pace with inflation (a pension without a COLA does not). */
  inflationAdjusted: boolean;
  /** Salary: employee contribution to the owner's workplace plan, as a share of pay, and the employer's match. */
  contributionRate?: number;
  contributionRoth?: boolean;
  employerMatch?: number;
  /** Salary: the share of pay the employer matches at most (e.g., 100% of the first 6%). */
  matchLimit?: number;
  /** Whether the income is taxed as ordinary income (a Roth-like annuity or a gift is not). */
  taxable: boolean;
}

export interface SocialSecurity {
  ownerId: string;
  /** Monthly benefit at full retirement age, in today's dollars (from the SSA statement). */
  pia: number;
  claimAge: number;
}

export type ExpenseKind = 'living' | 'housing' | 'healthcare' | 'education' | 'travel' | 'other' | 'oneTime';

export interface Expense {
  id: string;
  name: string;
  kind: ExpenseKind;
  /** Yearly amount in today's dollars (a one-time expense: its full amount). */
  amount: number;
  startYear: number;
  endYear?: number;
  /** Extra yearly growth above inflation (healthcare often runs 1 to 2 points above). */
  growth: number;
  /** Paid from this 529 account first, where set. */
  fundedBy?: string;
}

export interface Milestone {
  id: string;
  name: string;
  /** A calendar year, or a condition the simulation tests each year. */
  kind: 'year' | 'age' | 'financialIndependence' | 'netWorth';
  year?: number;
  personId?: string;
  age?: number;
  netWorth?: number;
}

export type WithdrawalStep = 'cash' | 'taxable' | 'traditional' | 'roth' | 'hsa';

export interface Strategy {
  /** Retirement: the first year of no salary, per person, by age. */
  retirementAge: Record<string, number>;
  withdrawalOrder: WithdrawalStep[];
  /** Cash kept on hand; surplus above it is invested. */
  cashTarget: number;
  /** Surplus after expenses: the share invested in taxable (the rest stays in cash up to the target). */
  /** Contributions above a workplace plan: yearly IRA, Roth IRA, and HSA amounts while working. */
  iraContribution: number;
  rothIraContribution: number;
  hsaContribution: number;
  /** Roth conversions: fill the federal bracket up to this top rate (0 turns them off), between these years. */
  rothConversionBracket: number;
  rothConversionStart?: number;
  rothConversionEnd?: number;
  /** How a year's withdrawals are drawn: the order above, or from every account in proportion to its balance. */
  withdrawalMethod: 'order' | 'proportional';
  /** Each year, realize taxable gains up to the top of the 0% long-term capital gains band (resetting the basis). */
  harvestZeroGains: boolean;
  /** Retirement spending rule: the plan's expenses, or a fixed share of the portfolio, or guardrails. */
  spending: 'expenses' | 'fixedPercent' | 'guardrails' | 'vpw';
  spendingRate: number;
  /** Safe withdrawal rate the financial independence test uses. */
  safeWithdrawalRate: number;
  /** Glide path: every invested account's stock share moves in a straight line from its own mix at startAge to
   * endStocks at endAge (by its owner's age), the rest in bonds; off when disabled. */
  glidePath?: { enabled: boolean; startAge: number; endAge: number; endStocks: number };
}

export interface Deductions {
  /** Itemize when the total beats the standard deduction: mortgage interest on debts secured by a home, property
   * tax (a yearly share of the home's value), state income tax and property tax up to the SALT cap, and charity. */
  itemize: boolean;
  propertyTaxRate: number;
  /** Yearly charitable giving, today's dollars. */
  charity: number;
}

export interface Healthcare {
  /** Medicare from 65: Part B and Part D premiums with the income-related surcharges (IRMAA) on income two years back. */
  medicare: boolean;
  /** Medicare Part D premium a month before surcharges, today's dollars. */
  partDBase: number;
  /** Insurance from retirement to 65: the benchmark (second-lowest silver) ACA premium a person a year, today's
   * dollars, less the premium tax credit. */
  aca: boolean;
  acaBenchmark: number;
}

export interface Assumptions {
  inflation: number;
  /** Nominal yearly return and volatility of each asset class. */
  returns: { stocks: number; bonds: number; cash: number };
  volatility: { stocks: number; bonds: number; cash: number };
  /** Correlation of stocks and bonds. */
  correlation: number;
  /** Share of a taxable account's return paid as dividends and interest each year. */
  dividendYield: number;
  state: string;
  filingStatus: FilingStatus;
  /** Stress test: stocks fall by this share in this year, in every projection and simulation path. */
  crash?: { enabled: boolean; year: number; drop: number };
}

/** Life events which change the plan from their year: buying a home, a child, a career break, or a pay change. */
export type LifeEvent =
  | { id: string; kind: 'homePurchase'; name: string; year: number; price: number; downPayment: number; rate: number; termYears: number; appreciation: number; closingCosts: number }
  | { id: string; kind: 'child'; name: string; year: number; yearlyCost: number; collegeYearly: number; collegeYears: number }
  | { id: string; kind: 'careerBreak'; name: string; personId: string; year: number; endYear: number }
  | { id: string; kind: 'payChange'; name: string; personId: string; year: number; factor: number };

export interface Plan {
  id: string;
  name: string;
  startYear: number;
  people: Person[];
  accounts: Account[];
  incomes: Income[];
  socialSecurity: SocialSecurity[];
  expenses: Expense[];
  milestones: Milestone[];
  strategy: Strategy;
  assumptions: Assumptions;
  deductions: Deductions;
  healthcare: Healthcare;
  events?: LifeEvent[];
}

/** One year of a plan's projection. */
export interface YearResult {
  year: number;
  ages: Record<string, number>;
  balances: Record<string, number>;
  netWorth: number;
  liquidNetWorth: number;
  income: Record<string, number>;
  socialSecurity: number;
  expenses: Record<string, number>;
  totalExpenses: number;
  contributions: Record<string, number>;
  employerMatch: number;
  withdrawals: Record<string, number>;
  rmd: number;
  rothConversion: number;
  taxes: {
    federal: number;
    state: number;
    fica: number;
    capitalGains: number;
    niit: number;
    penalty: number;
    /** Medicare premiums with surcharges, and ACA premiums net of the credit, paid this year. */
    medicare: number;
    aca: number;
    itemized: boolean;
    deduction: number;
    total: number;
    taxableIncome: number;
    marginalRate: number;
    effectiveRate: number;
  };
  investmentReturn: number;
  shortfall: number;
  milestonesReached: string[];
}

export interface Projection {
  years: YearResult[];
  /** The first year with expenses not met, or null. */
  depletionYear: number | null;
  /** The first year the portfolio covers expenses at the safe withdrawal rate. */
  financialIndependenceYear: number | null;
  /** Net worth at the end, in today's dollars. */
  endingNetWorthReal: number;
}

/** A path of yearly asset returns a simulation follows; the deterministic run uses the means. */
export interface ReturnPath {
  stocks: number[];
  bonds: number[];
  cash: number[];
  inflation: number[];
}

// The plan a user builds, and what a simulation returns. Money is in nominal dollars of the year it occurs unless a
// field says "today's dollars"; rates are decimals (0.03 is 3%).

export type FilingStatus = 'single' | 'mfj' | 'hoh';

export interface Person {
  /** Keep this person's own plan-to age and retirement age when the plan sets one for everyone. */
  ownPlanTo?: boolean;
  ownRetirementAge?: boolean;
  id: string;
  name: string;
  birthYear: number;
  /** Age at death, the plan's horizon for this person. */
  lifeExpectancy: number;
  /** Details for the expected age at death (engine/lifespan.ts), which fills lifeExpectancy unless ownLife is set. */
  birthDate?: string;
  sex?: 'male' | 'female' | 'unknown';
  race?: 'all' | 'hispanic' | 'aian' | 'asian' | 'black' | 'white';
  conditions?: string[];
  ownLife?: boolean;
  /** Food (engine/food.ts): the USDA food plan level, the diet, and whether someone outside the plan pays for the food. */
  foodPlan?: import('./food').FoodPlan;
  diet?: import('./food').Diet;
  foodPaidByOthers?: boolean;
  /** Dates this person joins and leaves the household (a partner moving in, a parent moving out); outside them the
   * person's income, benefits, and costs are not the plan's. */
  joins?: string;
  leaves?: string;
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
  /** Taxable accounts: the share of bond income from in-state municipal bonds, free of income tax. */
  municipalShare?: number;
  /** Debts: a line of credit (a HELOC) with this limit, drawn on when the other accounts run dry. */
  creditLimit?: number;
  name: string;
  kind: AccountKind;
  ownerId: string;
  balance: number;
  /** Taxable accounts: the part of the balance already taxed (the cost basis). */
  costBasis?: number;
  allocation: Allocation;
  /** Assets: a fixed yearly appreciation in place of market returns. */
  appreciation?: number;
  /** Credit cards (debts): the share of the year's spending charged to the card, and the cash back it earns on that
   * spending (0.015 for 1.5%). Cash back is a rebate on purchases, not taxed income (IRS). */
  /** Credit cards: paid in full every month, so the card never carries a balance or charges interest. */
  paidInFull?: boolean;
  cardSpendShare?: number;
  cashBackRate?: number;
  /** Credit cards: earning rates by category or overall (engine/cards.ts), and the yearly fee; with rates set, the card
   * earns on each category's spending it wins, in place of the flat share and rate above. */
  rewards?: import('./cards').RewardRate[];
  annualFee?: number;
  /** When the account's money can be drawn: always (the default), from its qualified age, from a year, or never (an
   * account kept whole, such as one held for a goal). */
  withdrawRule?: 'always' | 'qualifiedAge' | 'year' | 'never';
  /** The age from which withdrawals are qualified (no early penalty); 59.5 for retirement accounts where unset. */
  qualifiedAge?: number;
  withdrawYear?: number;
  /** When the account counts as liquid for financial independence and invested-asset milestones: now (the default for
   * cash and investment accounts), from a year, from its qualified age, or never. */
  liquidFrom?: 'now' | 'year' | 'qualifiedAge' | 'never';
  liquidYear?: number;
  /** Assets: a collectible (coins, trading cards, plush toys, art), whose sale gain is taxed as ordinary income (the
   * collectibles rate is capped at 28%; ordinary rates reach 28% only past the 24% bracket). */
  collectible?: boolean;
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
  /** Inherited IRAs: the year inherited; the 10-year rule empties the account by the tenth year after. */
  inheritedYear?: number;
  /** Debts: the balance left is forgiven in this year (student loan forgiveness). */
  forgiveYear?: number;
  /** Debts: the forgiven balance is not income (Public Service Loan Forgiveness); otherwise it is taxed, as income-driven
   * repayment forgiveness is from 2026. */
  forgivenTaxFree?: boolean;
  /** Assets: yearly rent (today's dollars), the share lost to vacancy, and yearly costs as a share of the rent. */
  rent?: number;
  vacancy?: number;
  rentalCosts?: number;
  /** A yearly return of its own (nominal, after fees), in place of the allocation's mix of market returns. */
  customReturn?: number;
  /** Taxable accounts: dividends and interest paid out to cash each year in place of being reinvested. */
  dividendsPaidOut?: boolean;
  /** The currency the balance is held in (ISO 4217), where it differs from the plan's (engine/currency.ts). */
  currency?: string;
  /** Assets: the home you live in. Its sale excludes $250,000 of gain a person ($500,000 for a couple filing jointly). */
  primaryResidence?: boolean;
  /** Assets: selling costs as a share of the sale price (agent fees, transfer taxes). */
  sellingCosts?: number;
  /** A return tied to inflation: each year's inflation plus this fixed rate (Series I savings bonds, TIPS held to
   * maturity), in place of the allocation's market returns. */
  inflationLinked?: number;
  /** Taxable accounts: foreign tax withheld on the dividends, as a share of them (the credit's passive basket). */
  foreignWithholding?: number;
}

/** An amount which changes from a year on: the new yearly amount, in the item's own dollars. */
export interface Step {
  year: number;
  amount: number;
  /** The exact date the new amount starts (a raise on April 1); the year's amount blends the old and the new. */
  date?: string;
  /** The new amount is in the future dollars of its own date (a raise already announced), not today's dollars. */
  nominal?: boolean;
}

export type IncomeKind = 'salary' | 'selfEmployment' | 'rental' | 'pension' | 'annuity' | 'other' | 'windfall' | 'rsu' | 'bonus' | 'accountBonus' | 'settlement' | 'options';

export interface PayDeduction {
  name: string;
  amount: number;
  per: 'year' | 'paycheck';
  treatment: 'all' | 'incomeTax' | 'none';
  nominal?: boolean;
}

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
  /** The workplace contribution as a yearly amount (today's dollars) in place of a share of pay; set, it wins. */
  contributionAmount?: number;
  /** Salary: deductions taken from each paycheck other than retirement contributions (health, dental, and vision
   * premiums, an FSA, commuter benefits, union dues): each an amount a year or a paycheck, in today's dollars unless
   * nominal, and its tax treatment: excluded from all taxable wages (a section 125 plan: income and payroll tax),
   * excluded from federal and state income tax only, or not excluded. */
  deductions?: PayDeduction[];
  /** Salary: paychecks a year, for deductions set a paycheck (26 biweekly, 24 semimonthly, 52 weekly, 12 monthly). */
  paychecks?: number;
  /** The year from which the amount keeps up with inflation; before it, the amount stays as entered (a salary frozen
   * until a review). Unset, from the start. */
  indexFrom?: number;
  /** Exact start and end points (engine/dates.ts): a date, a life event, a milestone, an age, or retirement; set, they
   * replace startYear and endYear, and each year's amount is prorated by the share of the year the income runs. */
  start?: import('./dates').DateRef;
  end?: import('./dates').DateRef;
  contributionRoth?: boolean;
  employerMatch?: number;
  /** Salary: the employer's yearly deposit into the owner's HSA (today's dollars), free of income and payroll tax. */
  employerHsa?: number;
  /** Salary: the share of pay the employer matches at most (e.g., 100% of the first 6%). */
  matchLimit?: number;
  /** Account bonuses (one-time, paid in startYear): where the bonus comes from. A card's spending bonus is a rebate
   * (untaxed); a bank's is interest and a brokerage's or a referral's other income (taxed, 1099-INT or 1099-MISC). */
  bonusSource?: 'card' | 'bank' | 'brokerage' | 'referral';
  /** Account bonuses: what earns the bonus, for the user's own tracking (spend $4,000 in 3 months; keep $15,000 for 90 days). */
  requirement?: string;
  /** Whether the income is taxed as ordinary income (a Roth-like annuity or a gift is not). */
  taxable: boolean;
  /** RSUs: the grant vests in equal parts over these years from startYear; vested shares are taxed as wages and kept
   * in the taxable account (their value is the basis). */
  vestYears?: number;
  /** Stock options, exercised and held in startYear: the type, shares, strike, and the share price today with its growth a
   * year. NSOs: the spread is wages, the shares' basis their value; ISOs: the shares' basis is 0, the gain taxed on sale
   * (the ISO spread counts toward the AMT in the exercise year). */
  options?: { type: 'nso' | 'iso'; shares: number; strike: number; price: number; growth: number };
  /** RSUs: nothing vests during these first years; the parts held back then vest together (a one-year cliff: 1). */
  vestCliffYears?: number;
  /** Salary: a yearly bonus as a share of the salary, paid and taxed with it. */
  bonusRate?: number;
  /** Salary: the share of the workplace contribution going to the Roth side (0 to 1); overrides contributionRoth. */
  contributionRothShare?: number;
  /** Changes of the yearly amount from a year on (a promotion, a part-time stretch). */
  steps?: Step[];
  /** The amounts are in future (nominal) dollars of their own year, in place of today's dollars. */
  nominal?: boolean;
  /** Self-employment: a specified service business (law, health, consulting...), whose QBI deduction ends above the
   * phase-in range; other businesses here phase out too, since a sole owner has no W-2 wages or property to count. */
  serviceBusiness?: boolean;
  /** The currency the amounts are in, where it differs from the plan's. */
  currency?: string;
  /** Self-employment: the yearly health insurance premium (today's dollars), deducted from income up to the business's profit. */
  healthPremium?: number;
  /** Self-employment with a solo 401(k) or SEP IRA: the employer contribution as a share of net earnings (at most 20%
   * for a sole owner), on top of the deferral set by contributionRate (a solo 401(k) only). */
  employerContributionRate?: number;
  /** A US person abroad: the pay is for work done while living abroad (it qualifies for the foreign earned income
   * exclusion), and whether US Social Security and Medicare tax is still owed on it (a US employer). */
  abroad?: boolean;
  usPayroll?: boolean;
  /** Income tax paid to a foreign country on this income, as a share of it; it feeds the foreign tax credit. */
  foreignTaxRate?: number;
}

export interface SocialSecurity {
  ownerId: string;
  /** Monthly benefit at full retirement age, in today's dollars (from the SSA statement). */
  pia: number;
  claimAge: number;
  /** Disability benefits (SSDI) in place of a retirement claim: the full benefit, unreduced, from 5 months after the
   * disability's onset date, turning into the same retirement benefit at full retirement age; Medicare from 24 months
   * after benefits start. */
  ssdi?: boolean;
  ssdiOnset?: string;
}

export type ExpenseKind = 'living' | 'housing' | 'healthcare' | 'education' | 'travel' | 'other' | 'oneTime' | 'insurance' | 'longTermCare' | 'childcare' | 'transportation' | 'pets' | 'homeProjects';

export interface Expense {
  id: string;
  name: string;
  kind: ExpenseKind;
  /** Spending to be paid back (a work trip, a purchase for someone): the share repaid, and the years after the spending
   * when the repayment arrives (0: the same year). The repayment is untaxed; the card's cash back on the spending stays. */
  reimbursedShare?: number;
  reimbursedAfterYears?: number;
  /** Stretches during which someone outside the plan pays all or part of this expense (parents, an employer, a partner
   * outside the plan): each from a date to an optional end date (none: for good), the share they pay, and who. */
  paidBy?: { from: string; to?: string; share: number; who?: string }[];
  /** Paid through a workplace health or dependent-care FSA: the amount (up to the year's limit) leaves taxable pay. */
  fsa?: boolean;
  /** A share of income in place of a fixed amount (dues, tithes, giving goals): of pay (salary and self-employment) or
   * of all income (Social Security and the rest too), each year it runs. */
  incomeShare?: number;
  /** Exact start and end points (engine/dates.ts), as for incomes. */
  start?: import('./dates').DateRef;
  end?: import('./dates').DateRef;
  incomeBasis?: 'pay' | 'all';
  /** The spending category for card rewards (engine/cards.ts), where the guess from the name is wrong. */
  spendCategory?: import('./cards').SpendCategory;
  /** Whether the spending goes on a card; unset, all but rent and mortgage do. */
  onCard?: boolean;
  /** Yearly amount in today's dollars (a one-time expense: its full amount). */
  amount: number;
  startYear: number;
  endYear?: number;
  /** Extra yearly growth above inflation (healthcare often runs 1 to 2 points above). */
  growth: number;
  /** Paid from this 529 account first, where set. */
  fundedBy?: string;
  steps?: Step[];
  nominal?: boolean;
  /** The currency the amounts are in, where it differs from the plan's. */
  currency?: string;
  /** The share of the expense which can be cut in a bad stretch (0: essential; 1: wholly discretionary); used by flexible spending. */
  discretionary?: number;
  /** Who spends it: a person's id, or the household where unset. */
  spender?: string;
  /** Recurs every this many years from its start (a car every 8 years); every year where unset. */
  everyYears?: number;
  /** Shared household cost: scaled by the square root of the household's size against the first year's (the OECD's
   * square-root equivalence scale: two people cost about 1.41 times one). */
  scalesWithHousehold?: boolean;
  /** Healthcare: the amount is the year's expected medical bills, and the plan pays them as insurance does: the
   * deductible first, then the coinsurance share, up to the out-of-pocket maximum (today's dollars). */
  coverage?: { deductible: number; coinsurance: number; oopMax: number };
}

export interface Milestone {
  id: string;
  name: string;
  /** A calendar year, or a condition the simulation tests each year. */
  kind: 'year' | 'age' | 'financialIndependence' | 'netWorth' | 'liquidNetWorth' | 'coastFi' | 'debtFree' | 'all';
  year?: number;
  personId?: string;
  age?: number;
  netWorth?: number;
  /** kind 'all': reached in the first year every condition holds. */
  conditions?: { kind: 'year' | 'age' | 'financialIndependence' | 'netWorth' | 'liquidNetWorth' | 'coastFi' | 'debtFree'; year?: number; personId?: string; age?: number; netWorth?: number }[];
  /** People who retire when this milestone is reached, in place of their retirement age. */
  retires?: string[];
}

export type WithdrawalStep = 'cash' | 'taxable' | 'traditional' | 'roth' | 'hsa';

export interface Strategy {
  /** Choose Roth or traditional for each year's contributions: Roth while the year's marginal rate is at or below the
   * expected rate in retirement, traditional above it (engine/simulate.ts rothSplit). */
  autoRoth?: boolean;
  /** The most converted to Roth in a year (today's dollars), under the bracket fill; unset, no cap. */
  rothConversionCap?: number;
  /** Retirement: the first year of no salary, per person, by age. */
  retirementAge: Record<string, number>;
  withdrawalOrder: WithdrawalStep[];
  /** A second withdrawal order, used from this year on (after a milestone such as Medicare or the end of conversions). */
  withdrawalOrderLater?: { year: number; order: WithdrawalStep[]; /** From the year after this milestone is reached, in place of the year. */ milestoneId?: string };
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
  /** Keep ordinary taxable income under this limit when drawing from traditional accounts: a bracket's top rate, the
   * first IRMAA tier, or 400% of the poverty line (the ACA credit's end); other accounts cover the rest. */
  /** Shield 'aca': the multiple of the poverty line to keep income under (4 where unset; 1.38 for Medicaid, 2.5 for
   * cost-sharing reductions). */
  fplMultiple?: number;
  shield?: 'none' | 'bracket12' | 'bracket22' | 'bracket24' | 'irmaa' | 'aca';
  /** Conversions of a set amount (today's dollars) in a set year, on top of the bracket-filling ones. */
  manualConversions?: { year: number; amount: number }[];
  /** 72(t) substantially equal periodic payments from the traditional accounts, penalty-free, from this year until
   * the later of five years and age 59½ (amortization method at a 5% rate). */
  sepp?: { enabled: boolean; startYear: number };
  /** Backdoor Roth: the Roth IRA amount goes in through a nondeductible IRA when income passes the Roth IRA limit.
   * Without it, the Roth IRA contribution shrinks through the IRS phase-out range. */
  backdoorRoth?: boolean;
  /** Mega backdoor Roth: after-tax 401(k) contributions converted to Roth, a year (today's dollars), within the
   * 415(c) total limit less the year's deferrals and match. */
  megaBackdoor?: number;
  /** Leftover pay after the cash target: invest it, or pay debts down first (highest rate first). */
  surplusTo?: 'invest' | 'debt';
  /** Retirement spending rule: the plan's expenses, or a fixed share of the portfolio, or guardrails. */
  spending: 'expenses' | 'fixedPercent' | 'guardrails' | 'vpw' | 'textbook' | 'cape';
  /** Spending rule 'cape': the market's CAPE ratio today, the base rate, and the weight on the earnings yield (1/CAPE). */
  cape?: { now: number; base: number; weight: number };
  spendingRate: number;
  /** Safe withdrawal rate the financial independence test uses. */
  safeWithdrawalRate: number;
  /** Glide path: every invested account's stock share moves in a straight line from its own mix at startAge to
   * endStocks at endAge (by its owner's age), the rest in bonds; off when disabled. */
  glidePath?: { enabled: boolean; startAge: number; endAge: number; endStocks: number };
  /** Money moved between accounts on a schedule (today's dollars a year), with the tax the move causes: a
   * traditional-to-Roth move is a conversion, a traditional withdrawal is income, a taxable sale realizes gains. */
  transfers?: Transfer[];
  /** Qualified charitable distributions: from 70½ (counted from 71), the plan's charity paid from traditional IRAs, up
   * to the yearly limit; it counts toward the RMD and is not income. */
  qcd?: boolean;
  /** Flexible spending: while the portfolio (today's dollars) sits this share under its high, the discretionary share of every
   * expense is cut by `cut`; while it sits `rise` above where it began, discretionary spending is raised by `boost`. */
  flex?: { enabled: boolean; drop: number; cut: number; rise?: number; boost?: number };
  /** Count real assets (a home, net of its mortgage) in the financial independence test and the net worth milestones. */
  fiCountsRealAssets?: boolean;
}

export interface Transfer {
  id: string;
  name: string;
  from: string;
  to: string;
  amount: number;
  startYear: number;
  endYear?: number;
}

export interface Deductions {
  /** Itemize when the total beats the standard deduction: mortgage interest on debts secured by a home, property
   * tax (a yearly share of the home's value), state income tax and property tax up to the SALT cap, and charity. */
  itemize: boolean;
  propertyTaxRate: number;
  /** Yearly charitable giving, today's dollars. */
  charity: number;
  /** Count only the interest on the first $750,000 of home debt ($1,000,000 for debt from before December 16, 2017). */
  mortgageDebtLimit?: number;
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
  /** A Medicare supplement (Medigap) or Advantage premium a person a month from 65, today's dollars. */
  medigap?: number;
}

export interface LocalTax {
  kind: 'none' | 'nyc' | 'wages' | 'income';
  rate?: number;
  name?: string;
}

export interface Assumptions {
  /** How metrics are figured (ProjectionLab's Metrics settings): which debts liquid net worth subtracts (none, the
   * unsecured ones, or all, real-asset loans included), and the share of the estate left to charity in net legacy. */
  metrics?: { liquidDebts?: 'none' | 'unsecured' | 'all'; charityShare?: number; taxRateBase?: 'gross' | 'agi' | 'taxable'; spendingWithTaxes?: boolean };
  /** Plan everyone to one age, or to one calendar year, except people who keep their own (Person.ownPlanTo). */
  planTo?: { mode: 'person' | 'age' | 'year'; age?: number; year?: number };
  /** One retirement age for everyone, except people who keep their own (Person.ownRetirementAge). */
  retirementAgeAll?: number;
  inflation: number;
  /** Nominal yearly return and volatility of each asset class. */
  returns: { stocks: number; bonds: number; cash: number };
  volatility: { stocks: number; bonds: number; cash: number };
  /** Correlation of stocks and bonds. */
  correlation: number;
  /** Assumptions by horizon (engine/assumptions.ts): bands from the first year through a year count, each setting any of
   * inflation and the three returns; the single values above fill the rest and every year after the last band. */
  horizons?: import('./assumptions').HorizonBand[];
  /** Share of a taxable account's return paid as dividends and interest each year. */
  dividendYield: number;
  state: string;
  filingStatus: FilingStatus;
  /** Local income tax where you live now (a move event can change it). */
  local?: LocalTax;
  /** Stress test: stocks fall by this share in this year, in every projection and simulation path. */
  crash?: { enabled: boolean; year: number; drop: number };
  /** The tax model: United States rules, or one flat rate on all income in place of every income and payroll tax. */
  taxModel?: { kind: 'us' | 'flat'; rate: number };
  /** A yearly change of Social Security benefits beside inflation (-0.005: cost-of-living raises half a point under inflation). */
  benefitCola?: number;
  /** Social Security follows SSA's announced COLAs for the years they are known (on unless set false). */
  announcedCola?: boolean;
  /** The country whose taxes apply (engine/uk.ts): the United States where unset. */
  taxCountry?: 'US' | 'UK' | 'AU' | 'CA' | 'DE' | 'NL' | 'ES';
  /** UK: a Scottish taxpayer, and a quarter of each pension withdrawal taken tax-free (engine/uk.ts). */
  scotland?: boolean;
  /** Germany: church tax rate for members (0.08 in Bavaria and Baden-Wuerttemberg, 0.09 elsewhere), and no children. */
  deChurch?: number;
  deChildless?: boolean;
  ukLumpSum?: boolean;
  /** Canada: the province or territory, two letters (engine/ca.ts); Ontario where unset. */
  province?: string;
  /** The share of taxable accounts' dividends which are qualified (taxed at capital gains rates); the rest is ordinary. 1 where unset. */
  qualifiedDividendShare?: number;
  /** Exchange-rate assumptions by foreign currency: units of the plan's currency for one unit today, and the rate's
   * yearly change (0.02: the foreign currency gains 2% a year on the plan's). */
  fx?: Record<string, { rate: number; drift: number }>;
  /** A US person living abroad: claim the foreign earned income exclusion (section 911), with the yearly qualifying
   * housing cost (today's dollars) for the housing exclusion. Without it, foreign tax paid is credited in full. */
  expat?: { exclusion: boolean; housing: number };
}

/** Life events which change the plan from their year: buying a home, a child, a career break, or a pay change. */
/** A life event, with an exact date and end date where the user sets them (the year alone otherwise). */
export type LifeEvent = { date?: string; endDate?: string } & (
  | { id: string; kind: 'homePurchase'; name: string; year: number; price: number; downPayment: number; rate: number; termYears: number; appreciation: number; closingCosts: number }
  | { id: string; kind: 'child'; name: string; year: number; yearlyCost: number; collegeYearly: number; collegeYears: number }
  | { id: string; kind: 'birth'; name: string; year: number; cover: import('./lifeCosts').BirthCover; cesarean: boolean; cost?: number; yearlyCost: number; collegeYearly: number; collegeYears: number }
  | { id: string; kind: 'adoption'; name: string; year: number; route: import('./lifeCosts').AdoptionRoute; cost?: number; yearlyCost: number; collegeYearly: number; collegeYears: number }
  | { id: string; kind: 'wedding'; name: string; year: number; style: import('./lifeCosts').WeddingStyle; guests: number; days: number; locations: number; destination: import('./lifeCosts').Destination; cost?: number }
  | { id: string; kind: 'careerBreak'; name: string; personId: string; year: number; endYear: number }
  | { id: string; kind: 'payChange'; name: string; personId: string; year: number; factor: number }
  | { id: string; kind: 'move'; name: string; year: number; state: string; local?: LocalTax }
  | { id: string; kind: 'inheritance'; name: string; year: number; amount: number; asIra: boolean }
  | { id: string; kind: 'annuity'; name: string; year: number; premium: number; fromAccount?: string; payoutRate: number; payoutYear: number; personId: string; inflationAdjusted?: boolean }
  | { id: string; kind: 'recurring'; name: string; year: number; amount: number; everyYears: number; endYear: number }
  | { id: string; kind: 'separation'; name: string; year: number; personId: string; keepShare: number; expenseFactor: number; support: number; supportYears: number }
  | { id: string; kind: 'rentalProperty'; name: string; year: number; price: number; downPayment: number; rate: number; termYears: number; rent: number; vacancy: number; costs: number; appreciation: number }
);

export interface Estate {
  /** Income tax rate the heirs pay on inherited traditional accounts (withdrawn over ten years). */
  heirsTaxRate: number;
  /** Federal estate tax exemption a person, 2026 ($15,000,000 under the 2025 act, indexed after); the excess is taxed
   * at 40%. */
  exemption: number;
  /** Who inherits, for state inheritance taxes (children and grandchildren, siblings, or others), and how many. */
  heirs?: 'children' | 'siblings' | 'others';
  heirCount?: number;
  /** Costs of settling the estate: selling real assets (a share of their value), administration (a share of the gross
   * estate), and, without a stepped-up basis, capital gains tax on taxable accounts' unrealized gains at this rate. */
  liquidationShare?: number;
  adminShare?: number;
  steppedUp?: boolean;
  gainsRate?: number;
}

export interface Plan {
  id: string;
  name: string;
  /** The spending log: transactions from uploaded statements (engine/statements.ts). */
  transactions?: import('./statements').Txn[];
  /** The currency every result is shown in (ISO 4217); US dollars where unset. */
  currency?: string;
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
  estate?: Estate;
  /** Free notes printed with the plan report. */
  notes?: string;
  /** The plan starts from the current year with today's balances, as ProjectionLab's default plans do; unset, it keeps its
   * start year (a fixed-date plan, whose recorded balances show how the forecast held up). */
  rollingStart?: boolean;
  /** The plan's people, first year, and accounts are copied from the main plan and kept in step with it. */
  followsMain?: boolean;
}

/** One year of a plan's projection. */
export interface YearResult {
  year: number;
  ages: Record<string, number>;
  balances: Record<string, number>;
  /** Taxable accounts' cost basis at the year's end. */
  basis?: Record<string, number>;
  netWorth: number;
  liquidNetWorth: number;
  income: Record<string, number>;
  socialSecurity: number;
  expenses: Record<string, number>;
  totalExpenses: number;
  /** Spending as the Metrics settings count it: expenses, plus taxes when chosen. */
  spending?: number;
  contributions: Record<string, number>;
  employerMatch: number;
  withdrawals: Record<string, number>;
  rmd: number;
  rothConversion: number;
  /** Qualified charitable distributions and scheduled transfers this year. */
  qcd?: number;
  transfers?: number;
  /** Net worth without real assets and the debts they secure. */
  financialNetWorth?: number;
  taxes: {
    federal: number;
    state: number;
    fica: number;
    capitalGains: number;
    niit: number;
    penalty: number;
    /** The qualified business income deduction taken. */
    qbi?: number;
    /** Medicare premiums with surcharges, and ACA premiums net of the credit, paid this year. */
    medicare: number;
    aca: number;
    credits?: number;
    amt?: number;
    local?: number;
    /** Tax on the gain of real estate and other assets sold this year is inside capitalGains; the gain itself and the home-sale exclusion used. */
    assetGain?: number;
    homeExclusion?: number;
    /** Foreign income tax paid, the foreign tax credit taken, and the income left out by the foreign earned income exclusion. */
    foreign?: number;
    foreignCredit?: number;
    foreignExclusion?: number;
    /** Federal estate tax if the last person died this year. */
    estate?: number;
    itemized: boolean;
    deduction: number;
    total: number;
    taxableIncome: number;
    ordinaryTaxable?: number;
    marginalRate: number;
    effectiveRate: number;
  };
  investmentReturn: number;
  shortfall: number;
  /** The change flexible spending made to the year's expenses (negative: a cut), and the year's discretionary spending. */
  flexChange?: number;
  discretionary?: number;
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

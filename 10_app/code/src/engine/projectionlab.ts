// Import from ProjectionLab: reads the JSON file of its "Export Data" action (Account Settings, Data) into Horizon plans.
//
// ProjectionLab publishes no schema for the file, so this reader is tolerant: each value is looked up under the several
// names seen for it, a missing value takes Horizon's default, and everything which did not come across is listed in the
// report shown after the import. One Horizon plan is built for each ProjectionLab plan; all share the people and the
// current accounts, assets, and debts (ProjectionLab's "Current Finances").
import { examplePlan, uid } from './defaults';
import { estimatePia } from './retirement';
import type { Account, AccountKind, Expense, ExpenseKind, FilingStatus, Income, IncomeKind, Milestone, Plan } from './types';

type Obj = Record<string, unknown>;
export interface ImportReport {
  plans: Plan[];
  /** What came across, as counts by kind. */
  imported: { label: string; count: number }[];
  /** Items left out or changed, each with the reason. */
  notes: string[];
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : isObj(v) && Array.isArray(v.events) ? v.events.filter(isObj) : []);
/** The first of the keys with a finite number (a numeric string counts). */
function num(o: Obj, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
function str(o: Obj, ...keys: string[]): string | undefined {
  for (const k of keys) if (typeof o[k] === 'string' && o[k] !== '') return o[k] as string;
  return undefined;
}
/** A rate written as 7 or as 0.07. */
const rate = (n: number | undefined): number | undefined => (n === undefined ? undefined : Math.abs(n) > 1 ? Math.round(n * 1e6) / 1e8 : n);
const slug = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Whether a file looks like a ProjectionLab export. */
export function isProjectionLabExport(data: unknown): boolean {
  const d = obj(data);
  return isObj(d.today) && Array.isArray(d.plans) && d.plans.some((p) => isObj(p) && (isObj(p.income) || isObj(p.expenses) || isObj(p.variables)));
}

const ACCOUNT_KINDS: [RegExp, AccountKind][] = [
  [/roth/, 'roth'],
  [/hsa/, 'hsa'],
  [/529|college|education/, 'college529'],
  [/401k|403b|457|ira|tsp|pension|sep|simple|traditional|pretax|taxdeferred|rrsp|sipp|super/, 'traditional'],
  [/savings|checking|cash|moneymarket|cd$/, 'cash'],
];
const accountKind = (type: string | undefined, name: string | undefined): AccountKind => {
  const t = slug(type) || slug(name);
  return ACCOUNT_KINDS.find(([re]) => re.test(t))?.[1] ?? 'taxable';
};

const INCOME_KINDS: [RegExp, IncomeKind][] = [
  [/rsu|stock/, 'rsu'], [/selfemploy|business|freelance|side/, 'selfEmployment'], [/rent/, 'rental'], [/pension/, 'pension'], [/annuity/, 'annuity'],
  [/inherit|windfall|gift|bonus|sale/, 'windfall'], [/salary|wage|job|work|parttime/, 'salary'],
];
const EXPENSE_KINDS: [RegExp, ExpenseKind][] = [
  [/rent|housing|mortgage|home|propertytax|utilities/, 'housing'], [/health|medical|insurance|dental/, 'healthcare'], [/college|tuition|education|school|childcare/, 'education'],
  [/travel|vacation/, 'travel'], [/living|spending|general|food|groceries/, 'living'],
];
const kindOf = <K>(table: [RegExp, K][], fallback: K, ...texts: (string | undefined)[]): K => {
  for (const t of texts) { const hit = table.find(([re]) => re.test(slug(t))); if (hit) return hit[1]; }
  return fallback;
};

/** Amounts a year from an amount and its frequency. */
function yearly(amount: number, frequency: string | undefined): { amount: number; once: boolean } {
  const f = slug(frequency);
  if (/once|onetime|single/.test(f)) return { amount, once: true };
  const times = /semimonth|twiceamonth/.test(f) ? 24 : /biweek|everytwoweeks|fortnight/.test(f) ? 26 : /week/.test(f) ? 52 : /quarter/.test(f) ? 4 : /month/.test(f) ? 12 : 1;
  return { amount: amount * times, once: false };
}

export function importProjectionLab(data: unknown, year = new Date().getFullYear()): ImportReport {
  const root = obj(data);
  const today = obj(root.today);
  const notes: string[] = [];
  const counts = new Map<string, number>();
  const count = (label: string, n = 1) => counts.set(label, (counts.get(label) ?? 0) + n);

  // People: "me" and, for a couple, "spouse".
  const birth = (age: number | undefined, by: number | undefined, fallback: number) => by ?? (age !== undefined ? year - Math.round(age) : fallback);
  const couple = /couple|married|partner/.test(slug(str(today, 'partnerStatus', 'relationshipStatus'))) || num(today, 'spouseAge', 'spouseBirthYear', 'partnerAge') !== undefined;
  const people = [{ id: 'p1', name: str(today, 'yourName', 'name', 'firstName') ?? 'You', birthYear: birth(num(today, 'age', 'yourAge'), num(today, 'birthYear', 'yourBirthYear'), year - 35), lifeExpectancy: 92 }];
  if (num(today, 'age', 'yourAge', 'birthYear', 'yourBirthYear') === undefined) notes.push('Your age was not found in the file; 35 is assumed. Set your birth year on the People page.');
  if (couple) people.push({ id: 'p2', name: str(today, 'spouseName', 'partnerName') ?? 'Partner', birthYear: birth(num(today, 'spouseAge', 'partnerAge'), num(today, 'spouseBirthYear', 'partnerBirthYear'), people[0].birthYear), lifeExpectancy: 95 });
  count('people', people.length);
  const owner = (o: Obj) => (couple && /spouse|partner/.test(slug(str(o, 'owner', 'person'))) ? 'p2' : 'p1');

  // Current finances: savings, investments, assets (with the loan on each), and debts.
  const none = { stocks: 0, bonds: 0, cash: 0 };
  const accounts: Account[] = [];
  const ids = new Map<string, string>();
  const idFor = (o: Obj, prefix: string) => { const id = prefix + uid(); const old = str(o, 'id'); if (old) ids.set(old, id); return id; };
  for (const a of list(today.savingsAccounts)) {
    accounts.push({ id: idFor(a, 'a_'), name: str(a, 'name', 'title') ?? 'Savings', kind: 'cash', ownerId: owner(a), balance: num(a, 'balance', 'amount') ?? 0, allocation: { stocks: 0, bonds: 0, cash: 1 } });
    count('savings accounts');
  }
  for (const a of list(today.investmentAccounts)) {
    const kind = accountKind(str(a, 'type', 'accountType'), str(a, 'name'));
    const balance = num(a, 'balance', 'amount') ?? 0;
    const basis = num(a, 'costBasis', 'basis');
    const stocks = rate(num(a, 'stockAllocation', 'stocks'));
    accounts.push({
      id: idFor(a, 'a_'), name: str(a, 'name', 'title') ?? 'Investments', kind, ownerId: owner(a), balance,
      ...(kind === 'taxable' ? { costBasis: Math.min(balance, basis ?? Math.round(balance * 0.75)) } : {}),
      allocation: kind === 'cash' ? { stocks: 0, bonds: 0, cash: 1 } : stocks !== undefined ? { stocks, bonds: 1 - stocks, cash: 0 } : { stocks: 0.9, bonds: 0.1, cash: 0 },
    });
    if (kind === 'taxable' && basis === undefined && balance > 0) notes.push(`"${str(a, 'name') ?? 'Investments'}": no cost basis in the file; three quarters of the balance is assumed.`);
    count('investment accounts');
  }
  for (const a of list(today.assets)) {
    const name = str(a, 'name', 'title') ?? 'Asset';
    const realEstate = /realestate|home|house|property|land|condo/.test(slug(str(a, 'type')) + slug(name));
    const id = idFor(a, 'a_');
    accounts.push({ id, name, kind: 'asset', ownerId: owner(a), balance: num(a, 'amount', 'value', 'currentValue', 'initialValue') ?? 0, allocation: none,
      appreciation: rate(num(a, 'appreciation', 'appreciationRate', 'growthRate')) ?? (realEstate ? 0.03 : 0), ...(realEstate ? { realEstate: true } : {}) });
    count('assets');
    const loan = num(a, 'balance', 'loanBalance', 'mortgageBalance');
    if (loan !== undefined && loan > 0) {
      const monthly = num(a, 'monthlyPayment', 'payment');
      accounts.push({ id: 'a_' + uid(), name: name + ': loan', kind: 'debt', ownerId: owner(a), balance: loan, allocation: none,
        interestRate: rate(num(a, 'interestRate', 'rate')) ?? 0.065, payment: Math.round((monthly ?? loan / 12 / 20) * 12), securedBy: id });
      if (monthly === undefined) notes.push(`"${name}": the loan's payment was not found; a 20-year payoff is assumed. Set the payment on the Accounts page.`);
      count('debts');
    }
  }
  for (const a of list(today.debts)) {
    const balance = num(a, 'amount', 'balance') ?? 0;
    const monthly = num(a, 'monthlyPayment', 'payment');
    accounts.push({ id: idFor(a, 'a_'), name: str(a, 'name', 'title') ?? 'Debt', kind: 'debt', ownerId: owner(a), balance, allocation: none,
      interestRate: rate(num(a, 'interestRate', 'rate')) ?? 0.07, payment: Math.round((monthly ?? balance / 12 / 10) * 12) });
    if (monthly === undefined && balance > 0) notes.push(`"${str(a, 'name') ?? 'Debt'}": no payment in the file; a 10-year payoff is assumed.`);
    count('debts');
  }
  if (!accounts.some((a) => a.kind === 'cash')) accounts.unshift({ id: 'a_cash', name: 'Checking and savings', kind: 'cash', ownerId: 'p1', balance: 0, allocation: { stocks: 0, bonds: 0, cash: 1 } });

  const plans = list(root.plans).map((p, index): Plan => {
    const base = examplePlan(year);
    const vars = obj(p.variables);
    const planName = str(p, 'name', 'title') ?? `ProjectionLab plan ${index + 1}`;
    const note = (s: string) => notes.push(`${planName}: ${s}`);

    // Milestones first, since income and expense dates may point at them.
    const milestoneYear = new Map<string, number>();
    const milestones: Milestone[] = [];
    let retireAge: number | undefined;
    for (const m of list(p.milestones)) {
      const name = str(m, 'name', 'title') ?? 'Milestone';
      const c = list(m.criteria)[0] ?? m;
      const type = slug(str(c, 'type'));
      const value = num(c, 'value', 'year', 'age', 'amount');
      const id = 'm_' + uid();
      let made: Milestone | undefined;
      if (/year|date/.test(type) && value !== undefined) made = { id, name, kind: 'year', year: value > 1900 ? value : year + value };
      else if (/age/.test(type) && value !== undefined) made = { id, name, kind: 'age', personId: owner(c), age: value };
      else if (/networth|portfolio|balance/.test(type) && value !== undefined) made = { id, name, kind: 'netWorth', netWorth: value };
      else if (/fi|independ|expensesx|withdrawal/.test(type + slug(name))) made = { id, name, kind: 'financialIndependence' };
      if (!made) { note(`the milestone "${name}" uses a condition Horizon cannot read (${str(c, 'type') ?? 'unknown'}); it was left out.`); continue; }
      milestones.push(made);
      count('milestones');
      const y = made.kind === 'year' ? made.year! : made.kind === 'age' ? people.find((x) => x.id === made!.personId)!.birthYear + made.age! : undefined;
      const old = str(m, 'id');
      if (old && y !== undefined) milestoneYear.set(old, y);
      if (/retire/.test(slug(name)) && made.kind === 'age') retireAge = made.age;
      if (/retire/.test(slug(name)) && made.kind === 'year') retireAge = made.year! - people[0].birthYear;
    }
    if (!milestones.some((m) => m.kind === 'financialIndependence')) milestones.unshift({ id: 'm_fi', name: 'Financial independence', kind: 'financialIndependence' });

    /** A start or end point (a keyword, a date, a year, an age, or a milestone) as a calendar year. */
    const when = (v: unknown, o: Obj): number | undefined => {
      if (typeof v === 'number') return v > 1900 ? v : undefined;
      if (typeof v === 'string') return /^\d{4}/.test(v) ? Number(v.slice(0, 4)) : undefined;
      const w = obj(v);
      const type = slug(str(w, 'type'));
      const value = w.value;
      if (/milestone/.test(type) && typeof value === 'string') return milestoneYear.get(value);
      if (/age/.test(type) && typeof value === 'number') return people.find((x) => x.id === owner(o))!.birthYear + value;
      if (/keyword/.test(type) && typeof value === 'string') return /now|current|start|today/.test(slug(value)) ? year : undefined;
      if (typeof value === 'number') return value > 1900 ? value : undefined;
      if (typeof value === 'string' && /^\d{4}/.test(value)) return Number(value.slice(0, 4));
      return undefined;
    };
    const growthOf = (o: Obj): { growth: number; nominal: boolean } => {
      const ch = obj(o.yearlyChange);
      const type = slug(str(ch, 'type'));
      const amt = rate(num(ch, 'amount', 'value', 'rate')) ?? 0;
      if (/none|fixed|flat/.test(type)) return { growth: 0, nominal: true };
      if (/inflationplus|aboveinflation/.test(type)) return { growth: amt, nominal: false };
      if (/increase|custom|percent/.test(type)) return { growth: amt - (rate(num(vars, 'inflation')) ?? base.assumptions.inflation), nominal: false };
      return { growth: 0, nominal: /future|nominal/.test(slug(str(o, 'amountType'))) };
    };

    const incomes: Income[] = [];
    for (const e of list(p.income)) {
      const name = str(e, 'name', 'title') ?? 'Income';
      const amount = num(e, 'amount', 'value');
      if (amount === undefined) { note(`the income "${name}" has no amount; it was left out.`); continue; }
      const y = yearly(amount, str(e, 'frequency'));
      const kind = y.once ? 'windfall' : kindOf(INCOME_KINDS, 'other', str(e, 'type'), name);
      const g = growthOf(e);
      const start = when(e.start, e) ?? year;
      const end = when(e.end, e);
      incomes.push({ id: 'i_' + uid(), name, kind, ownerId: owner(e), amount: y.amount, growth: g.growth, startYear: start,
        ...(y.once ? { endYear: start } : end !== undefined ? { endYear: end - 1 } : {}),
        inflationAdjusted: !g.nominal, ...(g.nominal ? { nominal: true } : {}), taxable: e.taxable !== false && !/gift|inherit/.test(slug(str(e, 'type')) + slug(name)) });
      count('incomes');
    }
    const expenses: Expense[] = [];
    for (const e of list(p.expenses)) {
      const name = str(e, 'name', 'title') ?? 'Expense';
      const amount = num(e, 'amount', 'value');
      if (amount === undefined) { note(`the expense "${name}" has no amount; it was left out.`); continue; }
      if (/debt|loan|mortgage/.test(slug(str(e, 'type')))) { note(`the expense "${name}" is a debt payment; Horizon pays debts from the Accounts page, so it was left out to avoid counting it twice.`); continue; }
      const y = yearly(amount, str(e, 'frequency'));
      const g = growthOf(e);
      const start = when(e.start, e) ?? year;
      const end = when(e.end, e);
      expenses.push({ id: 'e_' + uid(), name, kind: y.once ? 'oneTime' : kindOf(EXPENSE_KINDS, 'other', str(e, 'type'), name), amount: y.amount, startYear: start,
        ...(end !== undefined && !y.once ? { endYear: end - 1 } : {}), growth: g.nominal ? 0 : g.growth, ...(g.nominal ? { nominal: true } : {}) });
      count('expenses');
    }
    if (expenses.length === 0) note('no expenses were found; add your spending on the Expenses page.');

    // Cash-flow priorities: workplace contributions go onto the owner's salary; IRA, Roth IRA, and HSA amounts onto the strategy.
    let ira = 0, rothIra = 0, hsa = 0;
    for (const pr of list(p.priorities)) {
      const name = str(pr, 'name', 'title') ?? str(pr, 'type') ?? 'Priority';
      const type = slug(str(pr, 'type')) + ' ' + slug(name);
      const amount = num(pr, 'contribution', 'amount', 'value') ?? 0;
      const percent = /%|percent/.test(str(pr, 'contributionType', 'amountType') ?? '');
      const salary = incomes.find((i) => i.kind === 'salary' && i.ownerId === owner(pr));
      const yearlyAmount = percent ? (rate(amount) ?? 0) * (salary?.amount ?? 0) : yearly(amount, str(pr, 'frequency')).amount;
      if (/401k|403b|457|tsp/.test(type) && salary) {
        salary.contributionRate = (salary.contributionRate ?? 0) + (percent ? rate(amount) ?? 0 : salary.amount > 0 ? yearlyAmount / salary.amount : 0);
        if (/roth/.test(type)) salary.contributionRoth = true;
        const match = rate(num(pr, 'employerMatch', 'employerMatchRate'));
        if (match !== undefined) { salary.employerMatch = match; salary.matchLimit = rate(num(pr, 'employerMatchLimit', 'matchLimit')) ?? salary.contributionRate; }
        count('savings priorities');
      } else if (/rothira/.test(type)) { rothIra += yearlyAmount; count('savings priorities'); }
      else if (/hsa/.test(type)) { hsa += yearlyAmount; count('savings priorities'); }
      else if (/ira/.test(type)) { ira += yearlyAmount; count('savings priorities'); }
      else if (/taxable|brokerage|savings|emergency|cash|invest/.test(type)) count('savings priorities'); // Horizon invests leftover pay by itself
      else note(`the cash-flow priority "${name}" has no match in Horizon; it was left out.`);
    }

    const status = slug(str(vars, 'filingStatus') ?? str(today, 'filingStatus'));
    const filingStatus: FilingStatus = /joint|mfj|married/.test(status) ? 'mfj' : /head|hoh/.test(status) ? 'hoh' : status ? 'single' : couple ? 'mfj' : 'single';
    const loc = obj(today.location);
    const state = (str(loc, 'state', 'stateCode') ?? str(today, 'state') ?? '').toUpperCase();
    const country = str(loc, 'country', 'countryCode') ?? str(today, 'country');
    if (country && !/^(us|usa|unitedstates)$/.test(slug(country))) note(`the plan's country is ${country}; Horizon applies United States tax rules for now. A flat tax rate can stand in on the Assumptions page.`);
    if (!/^[A-Z]{2}$/.test(state)) note('no US state was found; Massachusetts is assumed. Set your state on the Assumptions page.');
    const stocks = rate(num(vars, 'investmentReturn', 'stockReturn', 'stocksReturn'));
    const inflation = rate(num(vars, 'inflation', 'inflationRate'));
    const retirement = retireAge ?? 65;
    if (retireAge === undefined) note('no retirement milestone with a year or an age was found; retirement at 65 is assumed. Set it on the Strategy page.');
    note('Social Security benefits are estimated from each salary; replace them with the figures of your SSA statement on the Income page.');

    count('plans');
    return {
      ...base, id: uid(), name: planName, startYear: year, people: structuredClone(people), accounts: structuredClone(accounts), incomes, expenses, milestones,
      socialSecurity: people.map((x) => ({ ownerId: x.id, pia: Math.round(estimatePia(incomes.find((i) => i.kind === 'salary' && i.ownerId === x.id)?.amount ?? 0, Math.max(0, Math.min(35, retirement - 22)))), claimAge: 67 })),
      strategy: { ...base.strategy, retirementAge: Object.fromEntries(people.map((x) => [x.id, retirement])), iraContribution: Math.round(ira), rothIraContribution: Math.round(rothIra), hsaContribution: Math.round(hsa),
        cashTarget: Math.round(accounts.filter((a) => a.kind === 'cash').reduce((s, a) => s + a.balance, 0)),
        rothConversionBracket: 0, rothConversionStart: undefined, rothConversionEnd: undefined, harvestZeroGains: false },
      assumptions: { ...base.assumptions, ...(inflation !== undefined ? { inflation } : {}), ...(stocks !== undefined ? { returns: { ...base.assumptions.returns, stocks, bonds: rate(num(vars, 'bondInvestmentReturn', 'bondReturn')) ?? base.assumptions.returns.bonds } } : {}),
        dividendYield: rate(num(vars, 'dividendRate', 'dividendYield')) ?? base.assumptions.dividendYield, state: /^[A-Z]{2}$/.test(state) ? state : 'MA', filingStatus },
      deductions: { itemize: true, propertyTaxRate: accounts.some((a) => a.realEstate) ? 0.011 : 0, charity: 0 },
      events: [], notes: 'Imported from ProjectionLab on ' + new Date().toISOString().slice(0, 10) + '.',
    };
  });

  for (const key of ['progress', 'netWorthHistory', 'history']) if (root[key] !== undefined) { notes.push('The net worth history (Progress) was left out; Horizon keeps its own snapshots on the Progress page.'); break; }
  notes.push('ProjectionLab\'s tax settings, withdrawal strategy, Roth conversions, and Monte Carlo settings were left out; Horizon\'s defaults apply. Review the Strategy and Assumptions pages.');
  return { plans, imported: [...counts].map(([label, c]) => ({ label, count: c })), notes: [...new Set(notes)] };
}

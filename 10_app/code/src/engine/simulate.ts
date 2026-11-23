// The year-by-year projection of one plan along one path of returns and inflation.
//
// Each year, in order: incomes (salary with its workplace contributions and match, other incomes, Social Security),
// required minimum distributions, expenses and debt payments, voluntary contributions (IRA, Roth IRA, HSA) while
// working, a Roth conversion filling the chosen bracket, then taxes and withdrawals, solved together (a withdrawal
// raises the tax, which needs more withdrawal) in a few passes. A surplus fills the cash target and the rest goes to
// the first taxable account. Balances then earn the year's returns, a taxable account's dividends are taxed in the
// same year, assets appreciate and are sold in their sale year, and debts accrue interest.
import { convertCurrencies } from './currency';
import { acaLimit, acaNetPremium, bracketTop, computeTax, estateTax, medicarePremium, rules, rulesFor, rulesTiers, zeroGainsTop } from './tax';
import { benefitAtClaim, rmdStartAge, spousalAtClaim } from './retirement';
import type { Account, Plan, Projection, ReturnPath, WithdrawalStep, YearResult } from './types';

const LIQUID: Account['kind'][] = ['cash', 'taxable', 'traditional', 'roth', 'hsa', 'college529'];

interface State {
  balance: Record<string, number>;
  basis: Record<string, number>;
}

export function lastYear(plan: Plan): number {
  return Math.max(...plan.people.map((p) => p.birthYear + p.lifeExpectancy));
}

/** The deterministic path: every year at the assumed mean returns and inflation. */
export function meanPath(plan: Plan): ReturnPath {
  const n = lastYear(plan) - plan.startYear + 1;
  const a = plan.assumptions;
  return {
    stocks: Array(n).fill(a.returns.stocks),
    bonds: Array(n).fill(a.returns.bonds),
    cash: Array(n).fill(a.returns.cash),
    inflation: Array(n).fill(a.inflation),
  };
}

function portfolioReturn(acc: Account, path: ReturnPath, i: number, w: Account['allocation'] = acc.allocation): number {
  if (typeof acc.inflationLinked === 'number') return path.inflation[i] + acc.inflationLinked;
  if (typeof acc.customReturn === 'number') return acc.customReturn;
  const total = w.stocks + w.bonds + w.cash || 1;
  const r = (w.stocks * path.stocks[i] + w.bonds * path.bonds[i] + w.cash * path.cash[i]) / total;
  return r - (acc.fee ?? 0);
}

/** Yearly payment of a fixed-rate loan. */
export function loanPayment(principal: number, rate: number, years: number): number {
  if (rate <= 0) return principal / years;
  return (principal * rate) / (1 - Math.pow(1 + rate, -years));
}

/** Turns a plan's life events into the accounts and expenses they create (a home and its mortgage, a child's costs). */
export function expandEvents(plan: Plan): Plan {
  convertCurrencies(plan);
  for (const e of plan.events ?? []) {
    // Applied once: a plan already expanded keeps its accounts and expenses.
    const made = (id: string) => id.startsWith('ev_') && id.endsWith('_' + e.id);
    if (plan.accounts.some((x) => made(x.id)) || plan.expenses.some((x) => made(x.id)) || plan.incomes.some((x) => made(x.id))) continue;
    if (e.kind === 'homePurchase') {
      const loan = e.price * (1 - e.downPayment);
      const assetId = 'ev_home_' + e.id;
      // Dollars are today's: the price and payment rise with inflation to the purchase year.
      const k = Math.pow(1 + plan.assumptions.inflation, e.year - plan.startYear);
      plan.accounts.push({ id: assetId, name: e.name, kind: 'asset', ownerId: plan.people[0].id, balance: e.price * k,
        allocation: { stocks: 0, bonds: 0, cash: 0 }, appreciation: e.appreciation, realEstate: true, startYear: e.year });
      if (loan > 0) plan.accounts.push({ id: 'ev_mort_' + e.id, name: e.name + ' mortgage', kind: 'debt', ownerId: plan.people[0].id,
        balance: loan * k, allocation: { stocks: 0, bonds: 0, cash: 0 }, interestRate: e.rate, payment: loanPayment(loan * k, e.rate, e.termYears),
        securedBy: assetId, startYear: e.year });
      plan.expenses.push({ id: 'ev_down_' + e.id, name: e.name + ': down payment and closing', kind: 'oneTime',
        amount: e.price * (e.downPayment + e.closingCosts), startYear: e.year, growth: 0 });
    } else if (e.kind === 'child') {
      plan.expenses.push({ id: 'ev_child_' + e.id, name: e.name + ': child costs', kind: 'other', amount: e.yearlyCost, startYear: e.year, endYear: e.year + 17, growth: 0 });
      if (e.collegeYearly > 0) plan.expenses.push({ id: 'ev_college_' + e.id, name: e.name + ': college', kind: 'education',
        amount: e.collegeYearly, startYear: e.year + 18, endYear: e.year + 17 + e.collegeYears, growth: 0.02,
        fundedBy: plan.accounts.find((x) => x.kind === 'college529')?.id });
    } else if (e.kind === 'rentalProperty') {
      const k = Math.pow(1 + plan.assumptions.inflation, e.year - plan.startYear);
      const loan = e.price * (1 - e.downPayment);
      const assetId = 'ev_rental_' + e.id;
      plan.accounts.push({ id: assetId, name: e.name, kind: 'asset', ownerId: plan.people[0].id, balance: e.price * k,
        allocation: { stocks: 0, bonds: 0, cash: 0 }, appreciation: e.appreciation, realEstate: true, startYear: e.year,
        rent: e.rent, vacancy: e.vacancy, rentalCosts: e.costs });
      if (loan > 0) plan.accounts.push({ id: 'ev_rmort_' + e.id, name: e.name + ' mortgage', kind: 'debt', ownerId: plan.people[0].id,
        balance: loan * k, allocation: { stocks: 0, bonds: 0, cash: 0 }, interestRate: e.rate, payment: loanPayment(loan * k, e.rate, e.termYears),
        securedBy: assetId, startYear: e.year });
      plan.expenses.push({ id: 'ev_rdown_' + e.id, name: e.name + ': down payment', kind: 'oneTime', amount: e.price * e.downPayment, startYear: e.year, growth: 0 });
    } else if (e.kind === 'inheritance') {
      if (e.asIra) {
        const k = Math.pow(1 + plan.assumptions.inflation, e.year - plan.startYear);
        plan.accounts.push({ id: 'ev_iira_' + e.id, name: e.name + ' (inherited IRA)', kind: 'traditional', ownerId: plan.people[0].id,
          balance: e.amount * k, allocation: { stocks: 0.6, bonds: 0.4, cash: 0 }, startYear: e.year, inheritedYear: e.year });
      } else {
        plan.incomes.push({ id: 'ev_inh_' + e.id, name: e.name, kind: 'windfall', ownerId: plan.people[0].id, amount: e.amount, growth: 0,
          startYear: e.year, inflationAdjusted: true, taxable: false });
      }
    } else if (e.kind === 'separation') {
      if (e.support > 0 && e.supportYears > 0) plan.expenses.push({ id: 'ev_sup_' + e.id, name: e.name + ': support paid', kind: 'other',
        amount: e.support, startYear: e.year, endYear: e.year + e.supportYears - 1, growth: 0 });
    } else if (e.kind === 'recurring') {
      for (let y = e.year, n = 0; y <= e.endYear; y += Math.max(1, e.everyYears), n++) {
        plan.expenses.push({ id: `ev_rec${n}_` + e.id, name: e.name, kind: 'oneTime', amount: e.amount, startYear: y, growth: 0 });
      }
    }
  }
  return plan;
}

export function simulate(plan: Plan, path: ReturnPath = meanPath(plan)): Projection {
  expandEvents(plan);
  const a = plan.assumptions;
  const s = plan.strategy;
  const accounts = plan.accounts;
  const byId = new Map(accounts.map((x) => [x.id, x]));
  const state: State = { balance: {}, basis: {} };
  for (const x of accounts) {
    state.balance[x.id] = x.kind === 'debt' ? -Math.abs(x.balance) : x.balance;
    state.basis[x.id] = x.kind === 'taxable' ? (x.costBasis ?? x.balance) : 0;
  }
  let cashAcc = accounts.find((x) => x.kind === 'cash');
  if (!cashAcc) {
    cashAcc = { id: '__cash', name: 'Cash', kind: 'cash', ownerId: plan.people[0].id, balance: 0, allocation: { stocks: 0, bonds: 0, cash: 1 } };
    accounts.push(cashAcc);
    byId.set(cashAcc.id, cashAcc);
    state.balance[cashAcc.id] = 0;
    state.basis[cashAcc.id] = 0;
  }
  let taxableAcc = accounts.find((x) => x.kind === 'taxable');
  if (!taxableAcc) {
    taxableAcc = { id: '__taxable', name: 'Brokerage', kind: 'taxable', ownerId: plan.people[0].id, balance: 0, allocation: { stocks: 0.6, bonds: 0.4, cash: 0 } };
    accounts.push(taxableAcc);
    byId.set(taxableAcc.id, taxableAcc);
    state.balance[taxableAcc.id] = 0;
    state.basis[taxableAcc.id] = 0;
  }

  const end = lastYear(plan);
  const years: YearResult[] = [];
  // Unused foreign tax credits by basket and the year they arose; each lasts ten years.
  // Net capital losses not yet used: $3,000 a year offsets other income, the rest carries forward without limit.
  let lossCarry = 0;
  const ftcCarry = { general: [] as { y: number; amt: number }[], passive: [] as { y: number; amt: number }[] };
  if (a.crash?.enabled) {
    const ci = a.crash.year - plan.startYear;
    if (ci >= 0 && ci < path.stocks.length) path = { ...path, stocks: path.stocks.map((r, i) => (i === ci ? -Math.abs(a.crash!.drop) : r)) };
  }
  // Accounts opened later start at zero; their balance appears in their first year.
  const opening: Record<string, number> = {};
  for (const x of accounts) if (x.startYear && x.startYear > plan.startYear) { opening[x.id] = state.balance[x.id]; state.balance[x.id] = 0; }
  let index = 1; // cumulative inflation since the start year
  let depletionYear: number | null = null;
  let fiYear: number | null = null;
  const reached = new Set<string>();
  let guardrailSpend: number | null = null;
  let flexHigh: number | null = null, flexStart: number | null = null;
  let guardrailRate: number | null = null;
  /** Cumulative inflation at the start of each plan year, and modified AGI by year (Medicare looks two years back). */
  const indexAt: Record<number, number> = {};
  const magiBy: Record<number, number> = {};
  /** Inflation since a rules year: within the plan from the path, before it at the assumed rate. */
  const sinceRules = (y: number, index: number) => {
    const ry = rulesFor(y).year;
    const at = indexAt[ry] ?? Math.pow(1 + a.inflation, ry - plan.startYear);
    return index / at;
  };
  const dd = plan.deductions ?? { itemize: false, propertyTaxRate: 0, charity: 0 };
  const hc = plan.healthcare ?? { medicare: false, partDBase: 0, aca: false, acaBenchmark: 0 };

  /** The state of residence in a year: the last move at or before it. */
  const stateIn = (y: number) => {
    let st = a.state, at = -Infinity;
    for (const e of plan.events ?? []) if (e.kind === 'move' && e.year <= y && e.year > at) { st = e.state; at = e.year; }
    return st;
  };
  /** The local income tax in a year: the plan's, or the last move's (none when the move names none). */
  const localIn = (y: number) => {
    let lt = a.local, at = -Infinity;
    for (const e of plan.events ?? []) if (e.kind === 'move' && e.year <= y && e.year > at) { lt = e.local; at = e.year; }
    return lt;
  };
  const childEvents = (plan.events ?? []).filter((e) => e.kind === 'child');
  const separations = (plan.events ?? []).flatMap((e) => (e.kind === 'separation' ? [e] : []));
  /** People who left the household in a separation: their incomes and benefits leave the plan. */
  const departed = new Set<string>();
  let expenseFactor = 1;
  /** Cumulative inflation at a year's start: from the path inside the plan, at the assumed rate before it. */
  const indexOf = (yr: number) => indexAt[yr] ?? Math.pow(1 + a.inflation, yr - plan.startYear);
  /** A yearly amount in a year: the item's base amount or its last step, in today's dollars (grown with inflation)
   * or in the future dollars of the year it starts, with its real growth. */
  const amountIn = (y: number, index: number, it: { amount: number; growth: number; startYear: number; steps?: { year: number; amount: number }[]; nominal?: boolean }, inflationAdjusted = true) => {
    let amount = it.amount, from = it.startYear, stepped = false;
    for (const st of it.steps ?? []) if (st.year <= y && (!stepped || st.year >= from)) { amount = st.amount; from = st.year; stepped = true; }
    if (it.nominal) return amount * (inflationAdjusted ? index / indexOf(from) : 1) * Math.pow(1 + it.growth, y - from);
    return amount * (inflationAdjusted ? index : 1) * Math.pow(1 + it.growth, y - (stepped ? from : plan.startYear));
  };
  /** People retired by a milestone reached in an earlier year. */
  const retiredBy = new Set<string>();
  let seppAmount = 0;
  const gp = s.glidePath;
  const allocationAt = (x: Account, age: number): Account['allocation'] => {
    if (!gp?.enabled || x.kind === 'cash') return x.allocation;
    const w = x.allocation, tot = w.stocks + w.bonds + w.cash || 1;
    const s0 = w.stocks / tot;
    const t = Math.max(0, Math.min(1, (age - gp.startAge) / Math.max(1, gp.endAge - gp.startAge)));
    const stocks = s0 + (gp.endStocks - s0) * t;
    return { stocks, bonds: Math.max(0, 1 - stocks - w.cash / tot), cash: w.cash / tot };
  };

  for (let y = plan.startYear, i = 0; y <= end; y++, i++) {
    indexAt[y] = index;
    for (const [id, bal] of Object.entries(opening)) if (byId.get(id)!.startYear === y) state.balance[id] = bal;
    // A separation: the leaving person's accounts pass to the one staying, who keeps a share of every account.
    for (const e of separations) {
      if (e.year !== y || departed.has(e.personId)) continue;
      const stayer = plan.people.find((p) => p.id !== e.personId);
      if (!stayer) continue;
      departed.add(e.personId);
      expenseFactor *= e.expenseFactor;
      for (const x of accounts) {
        if (x.ownerId === e.personId) x.ownerId = stayer.id;
        state.balance[x.id] *= e.keepShare;
        state.basis[x.id] *= e.keepShare;
        if (opening[x.id] !== undefined) opening[x.id] *= e.keepShare;
      }
    }
    const ri = sinceRules(y, index);
    const lim = rulesFor(y).rules.limits;
    const healthIndex = index * Math.pow(1.015, y - plan.startYear);
    const ages: Record<string, number> = {};
    for (const p of plan.people) ages[p.id] = y - p.birthYear;
    const alive = plan.people.filter((p) => ages[p.id] <= p.lifeExpectancy && !departed.has(p.id));
    if (alive.length === 0) break;
    // The first two people are the couple (joint filing, spousal and survivor benefits); each later person is another
    // household member (a parent, an adult child) whose own benefits add to the household's.
    const coupleIds = plan.people.slice(0, 2).map((p) => p.id);
    const couple = alive.filter((p) => coupleIds.includes(p.id));
    const others = alive.filter((p) => !coupleIds.includes(p.id));
    let status: 'mfj' | 'hoh' | 'single' = couple.length === 2 && a.filingStatus === 'mfj' ? 'mfj' : a.filingStatus === 'hoh' ? 'hoh' : 'single';
    const isAlive = (id: string) => alive.some((p) => p.id === id);
    const working = (id: string) => isAlive(id) && ages[id] < (s.retirementAge[id] ?? 200) && !retiredBy.has(id);
    const residence = stateIn(y);
    // Dependents from the child events: under 17 for the child tax credit, 17 to 18 and college students for the
    // $500 credit, and the first four college years for the American Opportunity credit.
    let kids = 0, otherDeps = 0, students = 0, kidsUnder13 = 0;
    for (const c of childEvents) {
      if (c.kind !== 'child') continue;
      const age = y - c.year;
      if (age >= 0 && age < 17) kids++;
      if (age >= 0 && age < 13) kidsUnder13++;
      else if (age >= 17 && age < 18) otherDeps++;
      else if (age >= 18 && age < 18 + c.collegeYears && c.collegeYearly > 0) { otherDeps++; if (age < 22) students++; }
    }
    if (departed.size > 0 && status === 'single' && kids + otherDeps > 0) status = 'hoh';

    const income: Record<string, number> = {};
    const contributions: Record<string, number> = {};
    const withdrawals: Record<string, number> = {};
    const expenses: Record<string, number> = {};
    let wages = 0, selfEmp = 0, otherOrdinary = 0, untaxedIncome = 0, preTax = 0, match = 0, sePremium = 0, assetGain = 0, homeExclusion = 0;
    const fo = { earned: 0, earnedBy: {} as Record<string, number>, noUsPayroll: 0, taxEarned: 0, generalOther: 0, taxGeneralOther: 0, passiveIncome: 0, taxPassive: 0, taxOther: 0 };
    const deferredBy: Record<string, number> = {};
    const deposit = (id: string, amt: number) => {
      state.balance[id] += amt;
      contributions[id] = (contributions[id] ?? 0) + amt;
    };
    const plan401 = (ownerId: string, roth: boolean) =>
      accounts.find((x) => x.ownerId === ownerId && x.kind === (roth ? 'roth' : 'traditional')) ??
      accounts.find((x) => x.kind === (roth ? 'roth' : 'traditional'));

    // Incomes.
    for (const inc of plan.incomes) {
      if (!isAlive(inc.ownerId)) continue;
      const stop = inc.endYear ?? (inc.kind === 'salary' || inc.kind === 'selfEmployment'
        ? plan.people.find((p) => p.id === inc.ownerId)!.birthYear + (s.retirementAge[inc.ownerId] ?? 200) - 1
        : inc.kind === 'rsu' ? inc.startYear + Math.max(1, inc.vestYears ?? 4) - 1 : end);
      if (y < inc.startYear || y > stop) continue;
      if ((inc.kind === 'salary' || inc.kind === 'selfEmployment') && retiredBy.has(inc.ownerId)) continue;
      if (inc.kind === 'windfall' && y !== inc.startYear) continue;
      const evs = (plan.events ?? []).filter((e) => (e.kind === 'careerBreak' || e.kind === 'payChange') && e.personId === inc.ownerId);
      if ((inc.kind === 'salary' || inc.kind === 'selfEmployment') && evs.some((e) => e.kind === 'careerBreak' && y >= e.year && y <= e.endYear)) continue;
      let amt = amountIn(y, index, inc, inc.inflationAdjusted);
      if (inc.kind === 'salary' || inc.kind === 'selfEmployment') for (const e of evs) if (e.kind === 'payChange' && y >= e.year) amt *= e.factor;
      if (inc.kind === 'salary' && inc.bonusRate) amt *= 1 + inc.bonusRate;
      income[inc.id] = amt;
      if (inc.kind === 'salary') {
        wages += amt;
        if (inc.contributionRate) {
          const age = ages[inc.ownerId];
          const limit = (lim['401k'] + (age >= 60 && age <= 63 ? lim['401kCatchUp60to63'] : age >= 50 ? lim['401kCatchUp50'] : 0)) * ri;
          // One limit a person across every employer's plan.
          const employee = Math.max(0, Math.min(amt * inc.contributionRate, limit - (deferredBy[inc.ownerId] ?? 0)));
          deferredBy[inc.ownerId] = (deferredBy[inc.ownerId] ?? 0) + employee;
          // The deferral, split between the pre-tax and the Roth side; a Roth deferral leaves take-home pay, after tax.
          const rothShare = Math.max(0, Math.min(1, inc.contributionRothShare ?? (inc.contributionRoth ? 1 : 0)));
          for (const [roth, part] of [[false, employee * (1 - rothShare)], [true, employee * rothShare]] as const) {
            const acc = plan401(inc.ownerId, roth);
            if (!acc || part <= 0) continue;
            deposit(acc.id, part);
            if (roth) untaxedIncome -= part; else preTax += part;
          }
          const m = amt * Math.min(inc.contributionRate, inc.matchLimit ?? 1) * (inc.employerMatch ?? 0);
          const tAcc = plan401(inc.ownerId, false);
          if (tAcc && m > 0) {
            deposit(tAcc.id, m);
            match += m;
          }
        }
      } else if (inc.kind === 'rsu') {
        // The grant's value vests in equal parts; vested shares are wages but stay invested, not cash.
        // Equal parts a year; with a cliff, nothing vests in the first years and the parts held back vest together.
        const part = amt / Math.max(1, inc.vestYears ?? 4), done = y - inc.startYear, cliff = Math.max(0, Math.min((inc.vestYears ?? 4) - 1, inc.vestCliffYears ?? 0));
        const vest = done < cliff ? 0 : done === cliff ? part * (cliff + 1) : part;
        income[inc.id] = vest;
        wages += vest;
        untaxedIncome -= vest;
        state.balance[taxableAcc.id] += vest;
        state.basis[taxableAcc.id] += vest;
        contributions[taxableAcc.id] = (contributions[taxableAcc.id] ?? 0) + vest;
      } else if (inc.kind === 'bonus') wages += amt;
      else if (inc.kind === 'selfEmployment') {
        selfEmp += amt;
        // The health insurance deduction, up to the profit; then a solo 401(k) deferral and the employer contribution
        // (SEP IRA or solo 401(k)), inside the person's deferral limit and the plan's total limit (section 415(c)).
        const premium = Math.min(amt, (inc.healthPremium ?? 0) * index);
        sePremium += premium;  // a deduction only: the premium itself is an expense of the plan
        const age = ages[inc.ownerId];
        const deferralLimit = (lim['401k'] + (age >= 60 && age <= 63 ? lim['401kCatchUp60to63'] : age >= 50 ? lim['401kCatchUp50'] : 0)) * ri;
        const deferral = Math.max(0, Math.min(amt * (inc.contributionRate ?? 0), deferralLimit - (deferredBy[inc.ownerId] ?? 0), amt - premium));
        const total415 = ((lim as unknown as Record<string, number>)['415c'] ?? 72000) * ri;
        const employer = Math.max(0, Math.min(amt * Math.min(0.2, inc.employerContributionRate ?? 0), total415 - deferral, amt - premium - deferral));
        if (deferral + employer > 0) {
          deferredBy[inc.ownerId] = (deferredBy[inc.ownerId] ?? 0) + deferral;
          const rothShare = Math.max(0, Math.min(1, inc.contributionRothShare ?? (inc.contributionRoth ? 1 : 0)));
          const tAcc = plan401(inc.ownerId, false), rAcc = plan401(inc.ownerId, true);
          const toRoth = rAcc ? deferral * rothShare : 0, toTrad = tAcc ? deferral - toRoth + employer : 0;
          if (rAcc && toRoth > 0) { deposit(rAcc.id, toRoth); untaxedIncome -= toRoth; }
          if (tAcc && toTrad > 0) { deposit(tAcc.id, toTrad); preTax += toTrad; }
        }
      }
      else if (inc.taxable) otherOrdinary += amt;
      else untaxedIncome += amt;
      // Income from abroad: pay for work abroad can be excluded; foreign tax paid feeds the credit, by basket.
      if (inc.abroad || inc.foreignTaxRate) {
        const base = income[inc.id], paid = base * (inc.foreignTaxRate ?? 0);
        const work = inc.kind === 'salary' || inc.kind === 'selfEmployment';
        if (work && inc.abroad) {
          fo.earned += base; fo.earnedBy[inc.ownerId] = (fo.earnedBy[inc.ownerId] ?? 0) + base; fo.taxEarned += paid;
          if (inc.kind === 'salary' && !inc.usPayroll) fo.noUsPayroll += base;
        } else if (inc.kind === 'rental' && inc.taxable) { fo.passiveIncome += base; fo.taxPassive += paid; }
        else if (work || inc.kind === 'rsu' || inc.taxable) { fo.generalOther += base; fo.taxGeneralOther += paid; }
        else fo.taxOther += paid;
      }
    }
    // Workplace deferrals leave pay before it reaches cash.
    const deferredPreTax = preTax;

    // Social Security, with the survivor taking the larger benefit.
    let ssTotal = 0;
    const ssByPerson: Record<string, number> = {};
    for (const ss of plan.socialSecurity) {
      const p = plan.people.find((q) => q.id === ss.ownerId);
      if (!p || departed.has(ss.ownerId)) continue;
      const claimYear = p.birthYear + ss.claimAge;
      if (y >= claimYear) ssByPerson[ss.ownerId] = benefitAtClaim(ss.pia, ss.claimAge) * 12 * index * Math.pow(1 + (a.benefitCola ?? 0), y - plan.startYear);
    }
    // A spouse receives the larger of the own benefit and half the partner's PIA (reduced for an early claim), once
    // both have claimed.
    if (couple.length === 2 && a.filingStatus === 'mfj') {
      for (const ss of plan.socialSecurity.filter((s) => coupleIds.includes(s.ownerId))) {
        const other = plan.socialSecurity.find((o) => o.ownerId !== ss.ownerId && coupleIds.includes(o.ownerId));
        if (!other || ssByPerson[ss.ownerId] === undefined || ssByPerson[other.ownerId] === undefined) continue;
        const spousal = spousalAtClaim(other.pia, ss.claimAge) * 12 * index;
        ssByPerson[ss.ownerId] = Math.max(ssByPerson[ss.ownerId], spousal);
      }
    }
    // a widowed partner keeps the larger of the couple's two benefits
    const coupleSs = coupleIds.map((id) => ssByPerson[id] ?? 0);
    ssTotal = (couple.length === 2 ? coupleSs.reduce((t, v) => t + v, 0) : Math.max(0, ...coupleSs))
      + others.reduce((t, p) => t + (ssByPerson[p.id] ?? 0), 0);

    // Required minimum distributions.
    let rmd = 0;
    for (const x of accounts) {
      if (x.kind !== 'traditional' || !isAlive(x.ownerId)) continue;
      const p = plan.people.find((q) => q.id === x.ownerId)!;
      const age = ages[p.id];
      if (age < rmdStartAge(p.birthYear)) continue;
      const divisor = (rules.rmdUniformLifetime as Record<string, number>)[String(Math.min(age, 120))] ?? 2;
      const amt = Math.max(0, state.balance[x.id]) / divisor;
      state.balance[x.id] -= amt;
      withdrawals[x.id] = (withdrawals[x.id] ?? 0) + amt;
      rmd += amt;
    }

    // Inherited IRAs: equal shares of the balance over the ten years, all of it by the tenth year (ordinary income).
    for (const x of accounts) {
      if (!x.inheritedYear || y < x.inheritedYear || state.balance[x.id] <= 0) continue;
      const left = x.inheritedYear + 10 - y;
      const amt = left <= 0 ? state.balance[x.id] : state.balance[x.id] / (left + 1);
      state.balance[x.id] -= amt;
      withdrawals[x.id] = (withdrawals[x.id] ?? 0) + amt;
      rmd += amt;
    }
    // 72(t) SEPP: a fixed payment from the traditional accounts (amortization at 5% over the single life expectancy,
    // about 85 less the age), penalty-free, from the start until the later of five years and age 59½.
    if (s.sepp?.enabled && y >= s.sepp.startYear) {
      const owner = plan.people[0];
      const age0 = s.sepp.startYear - owner.birthYear;
      if (y === s.sepp.startYear) {
        const bal = accounts.filter((x) => x.kind === 'traditional' && !x.inheritedYear).reduce((t, x) => t + Math.max(0, state.balance[x.id]), 0);
        seppAmount = loanPayment(bal, 0.05, Math.max(10, 85 - age0));
      }
      const until = Math.max(s.sepp.startYear + 4, owner.birthYear + 60);
      if (y <= until && seppAmount > 0) {
        let left = seppAmount;
        for (const x of accounts) {
          if (x.kind !== 'traditional' || x.inheritedYear || left <= 0) continue;
          const take = Math.min(left, Math.max(0, state.balance[x.id]));
          state.balance[x.id] -= take; withdrawals[x.id] = (withdrawals[x.id] ?? 0) + take; left -= take; rmd += take;
        }
      }
    }
    // Rent from rental properties, net of vacancy and costs (ordinary income).
    for (const x of accounts) {
      if (x.kind !== 'asset' || !x.rent || state.balance[x.id] <= 0) continue;
      const net = x.rent * index * (1 - (x.vacancy ?? 0)) * (1 - (x.rentalCosts ?? 0));
      income['rent_' + x.id] = net;
      otherOrdinary += net;
    }
    // Student loan forgiveness: the balance left disappears and counts as income (taxable from 2026).
    for (const d of accounts) {
      if (d.kind === 'debt' && d.forgiveYear === y && state.balance[d.id] < 0) {
        const forgiven = -state.balance[d.id];
        state.balance[d.id] = 0;
        income['forgiven_' + d.id] = forgiven;
        otherOrdinary += forgiven;
        untaxedIncome -= forgiven;
      }
    }

    // Expenses, paid first from their 529 where set.
    const retired = plan.people.every((p) => !working(p.id));
    let totalExpenses = 0;
    for (const e of plan.expenses) {
      const stop = e.endYear ?? (e.kind === 'oneTime' ? e.startYear : end);
      if (y < e.startYear || y > stop) continue;
      let amt = amountIn(y, index, e);
      if (!e.id.startsWith('ev_sup_')) amt *= expenseFactor;
      if (e.fundedBy && state.balance[e.fundedBy] > 0) {
        const take = Math.min(amt, state.balance[e.fundedBy]);
        state.balance[e.fundedBy] -= take;
        withdrawals[e.fundedBy] = (withdrawals[e.fundedBy] ?? 0) + take;
        amt -= take;
      }
      expenses[e.id] = amt;
      totalExpenses += amt;
    }
    // Flexible spending: the discretionary share of each expense is cut while the portfolio sits under its high by the
    // chosen share, and raised while it sits above where it began by the chosen share (all in today's dollars).
    let flexChange = 0;
    const discretionary = plan.expenses.reduce((t, e) => t + (expenses[e.id] ?? 0) * (e.discretionary ?? 0), 0);
    if (s.flex?.enabled) {
      const realPortfolio = liquid(state, accounts) / index;
      flexHigh = Math.max(flexHigh ?? realPortfolio, realPortfolio); flexStart ??= realPortfolio;
      const factor = realPortfolio < flexHigh * (1 - s.flex.drop) ? 1 - s.flex.cut
        : s.flex.boost && realPortfolio > flexStart * (1 + (s.flex.rise ?? 0.25)) ? 1 + s.flex.boost : 1;
      if (factor !== 1) for (const e of plan.expenses) {
        const d = (expenses[e.id] ?? 0) * (e.discretionary ?? 0) * (factor - 1);
        if (d) { expenses[e.id] += d; totalExpenses += d; flexChange += d; }
      }
    }
    for (const d of accounts) {
      if (d.kind !== 'debt' || state.balance[d.id] >= 0) continue;
      const owed = -state.balance[d.id] * (1 + (d.interestRate ?? 0));
      const pay = Math.min(owed, (d.payment ?? 0) + (d.extraPayment ?? 0) * index);
      state.balance[d.id] = -(owed - pay);
      expenses[d.id] = pay;
      totalExpenses += pay;
    }
    // Health insurance tied to income: Medicare from 65 (IRMAA on MAGI two years back), and the ACA with its credit
    // for retirees under 65 (on last year's MAGI, the best estimate before the year's own taxes are known).
    let medicare = 0, aca = 0;
    if (hc.medicare) {
      const back = magiBy[y - 2] ?? magiBy[plan.startYear] ?? 0;
      for (const p of alive) if (ages[p.id] >= 65) medicare += medicarePremium(y, back, status, hc.partDBase, ri, healthIndex) + (hc.medigap ?? 0) * 12 * healthIndex;
    }
    if (hc.aca) {
      const covered = alive.filter((p) => ages[p.id] < 65 && !working(p.id)).length;
      if (covered > 0) aca = acaNetPremium(y, magiBy[y - 1] ?? 0, alive.length, covered, hc.acaBenchmark * healthIndex, ri);
    }
    if (medicare > 0) { expenses['__medicare'] = medicare; totalExpenses += medicare; }
    if (aca > 0) { expenses['__aca'] = aca; totalExpenses += aca; }
    const charityAll = (dd.charity ?? 0) * index;
    // Qualified charitable distributions: the gift paid from the IRAs of owners 71 or older, first from the RMD they
    // took, up to the yearly limit a person; it leaves income and the itemized deduction.
    let qcd = 0;
    const rmdAll = rmd;
    if (s.qcd && charityAll > 0) {
      const eligible = accounts.filter((x) => x.kind === 'traditional' && !x.inheritedYear && isAlive(x.ownerId) && ages[x.ownerId] >= 71);
      const owners = new Set(eligible.map((x) => x.ownerId)).size;
      const cap = Math.min(charityAll, ((rulesFor(y).rules as { qcdLimit?: number }).qcdLimit ?? 111000) * ri * owners);
      const fromRmd = Math.min(cap, eligible.reduce((t, x) => t + (withdrawals[x.id] ?? 0), 0));
      rmd -= fromRmd;
      qcd = fromRmd;
      for (const x of eligible) {
        const take = Math.min(cap - qcd, Math.max(0, state.balance[x.id]));
        if (take <= 0) break;
        state.balance[x.id] -= take; withdrawals[x.id] = (withdrawals[x.id] ?? 0) + take; qcd += take;
      }
    }
    const charity = charityAll - qcd;
    if (charity > 0) { expenses['__charity'] = charity; totalExpenses += charity; }
    // Spending an HSA may cover tax-free: the year's healthcare expenses and premiums.
    const medicalSpend = plan.expenses.filter((e) => e.kind === 'healthcare').reduce((t, e) => t + (expenses[e.id] ?? 0), 0) + medicare + aca;
    const hsaOwner = accounts.find((x) => x.kind === 'hsa')?.ownerId;
    let hsaDrawn = 0;
    // Itemized deductions: interest on home-secured debt, property tax on real estate.
    let mortgageInterest = 0, propertyTax = 0;
    for (const d of accounts) {
      if (d.kind === 'debt' && d.securedBy && byId.get(d.securedBy)?.realEstate !== false) {
        mortgageInterest += Math.max(0, -(state.balance[d.id] ?? 0)) * (d.interestRate ?? 0);
      }
      if (d.kind === 'asset' && d.realEstate) propertyTax += Math.max(0, state.balance[d.id]) * (dd.propertyTaxRate ?? 0);
    }
    if (dd.mortgageDebtLimit) {
      const homeDebt = accounts.reduce((t, d) => t + (d.kind === 'debt' && d.securedBy && byId.get(d.securedBy)?.realEstate !== false ? Math.max(0, -(state.balance[d.id] ?? 0)) : 0), 0);
      if (homeDebt > dd.mortgageDebtLimit) mortgageInterest *= dd.mortgageDebtLimit / homeDebt;
    }
    if (propertyTax > 0) { expenses['__propertyTax'] = propertyTax; totalExpenses += propertyTax; }

    // Retirement spending rules replace the plan's living expenses once everyone has retired.
    if (retired && s.spending !== 'expenses') {
      const portfolio = liquid(state, accounts);
      const living = plan.expenses.filter((e) => e.kind === 'living').reduce((t, e) => t + (expenses[e.id] ?? 0), 0);
      let target = living;
      if (s.spending === 'fixedPercent') target = portfolio * s.spendingRate;
      else if (s.spending === 'vpw') {
        // Variable percentage withdrawal: the payment which spends the portfolio to zero over the years left at the
        // portfolio's expected real return, recomputed each year.
        const r = Math.max(0.0001, (a.returns.stocks * 0.6 + a.returns.bonds * 0.4) - a.inflation);
        const n = Math.max(1, end - y + 1);
        target = (portfolio * r) / (1 - Math.pow(1 + r, -n));
      } else if (s.spending === 'textbook') {
        // The textbook rule: the chosen share of the portfolio in the first retirement year, then that amount with
        // inflation, whatever the markets do.
        if (guardrailSpend === null) guardrailSpend = portfolio * s.spendingRate;
        else guardrailSpend *= 1 + path.inflation[Math.max(0, i - 1)];
        target = guardrailSpend;
      } else {
        if (guardrailSpend === null) {
          guardrailSpend = portfolio * s.spendingRate;
          guardrailRate = s.spendingRate;
        } else {
          guardrailSpend *= 1 + path.inflation[Math.max(0, i - 1)];
          const rate = guardrailSpend / Math.max(1, portfolio);
          if (rate > guardrailRate! * 1.2) guardrailSpend *= 0.9;
          else if (rate < guardrailRate! * 0.8) guardrailSpend *= 1.1;
        }
        target = guardrailSpend;
      }
      totalExpenses += target - living;
      for (const e of plan.expenses) if (e.kind === 'living' && expenses[e.id]) expenses[e.id] = 0;
      expenses['__spending'] = target;
    }

    // Voluntary contributions while the owner works.
    let voluntary = 0, iraIn = 0, rothIn = 0;
    const firstWorker = alive.find((p) => working(p.id));
    if (firstWorker) {
      const age = ages[firstWorker.id];
      const iraCap = (lim.ira + (age >= 50 ? lim.iraCatchUp50 : 0)) * ri;
      const ira = Math.min(s.iraContribution * index, iraCap);
      let roth = Math.min(s.rothIraContribution * index, Math.max(0, iraCap - ira));
      // Without a backdoor, a direct Roth IRA contribution shrinks through the phase-out range (on last year's MAGI).
      if (!s.backdoorRoth) {
        const [lo, hi] = lim.rothIraPhaseOut[status].map((v: number) => v * ri);
        const magi = magiBy[y - 1] ?? 0;
        roth *= Math.max(0, Math.min(1, (hi - magi) / (hi - lo)));
      }
      const hsaCap = ((status === 'mfj' ? lim.hsaFamily : lim.hsaSelf) + (age >= 55 ? lim.hsaCatchUp55 : 0)) * ri;
      const hsa = Math.min(s.hsaContribution * index, hsaCap);
      const tIra = plan401(firstWorker.id, false), rIra = plan401(firstWorker.id, true);
      const hsaAcc = accounts.find((x) => x.kind === 'hsa');
      if (tIra && ira > 0) { deposit(tIra.id, ira); preTax += ira; voluntary += ira; iraIn = ira; }
      if (rIra && roth > 0) { deposit(rIra.id, roth); voluntary += roth; rothIn = roth; }
      if (hsaAcc && hsa > 0) { deposit(hsaAcc.id, hsa); preTax += hsa; voluntary += hsa; }
      // Mega backdoor Roth: after-tax 401(k) money converted to Roth, within the 415(c) total less deferrals and match.
      if (s.megaBackdoor && rIra) {
        const room = lim.total415c * ri - (deferredBy[firstWorker.id] ?? 0) - match;
        const mega = Math.max(0, Math.min(s.megaBackdoor * index, room));
        if (mega > 0) { deposit(rIra.id, mega); voluntary += mega; }
      }
    }

    // Dividends and interest of taxable accounts, taxed this year and reinvested.
    let qualified = 0, interest = 0, paidOut = 0;
    const paidOutBy: Record<string, number> = {};
    for (const x of accounts) {
      if (x.kind !== 'taxable' || state.balance[x.id] <= 0) continue;
      const w = x.allocation, tot = w.stocks + w.bonds + w.cash || 1;
      const bal = state.balance[x.id];
      const div = bal * (w.stocks / tot) * a.dividendYield, int = bal * ((w.bonds + w.cash) / tot) * (path.bonds[i] * 0.8);
      const q = Math.max(0, Math.min(1, a.qualifiedDividendShare ?? 1));
      qualified += div * q;
      interest += int + div * (1 - q);
      if (x.foreignWithholding) { fo.passiveIncome += div; fo.taxPassive += div * x.foreignWithholding; }
      // Paid out: the income reaches cash this year and leaves the account's growth.
      if (x.dividendsPaidOut) { paidOutBy[x.id] = div + int; paidOut += div + int; income['div_' + x.id] = div + int; }
    }
    interest += Math.max(0, state.balance[cashAcc.id]) * Math.max(0, path.cash[i]);

    let conversion = 0;
    // Scheduled transfers' taxable parts: traditional money leaving tax deferral, gains realized, early withdrawals.
    let xTrad = 0, xGains = 0, xEarly = 0, transferred = 0;
    const flatRate = a.taxModel?.kind === 'flat' ? a.taxModel.rate : undefined;
    const serviceBusiness = plan.incomes.some((q) => q.kind === 'selfEmployment' && q.serviceBusiness);
    const careCost = plan.expenses.reduce((t, e) => t + (e.kind === 'childcare' ? expenses[e.id] ?? 0 : 0), 0);
    for (const b of [ftcCarry.general, ftcCarry.passive]) while (b.length && y - b[0].y > 10) b.shift();
    const carried = (b: { amt: number }[]) => b.reduce((sum, v) => sum + v.amt, 0);
    const foreign = fo.earned || fo.generalOther || fo.passiveIncome || fo.taxOther || ftcCarry.general.length || ftcCarry.passive.length
      ? { ...fo, earnedBy: Object.values(fo.earnedBy), exclusion: !!a.expat?.exclusion, housing: (a.expat?.housing ?? 0) * index,
        carryGeneral: carried(ftcCarry.general), carryPassive: carried(ftcCarry.passive) } : undefined;
    function computeTaxNow(tr: number, g: number, e: number, conv = conversion) {
      // HSA money beyond the year's medical spending is income, with 20% more before 65.
      const hsaOver = Math.max(0, hsaDrawn - medicalSpend);
      const netGains = g + harvested + xGains - lossCarry, lossUsed = Math.min(3000, Math.max(0, -netGains));
      return computeTax({ year: y, status, index: ri, wages, selfEmployment: selfEmp, otherOrdinary: otherOrdinary + rmd + conv + tr + xTrad + hsaOver - lossUsed,
        interest, qualifiedDividends: qualified, longTermGains: Math.max(0, netGains), socialSecurity: ssTotal, preTaxDeductions: preTax + sePremium,
        hsaPenaltyBase: hsaOwner && ages[hsaOwner] < 65 ? hsaOver : 0, flatRate, serviceBusiness, foreign,
        earlyWithdrawals: e + xEarly, over65: alive.filter((p) => ages[p.id] >= 65).length, state: residence,
        itemize: dd.itemize, itemizedOther: mortgageInterest + charity, propertyTax,
        children: kids, otherDependents: otherDeps, collegeStudents: students, local: localIn(y),
        childrenUnder13: kidsUnder13, dependentCare: careCost,
        saverContributions: alive.map((p) => (deferredBy[p.id] ?? 0) + (p.id === firstWorker?.id ? iraIn + rothIn : 0)) });
    }
    let harvested = 0;
    // Roth conversion up to the chosen bracket's top.
    if (s.rothConversionBracket > 0 && y >= (s.rothConversionStart ?? 0) && y <= (s.rothConversionEnd ?? 9999)) {
      const base = computeTaxNow(0, 0, 0, 0);
      const room = bracketTop(s.rothConversionBracket, status, y, ri) - base.ordinaryTaxable;
      const trad = accounts.filter((x) => x.kind === 'traditional' && isAlive(x.ownerId));
      const avail = trad.reduce((t, x) => t + Math.max(0, state.balance[x.id]), 0);
      conversion = Math.max(0, Math.min(room, avail));
      let left = conversion;
      for (const x of trad) {
        const take = Math.min(left, Math.max(0, state.balance[x.id]));
        state.balance[x.id] -= take;
        left -= take;
        const r = accounts.find((q) => q.kind === 'roth' && q.ownerId === x.ownerId) ?? accounts.find((q) => q.kind === 'roth');
        if (r) state.balance[r.id] += take;
      }
    }

    // Conversions of a set amount in a set year.
    for (const mc of s.manualConversions ?? []) {
      if (mc.year !== y || mc.amount <= 0) continue;
      let left = mc.amount * index;
      for (const x of accounts) {
        if (x.kind !== 'traditional' || x.inheritedYear || left <= 0) continue;
        const take = Math.min(left, Math.max(0, state.balance[x.id]));
        state.balance[x.id] -= take; left -= take; conversion += take;
        const r = accounts.find((q) => q.kind === 'roth' && q.ownerId === x.ownerId) ?? accounts.find((q) => q.kind === 'roth');
        if (r) state.balance[r.id] += take;
      }
    }

    // Scheduled transfers between accounts, with the tax each move causes.
    for (const tf of s.transfers ?? []) {
      if (y < tf.startYear || y > (tf.endYear ?? tf.startYear)) continue;
      const from = byId.get(tf.from), to = byId.get(tf.to);
      const outside = tf.to === 'external';
      if (!from || (!to && !outside) || from.id === tf.to || from.kind === 'debt' || from.kind === 'asset' || to?.kind === 'asset') continue;
      let take = Math.min(tf.amount * index, Math.max(0, state.balance[from.id]));
      if (to?.kind === 'debt') take = Math.min(take, Math.max(0, -state.balance[to.id]));
      if (take <= 0) continue;
      const bal = state.balance[from.id];
      state.balance[from.id] -= take;
      withdrawals[from.id] = (withdrawals[from.id] ?? 0) + take;
      if (from.kind === 'taxable') {
        const frac = bal > 0 ? state.basis[from.id] / bal : 1;
        xGains += take * (1 - frac); state.basis[from.id] -= take * frac;
      } else if (from.kind === 'traditional') {
        if (to?.kind === 'roth') conversion += take;
        else { xTrad += take; if (ages[from.ownerId] < 59.5) xEarly += take; }
      } else if (from.kind === 'hsa') hsaDrawn += take;
      // Money given away or otherwise leaving the plan: the tax of the withdrawal applies, and it shows as a gift.
      if (!to) { expenses['__gifts'] = (expenses['__gifts'] ?? 0) + take; transferred += take; continue; }
      state.balance[to.id] += take;
      if (to.kind === 'taxable') state.basis[to.id] += take;
      if (to.kind !== 'debt') contributions[to.id] = (contributions[to.id] ?? 0) + take;
      transferred += take;
    }

    // Assets sold this year: the gain over the cost basis is a long-term gain, after selling costs and, for the home
    // lived in, the exclusion of $250,000 a person ($500,000 filing jointly). An asset with no basis entered is taken as
    // sold at cost. The value is the year's opening value; the sale itself settles with the year's returns below.
    for (const x of accounts) {
      if (x.kind !== 'asset' || x.saleYear !== y || x.costBasis === undefined) continue;
      const price = Math.max(0, state.balance[x.id]);
      const gain = Math.max(0, price * (1 - (x.sellingCosts ?? 0)) - x.costBasis);
      const excl = x.primaryResidence ? Math.min(gain, status === 'mfj' ? 500000 : 250000) : 0;
      assetGain += gain; homeExclusion += excl; xGains += gain - excl;
    }

    // Taxes and withdrawals, solved together.
    const inflows = wages - deferredPreTax + selfEmp + otherOrdinary + untaxedIncome + ssTotal + rmd + paidOut;
    // Harvest gains in the 0% band: sell and rebuy taxable holdings, raising the basis, up to the band's top.
    if (s.harvestZeroGains) {
      const t0 = computeTaxNow(0, 0, 0);
      const room = Math.max(0, zeroGainsTop(status, y, ri) - t0.taxableIncome);
      for (const x of accounts) {
        if (x.kind !== 'taxable' || room - harvested <= 0) continue;
        const unrealized = Math.max(0, state.balance[x.id] - state.basis[x.id]);
        const take = Math.min(unrealized, room - harvested);
        state.basis[x.id] += take;
        harvested += take;
      }
    }
    let fromTrad = 0, gains = 0, early = 0, withdrawn = 0, tax = computeTaxNow(0, 0, 0);
    let shortfall = 0;
    const outflows = totalExpenses + (voluntary - (preTax - deferredPreTax)) + (voluntary > 0 ? 0 : 0);
    // Voluntary pre-tax contributions (IRA, HSA) and Roth IRA come out of cash flow like an expense.
    const cashOut = totalExpenses + voluntary;
    for (let pass = 0; pass < 8; pass++) {
      const deficit = cashOut + tax.total - inflows - withdrawn;
      if (deficit <= 0.5) break;
      const got = withdraw(deficit);
      if (got.amount <= 0.01) { shortfall = deficit; break; }
      withdrawn += got.amount;
      fromTrad += got.traditional;
      gains += got.gains;
      early += got.early;
      tax = computeTaxNow(fromTrad, gains, early);
    }
    void outflows;

    /** Traditional money which still fits under the shield's limit this year, given what was drawn so far. */
    function shieldRoom(drawnNow: number): number {
      const t = computeTaxNow(fromTrad + drawnNow, gains, early);
      const sh = s.shield!;
      if (sh.startsWith('bracket')) return Math.max(0, bracketTop(Number(sh.slice(7)) / 100, status, y, ri) - t.ordinaryTaxable);
      if (sh === 'irmaa') {
        const tiers = rulesTiers(status);
        return Math.max(0, tiers * ri - t.agi);
      }
      return Math.max(0, acaLimit(alive.length) * ri - t.agi);
    }

    function withdraw(need: number) {
      let left = need, traditional = 0, g = 0, e = 0, amount = 0;
      const order: WithdrawalStep[] = s.withdrawalOrderLater && y >= s.withdrawalOrderLater.year ? s.withdrawalOrderLater.order : s.withdrawalOrder;
      if (s.withdrawalMethod === 'proportional') {
        // Cash first, then every other account in proportion to its balance, in one pass.
        const cash = accounts.filter((x) => x.kind === 'cash' && state.balance[x.id] > 0);
        for (const x of cash) {
          const take = Math.min(left, state.balance[x.id]);
          state.balance[x.id] -= take; withdrawals[x.id] = (withdrawals[x.id] ?? 0) + take; left -= take; amount += take;
        }
        const pool = accounts.filter((x) => ['taxable', 'traditional', 'roth', 'hsa'].includes(x.kind) && state.balance[x.id] > 0);
        const total = pool.reduce((t, x) => t + state.balance[x.id], 0);
        if (left > 0 && total > 0) {
          const want = Math.min(left, total);
          for (const x of pool) {
            const take = (want * state.balance[x.id]) / total;
            const bal = state.balance[x.id];
            state.balance[x.id] -= take;
            withdrawals[x.id] = (withdrawals[x.id] ?? 0) + take;
            if (x.kind === 'taxable') {
              const frac = bal > 0 ? state.basis[x.id] / bal : 1;
              g += take * (1 - frac); state.basis[x.id] -= take * frac;
            }
            if (x.kind === 'traditional') { traditional += take; if (ages[x.ownerId] < 59.5) e += take; }
            if (x.kind === 'hsa') hsaDrawn += take;
            amount += take;
          }
          left -= want;
        }
        return { amount, traditional, gains: g, early: e };
      }
      for (const step of order) {
        const pool = accounts.filter((x) => x.kind === step && state.balance[x.id] > 0 && (step === 'cash' ? true : isAlive(x.ownerId) || alive.length > 0));
        for (const x of pool) {
          if (left <= 0) break;
          let avail = state.balance[x.id];
          if (step === 'cash') avail = Math.max(0, avail);
          if (step === 'traditional' && s.shield && s.shield !== 'none') avail = Math.min(avail, shieldRoom(traditional));
          const take = Math.min(left, avail);
          if (take <= 0) continue;
          state.balance[x.id] -= take;
          withdrawals[x.id] = (withdrawals[x.id] ?? 0) + take;
          if (step === 'taxable') {
            const bal = take + state.balance[x.id];
            const frac = bal > 0 ? state.basis[x.id] / bal : 1;
            g += take * (1 - frac);
            state.basis[x.id] -= take * frac;
          }
          if (step === 'traditional') {
            traditional += take;
            if (ages[x.ownerId] < 59.5) e += take;
          }
          if (step === 'hsa') hsaDrawn += take;
          left -= take;
          amount += take;
        }
      }
      return { amount, traditional, gains: g, early: e };
    }

    // A surplus fills the cash target, then the taxable account.
    const surplus = inflows + withdrawn - cashOut - tax.total;
    if (surplus > 0) {
      const target = s.cashTarget * index;
      const toCash = Math.max(0, Math.min(surplus, target - state.balance[cashAcc.id]));
      state.balance[cashAcc.id] += toCash;
      if (toCash > 0) contributions[cashAcc.id] = (contributions[cashAcc.id] ?? 0) + toCash;
      let rest = surplus - toCash;
      if (rest > 0 && s.surplusTo === 'debt') {
        // Pay debts down, the highest rate first, before investing.
        for (const d of accounts.filter((q) => q.kind === 'debt' && state.balance[q.id] < 0).sort((p, q) => (q.interestRate ?? 0) - (p.interestRate ?? 0))) {
          const pay = Math.min(rest, -state.balance[d.id]);
          state.balance[d.id] += pay; rest -= pay;
          expenses[d.id] = (expenses[d.id] ?? 0) + pay;
          if (rest <= 0) break;
        }
      }
      if (rest > 0) {
        state.balance[taxableAcc.id] += rest;
        state.basis[taxableAcc.id] += rest;
        contributions[taxableAcc.id] = (contributions[taxableAcc.id] ?? 0) + rest;
      }
    }
    if (shortfall > 1 && depletionYear === null) depletionYear = y;

    // Returns, appreciation, sales.
    let investmentReturn = 0;
    for (const x of accounts) {
      if (LIQUID.includes(x.kind)) {
        const r = portfolioReturn(x, path, i, allocationAt(x, ages[x.ownerId] ?? 0));
        const gain = Math.max(0, state.balance[x.id]) * r;
        state.balance[x.id] += gain;
        investmentReturn += gain;
        if (paidOutBy[x.id]) state.balance[x.id] -= paidOutBy[x.id];
        else if (x.kind === 'taxable') {
          const w = x.allocation, tot = w.stocks + w.bonds + w.cash || 1;
          state.basis[x.id] += Math.max(0, state.balance[x.id] - gain) * (w.stocks / tot) * a.dividendYield;
        }
      } else if (x.kind === 'asset') {
        if (x.saleYear && y === x.saleYear) {
          let proceeds = state.balance[x.id] * (1 - (x.sellingCosts ?? 0));
          for (const d of accounts) if (d.kind === 'debt' && d.securedBy === x.id) { proceeds += state.balance[d.id]; state.balance[d.id] = 0; }
          state.balance[x.id] = 0;
          state.balance[cashAcc.id] += proceeds;
        } else if (!x.saleYear || y < x.saleYear) {
          state.balance[x.id] *= 1 + (x.appreciation ?? path.inflation[i]);
        }
      }
    }
    // Cash beyond the target moves into the taxable account after returns.
    const excess = state.balance[cashAcc.id] - s.cashTarget * index * (1 + path.inflation[i]);
    if (excess > 0 && cashAcc.id !== taxableAcc.id) {
      state.balance[cashAcc.id] -= excess;
      state.balance[taxableAcc.id] += excess;
      state.basis[taxableAcc.id] += excess;
    }

    const balances = { ...state.balance };
    const netWorth = Object.values(balances).reduce((t, v) => t + v, 0);
    const liquidNW = liquid(state, accounts);
    const realExpenses = totalExpenses / index;
    // Real assets and the debts they secure.
    let realNet = 0;
    for (const x of accounts) {
      if (x.kind === 'asset') realNet += balances[x.id];
      else if (x.kind === 'debt' && x.securedBy && byId.get(x.securedBy)?.kind === 'asset') realNet += balances[x.id];
    }
    const fiBase = s.fiCountsRealAssets ? liquidNW + realNet : liquidNW;
    if (fiYear === null && fiBase / index * s.safeWithdrawalRate >= realExpenses && realExpenses > 0) fiYear = y;
    const nwMilestone = s.fiCountsRealAssets === false ? netWorth - realNet : netWorth;
    // Coast FI: the invested balance which, with no more saving, grows to the financial independence number by the first
    // retirement; debt-free: every debt paid off.
    const coastYears = Math.max(0, Math.min(...plan.people.map((p) => p.birthYear + (s.retirementAge[p.id] ?? 200))) - y);
    const coastReturn = a.returns.stocks * 0.8 + a.returns.bonds * 0.2 - a.inflation;
    const coastReached = realExpenses > 0 && liquidNW / index >= realExpenses / (s.safeWithdrawalRate || 0.04) / Math.pow(1 + coastReturn, coastYears);
    const debtFree = accounts.every((x) => x.kind !== 'debt' || balances[x.id] > -0.5);
    const milestonesReached: string[] = [];
    for (const m of plan.milestones) {
      if (reached.has(m.id)) continue;
      const holds = (c: { kind: string; year?: number; personId?: string; age?: number; netWorth?: number }) =>
        (c.kind === 'year' && c.year !== undefined && y >= c.year) ||
        (c.kind === 'age' && c.personId !== undefined && c.age !== undefined && ages[c.personId] >= c.age) ||
        (c.kind === 'financialIndependence' && fiYear !== null) ||
        (c.kind === 'netWorth' && c.netWorth !== undefined && nwMilestone / index >= c.netWorth) ||
        (c.kind === 'liquidNetWorth' && c.netWorth !== undefined && liquidNW / index >= c.netWorth) ||
        (c.kind === 'coastFi' && coastReached) || (c.kind === 'debtFree' && debtFree);
      const hit =
        ((m.kind === 'liquidNetWorth' || m.kind === 'coastFi' || m.kind === 'debtFree') && holds(m)) ||
        (m.kind === 'all' && (m.conditions ?? []).length > 0 && (m.conditions ?? []).every(holds)) ||
        (m.kind === 'year' && y === m.year) ||
        (m.kind === 'age' && m.personId !== undefined && ages[m.personId] === m.age) ||
        (m.kind === 'financialIndependence' && fiYear === y) ||
        (m.kind === 'netWorth' && m.netWorth !== undefined && nwMilestone / index >= m.netWorth);
      if (hit) { reached.add(m.id); milestonesReached.push(m.id); for (const pid of m.retires ?? []) retiredBy.add(pid); }
    }

    const gross = wages + selfEmp + otherOrdinary + untaxedIncome + ssTotal + paidOut;
    { const net = gains + harvested + xGains - lossCarry; lossCarry = net < 0 ? Math.max(0, -net - 3000) : 0; }
    // The foreign tax credit's carryover: the credit used comes from the oldest years first; this year's unused tax is kept.
    if (tax.ftc) {
      for (const [b, used, fresh] of [[ftcCarry.general, tax.ftc.usedGeneral, tax.ftc.newGeneral], [ftcCarry.passive, tax.ftc.usedPassive, tax.ftc.newPassive]] as const) {
        b.push({ y, amt: fresh });
        let left = used;
        for (const v of b) { const take = Math.min(v.amt, left); v.amt -= take; left -= take; }
        for (let n = b.length - 1; n >= 0; n--) if (b[n].amt < 0.005) b.splice(n, 1);
      }
    }
    years.push({
      year: y,
      ages,
      balances,
      netWorth,
      liquidNetWorth: liquidNW,
      income: income,
      socialSecurity: ssTotal,
      expenses,
      totalExpenses,
      contributions,
      employerMatch: match,
      withdrawals,
      rmd: rmdAll,
      rothConversion: conversion,
      qcd,
      transfers: transferred,
      financialNetWorth: netWorth - realNet,
      taxes: {
        federal: tax.federal,
        state: tax.state,
        fica: tax.fica,
        capitalGains: tax.capitalGains,
        niit: tax.niit,
        penalty: tax.penalty,
        qbi: tax.qbi,
        medicare,
        aca,
        credits: tax.credits,
        amt: tax.amt,
        local: tax.local,
        assetGain: assetGain || undefined,
        homeExclusion: homeExclusion || undefined,
        foreign: tax.foreignTaxPaid || undefined,
        foreignCredit: tax.foreignTaxCredit || undefined,
        foreignExclusion: tax.foreignExclusion || undefined,
        estate: estateTax(netWorth, y, ri, Math.max(1, couple.length)),
        itemized: tax.itemized,
        deduction: tax.deduction,
        total: tax.total,
        taxableIncome: tax.taxableIncome,
        ordinaryTaxable: tax.ordinaryTaxable,
        marginalRate: tax.marginalRate,
        effectiveRate: gross > 0 ? tax.total / gross : 0,
      },
      investmentReturn,
      shortfall,
      flexChange: flexChange || undefined,
      discretionary: discretionary || undefined,
      milestonesReached,
    });
    magiBy[y] = tax.agi;
    index *= 1 + path.inflation[i];
  }

  const last = years[years.length - 1];
  return {
    years,
    depletionYear,
    financialIndependenceYear: fiYear,
    endingNetWorthReal: last ? last.netWorth / (index / (1 + path.inflation[years.length - 1])) : 0,
  };
}

function liquid(state: State, accounts: Account[]): number {
  return accounts.filter((x) => LIQUID.includes(x.kind)).reduce((t, x) => t + Math.max(0, state.balance[x.id]), 0);
}

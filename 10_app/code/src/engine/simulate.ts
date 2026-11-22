// The year-by-year projection of one plan along one path of returns and inflation.
//
// Each year, in order: incomes (salary with its workplace contributions and match, other incomes, Social Security),
// required minimum distributions, expenses and debt payments, voluntary contributions (IRA, Roth IRA, HSA) while
// working, a Roth conversion filling the chosen bracket, then taxes and withdrawals, solved together (a withdrawal
// raises the tax, which needs more withdrawal) in a few passes. A surplus fills the cash target and the rest goes to
// the first taxable account. Balances then earn the year's returns, a taxable account's dividends are taxed in the
// same year, assets appreciate and are sold in their sale year, and debts accrue interest.
import { computeTax, bracketTop, rules } from './tax';
import { benefitAtClaim, rmdStartAge } from './retirement';
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

function portfolioReturn(acc: Account, path: ReturnPath, i: number): number {
  const w = acc.allocation;
  const total = w.stocks + w.bonds + w.cash || 1;
  const r = (w.stocks * path.stocks[i] + w.bonds * path.bonds[i] + w.cash * path.cash[i]) / total;
  return r - (acc.fee ?? 0);
}

export function simulate(plan: Plan, path: ReturnPath = meanPath(plan)): Projection {
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
  let index = 1; // cumulative inflation since the start year
  let depletionYear: number | null = null;
  let fiYear: number | null = null;
  const reached = new Set<string>();
  let guardrailSpend: number | null = null;
  let guardrailRate: number | null = null;

  for (let y = plan.startYear, i = 0; y <= end; y++, i++) {
    const ages: Record<string, number> = {};
    for (const p of plan.people) ages[p.id] = y - p.birthYear;
    const alive = plan.people.filter((p) => ages[p.id] <= p.lifeExpectancy);
    if (alive.length === 0) break;
    const status = alive.length === 2 && a.filingStatus === 'mfj' ? 'mfj' : a.filingStatus === 'hoh' ? 'hoh' : 'single';
    const isAlive = (id: string) => alive.some((p) => p.id === id);
    const working = (id: string) => isAlive(id) && ages[id] < (s.retirementAge[id] ?? 200);
    const grow = (amount: number, growth: number, inflationAdjusted = true) =>
      amount * (inflationAdjusted ? index : 1) * Math.pow(1 + growth, y - plan.startYear);

    const income: Record<string, number> = {};
    const contributions: Record<string, number> = {};
    const withdrawals: Record<string, number> = {};
    const expenses: Record<string, number> = {};
    let wages = 0, selfEmp = 0, otherOrdinary = 0, untaxedIncome = 0, preTax = 0, match = 0;
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
        : end);
      if (y < inc.startYear || y > stop) continue;
      if (inc.kind === 'windfall' && y !== inc.startYear) continue;
      const amt = grow(inc.amount, inc.growth, inc.inflationAdjusted);
      income[inc.id] = amt;
      if (inc.kind === 'salary') {
        wages += amt;
        if (inc.contributionRate) {
          const age = ages[inc.ownerId];
          const limit = (rules.limits['401k'] + (age >= 60 && age <= 63 ? rules.limits['401kCatchUp60to63'] : age >= 50 ? rules.limits['401kCatchUp50'] : 0)) * index;
          const employee = Math.min(amt * inc.contributionRate, limit);
          const acc = plan401(inc.ownerId, !!inc.contributionRoth);
          if (acc) {
            deposit(acc.id, employee);
            if (!inc.contributionRoth) preTax += employee;
            else untaxedIncome -= employee; // a Roth deferral leaves take-home pay, after tax
            if (inc.contributionRoth) untaxedIncome += 0;
          }
          const m = amt * Math.min(inc.contributionRate, inc.matchLimit ?? 1) * (inc.employerMatch ?? 0);
          const tAcc = plan401(inc.ownerId, false);
          if (tAcc && m > 0) {
            deposit(tAcc.id, m);
            match += m;
          }
        }
      } else if (inc.kind === 'selfEmployment') selfEmp += amt;
      else if (inc.taxable) otherOrdinary += amt;
      else untaxedIncome += amt;
    }
    // Workplace deferrals leave pay before it reaches cash.
    const deferredPreTax = preTax;

    // Social Security, with the survivor taking the larger benefit.
    let ssTotal = 0;
    const ssByPerson: Record<string, number> = {};
    for (const ss of plan.socialSecurity) {
      const p = plan.people.find((q) => q.id === ss.ownerId);
      if (!p) continue;
      const claimYear = p.birthYear + ss.claimAge;
      if (y >= claimYear) ssByPerson[ss.ownerId] = benefitAtClaim(ss.pia, ss.claimAge) * 12 * index;
    }
    if (alive.length === 2) ssTotal = alive.reduce((t, p) => t + (ssByPerson[p.id] ?? 0), 0);
    else ssTotal = Math.max(0, ...Object.values(ssByPerson));

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

    // Expenses, paid first from their 529 where set.
    const retired = plan.people.every((p) => !working(p.id));
    let totalExpenses = 0;
    for (const e of plan.expenses) {
      const stop = e.endYear ?? (e.kind === 'oneTime' ? e.startYear : end);
      if (y < e.startYear || y > stop) continue;
      let amt = grow(e.amount, e.growth);
      if (e.fundedBy && state.balance[e.fundedBy] > 0) {
        const take = Math.min(amt, state.balance[e.fundedBy]);
        state.balance[e.fundedBy] -= take;
        withdrawals[e.fundedBy] = (withdrawals[e.fundedBy] ?? 0) + take;
        amt -= take;
      }
      expenses[e.id] = amt;
      totalExpenses += amt;
    }
    for (const d of accounts) {
      if (d.kind !== 'debt' || state.balance[d.id] >= 0) continue;
      const owed = -state.balance[d.id] * (1 + (d.interestRate ?? 0));
      const pay = Math.min(owed, d.payment ?? 0);
      state.balance[d.id] = -(owed - pay);
      expenses[d.id] = pay;
      totalExpenses += pay;
    }
    // Retirement spending rules replace the plan's living expenses once everyone has retired.
    if (retired && s.spending !== 'expenses') {
      const portfolio = liquid(state, accounts);
      const living = plan.expenses.filter((e) => e.kind === 'living').reduce((t, e) => t + (expenses[e.id] ?? 0), 0);
      let target = living;
      if (s.spending === 'fixedPercent') target = portfolio * s.spendingRate;
      else {
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
    let voluntary = 0;
    const firstWorker = alive.find((p) => working(p.id));
    if (firstWorker) {
      const age = ages[firstWorker.id];
      const iraCap = (rules.limits.ira + (age >= 50 ? rules.limits.iraCatchUp50 : 0)) * index;
      const ira = Math.min(s.iraContribution * index, iraCap);
      const roth = Math.min(s.rothIraContribution * index, Math.max(0, iraCap - ira));
      const hsaCap = (status === 'mfj' ? rules.limits.hsaFamily : rules.limits.hsaSelf) * index;
      const hsa = Math.min(s.hsaContribution * index, hsaCap);
      const tIra = plan401(firstWorker.id, false), rIra = plan401(firstWorker.id, true);
      const hsaAcc = accounts.find((x) => x.kind === 'hsa');
      if (tIra && ira > 0) { deposit(tIra.id, ira); preTax += ira; voluntary += ira; }
      if (rIra && roth > 0) { deposit(rIra.id, roth); voluntary += roth; }
      if (hsaAcc && hsa > 0) { deposit(hsaAcc.id, hsa); preTax += hsa; voluntary += hsa; }
    }

    // Dividends and interest of taxable accounts, taxed this year and reinvested.
    let qualified = 0, interest = 0;
    for (const x of accounts) {
      if (x.kind !== 'taxable' || state.balance[x.id] <= 0) continue;
      const w = x.allocation, tot = w.stocks + w.bonds + w.cash || 1;
      const bal = state.balance[x.id];
      qualified += bal * (w.stocks / tot) * a.dividendYield;
      interest += bal * ((w.bonds + w.cash) / tot) * (path.bonds[i] * 0.8);
    }
    interest += Math.max(0, state.balance[cashAcc.id]) * Math.max(0, path.cash[i]);

    // Roth conversion up to the chosen bracket's top.
    let conversion = 0;
    if (s.rothConversionBracket > 0 && y >= (s.rothConversionStart ?? 0) && y <= (s.rothConversionEnd ?? 9999)) {
      const base = computeTax({ status, index, wages, selfEmployment: selfEmp, otherOrdinary: otherOrdinary + rmd, interest,
        qualifiedDividends: qualified, longTermGains: 0, socialSecurity: ssTotal, preTaxDeductions: preTax, earlyWithdrawals: 0,
        over65: alive.filter((p) => ages[p.id] >= 65).length, state: a.state });
      const room = bracketTop(s.rothConversionBracket, status, index) - base.ordinaryTaxable;
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

    // Taxes and withdrawals, solved together.
    const inflows = wages - deferredPreTax + selfEmp + otherOrdinary + untaxedIncome + ssTotal + rmd;
    let fromTrad = 0, gains = 0, early = 0, withdrawn = 0, tax = computeTaxNow(0, 0, 0);
    function computeTaxNow(tr: number, g: number, e: number) {
      return computeTax({ status, index, wages, selfEmployment: selfEmp, otherOrdinary: otherOrdinary + rmd + conversion + tr,
        interest, qualifiedDividends: qualified, longTermGains: g, socialSecurity: ssTotal, preTaxDeductions: preTax,
        earlyWithdrawals: e, over65: alive.filter((p) => ages[p.id] >= 65).length, state: a.state });
    }
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

    function withdraw(need: number) {
      let left = need, traditional = 0, g = 0, e = 0, amount = 0;
      const order: WithdrawalStep[] = s.withdrawalOrder;
      for (const step of order) {
        const pool = accounts.filter((x) => x.kind === step && state.balance[x.id] > 0 && (step === 'cash' ? true : isAlive(x.ownerId) || alive.length > 0));
        for (const x of pool) {
          if (left <= 0) break;
          let avail = state.balance[x.id];
          if (step === 'cash') avail = Math.max(0, avail);
          const take = Math.min(left, avail);
          if (take <= 0) continue;
          state.balance[x.id] -= take;
          withdrawals[x.id] = (withdrawals[x.id] ?? 0) + take;
          if (step === 'taxable') {
            const bal = take + state.balance[x.id];
            const frac = bal > 0 ? Math.min(1, state.basis[x.id] / bal) : 1;
            g += take * (1 - frac);
            state.basis[x.id] -= take * frac;
          }
          if (step === 'traditional') {
            traditional += take;
            if (ages[x.ownerId] < 59.5) e += take;
          }
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
      const rest = surplus - toCash;
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
        const r = portfolioReturn(x, path, i);
        const gain = Math.max(0, state.balance[x.id]) * r;
        state.balance[x.id] += gain;
        investmentReturn += gain;
        if (x.kind === 'taxable') {
          const w = x.allocation, tot = w.stocks + w.bonds + w.cash || 1;
          state.basis[x.id] += Math.max(0, state.balance[x.id] - gain) * (w.stocks / tot) * a.dividendYield;
        }
      } else if (x.kind === 'asset') {
        if (x.saleYear && y === x.saleYear) {
          let proceeds = state.balance[x.id];
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
    if (fiYear === null && liquidNW / index * s.safeWithdrawalRate >= realExpenses && realExpenses > 0) fiYear = y;
    const milestonesReached: string[] = [];
    for (const m of plan.milestones) {
      if (reached.has(m.id)) continue;
      const hit =
        (m.kind === 'year' && y === m.year) ||
        (m.kind === 'age' && m.personId !== undefined && ages[m.personId] === m.age) ||
        (m.kind === 'financialIndependence' && fiYear === y) ||
        (m.kind === 'netWorth' && m.netWorth !== undefined && netWorth / index >= m.netWorth);
      if (hit) { reached.add(m.id); milestonesReached.push(m.id); }
    }

    const gross = wages + selfEmp + otherOrdinary + untaxedIncome + ssTotal;
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
      rmd,
      rothConversion: conversion,
      taxes: {
        federal: tax.federal,
        state: tax.state,
        fica: tax.fica,
        capitalGains: tax.capitalGains,
        niit: tax.niit,
        penalty: tax.penalty,
        total: tax.total,
        taxableIncome: tax.taxableIncome,
        marginalRate: tax.marginalRate,
        effectiveRate: gross > 0 ? tax.total / gross : 0,
      },
      investmentReturn,
      shortfall,
      milestonesReached,
    });
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

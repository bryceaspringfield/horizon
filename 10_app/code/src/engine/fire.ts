// FIRE metrics from a projection: the financial independence number and its lean and fat versions, Coast FI, and
// the years to each, in today's dollars.
import type { Plan, Projection } from './types';

export interface FireMetrics {
  /** Spending a year in retirement, today's dollars (the first retirement year). */
  retirementSpending: number;
  fiNumber: number;
  leanFiNumber: number;
  fatFiNumber: number;
  /** The amount invested today which grows, with no more saving, to the FI number by the retirement age. */
  coastFiNumber: number;
  investedToday: number;
  coastReached: boolean;
  /** First year the invested balance (today's dollars) reaches each number, or null. */
  leanFiYear: number | null;
  fiYear: number | null;
  fatFiYear: number | null;
}

export function fireMetrics(plan: Plan, proj: Projection): FireMetrics {
  const a = plan.assumptions, swr = plan.strategy.safeWithdrawalRate || 0.04;
  const retireYear = Math.min(...plan.people.map((p) => p.birthYear + (plan.strategy.retirementAge[p.id] ?? 200)));
  let k = 1;
  const real = proj.years.map((y) => { const v = { year: y.year, invested: y.liquidNetWorth / k, spend: y.totalExpenses / k, living: 0 };
    v.living = Object.entries(y.expenses).filter(([id]) => plan.expenses.find((e) => e.id === id)?.kind === 'living').reduce((t, [, x]) => t + x, 0) / k;
    k *= 1 + a.inflation; return v; });
  const atRet = real.find((r) => r.year === retireYear) ?? real[real.length - 1];
  const spending = atRet.spend;
  const fi = spending / swr;
  const lean = Math.max(atRet.living, spending * 0.6) / swr;
  const fat = (spending * 1.5) / swr;
  const realReturn = a.returns.stocks * 0.8 + a.returns.bonds * 0.2 - a.inflation;
  const coast = fi / Math.pow(1 + realReturn, Math.max(0, retireYear - plan.startYear));
  const first = (target: number) => real.find((r) => r.invested >= target)?.year ?? null;
  return {
    retirementSpending: spending, fiNumber: fi, leanFiNumber: lean, fatFiNumber: fat, coastFiNumber: coast,
    investedToday: real[0].invested, coastReached: real[0].invested >= coast,
    leanFiYear: first(lean), fiYear: first(fi), fatFiYear: first(fat),
  };
}

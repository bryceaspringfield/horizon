// Many paths of returns and inflation through one plan: random paths from the plan's assumptions (normal returns
// with the stock-bond correlation), random paths drawn from history (blocks of consecutive years, so crashes and
// recoveries stay together), and every historical start year in sequence (a backtest).
import history from '../data/returns.json';
import { lastYear, simulate } from './simulate';
import type { Plan, Projection, ReturnPath } from './types';

export type Method = 'normal' | 'historicalBlocks' | 'backtest';

export interface HistoryYear {
  year: number;
  stocks: number;
  bonds: number;
  cash: number;
  inflation: number;
}

export interface Band {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloResult {
  method: Method;
  trials: number;
  successRate: number;
  /** Liquid net worth by year in today's dollars, as percentiles across trials. */
  bands: Band[];
  /** Share of trials still funded at the end of each year. */
  survival: { year: number; share: number }[];
  endingReal: { p10: number; p50: number; p90: number };
  /** Backtests: each start year's outcome. */
  starts?: { start: number; success: boolean; endingReal: number }[];
}

/** A small seeded generator, so a run repeats exactly. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const years: HistoryYear[] = history as HistoryYear[];

export function normalPath(plan: Plan, n: number, rand: () => number): ReturnPath {
  const a = plan.assumptions;
  const p: ReturnPath = { stocks: [], bonds: [], cash: [], inflation: [] };
  const rho = a.correlation;
  for (let i = 0; i < n; i++) {
    const z1 = gaussian(rand), z2 = gaussian(rand), z3 = gaussian(rand);
    p.stocks.push(Math.max(-0.95, a.returns.stocks + a.volatility.stocks * z1));
    p.bonds.push(Math.max(-0.5, a.returns.bonds + a.volatility.bonds * (rho * z1 + Math.sqrt(1 - rho * rho) * z2)));
    p.cash.push(Math.max(-0.02, a.returns.cash + a.volatility.cash * z3));
    p.inflation.push(a.inflation + 0.012 * gaussian(rand));
  }
  return p;
}

export function blockPath(n: number, rand: () => number, block = 5): ReturnPath {
  const p: ReturnPath = { stocks: [], bonds: [], cash: [], inflation: [] };
  while (p.stocks.length < n) {
    const start = Math.floor(rand() * years.length);
    for (let j = 0; j < block && p.stocks.length < n; j++) {
      const h = years[(start + j) % years.length];
      p.stocks.push(h.stocks); p.bonds.push(h.bonds); p.cash.push(h.cash); p.inflation.push(h.inflation);
    }
  }
  return p;
}

/** History from one start year, wrapping to 1928 after the last year. */
export function sequencePath(start: number, n: number): ReturnPath {
  const p: ReturnPath = { stocks: [], bonds: [], cash: [], inflation: [] };
  const k = Math.max(0, years.findIndex((h) => h.year === start));
  for (let j = 0; j < n; j++) {
    const h = years[(k + j) % years.length];
    p.stocks.push(h.stocks); p.bonds.push(h.bonds); p.cash.push(h.cash); p.inflation.push(h.inflation);
  }
  return p;
}

function pct(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function runMonteCarlo(plan: Plan, method: Method, trials = 1000, seed = 42): MonteCarloResult {
  const n = lastYear(plan) - plan.startYear + 1;
  const rand = rng(seed);
  const runs: { proj: Projection; path: ReturnPath; start?: number }[] = [];
  if (method === 'backtest') {
    for (const h of years) {
      const path = sequencePath(h.year, n);
      runs.push({ proj: simulate(structuredClone(plan), path), path, start: h.year });
    }
  } else {
    for (let t = 0; t < trials; t++) {
      const path = method === 'normal' ? normalPath(plan, n, rand) : blockPath(n, rand);
      runs.push({ proj: simulate(structuredClone(plan), path), path });
    }
  }
  const real = runs.map(({ proj, path }) => {
    let k = 1;
    return proj.years.map((y, i) => {
      const v = y.liquidNetWorth / k;
      k *= 1 + path.inflation[i];
      return v;
    });
  });
  const bands: Band[] = [];
  const survival: { year: number; share: number }[] = [];
  for (let i = 0; i < n; i++) {
    const col = real.map((r) => r[i] ?? 0).sort((x, y) => x - y);
    const year = plan.startYear + i;
    bands.push({ year, p10: pct(col, 0.1), p25: pct(col, 0.25), p50: pct(col, 0.5), p75: pct(col, 0.75), p90: pct(col, 0.9) });
    survival.push({ year, share: runs.filter((r) => r.proj.depletionYear === null || r.proj.depletionYear > year).length / runs.length });
  }
  const ending = real.map((r) => r[r.length - 1] ?? 0).sort((x, y) => x - y);
  return {
    method,
    trials: runs.length,
    successRate: runs.filter((r) => r.proj.depletionYear === null).length / runs.length,
    bands,
    survival,
    endingReal: { p10: pct(ending, 0.1), p50: pct(ending, 0.5), p90: pct(ending, 0.9) },
    starts: method === 'backtest'
      ? runs.map((r, j) => ({ start: r.start!, success: r.proj.depletionYear === null, endingReal: real[j][real[j].length - 1] ?? 0 }))
      : undefined,
  };
}

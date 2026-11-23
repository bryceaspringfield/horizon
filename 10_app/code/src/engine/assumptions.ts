// Market assumptions by horizon (Bryce, 2026-11-23: forecasts differ for the next year, 3, 5, 10, 20 years, and on).
// A plan's assumptions may hold bands, each from the plan's first year through a year count; a band sets any of
// inflation and the stock, bond, and cash returns, and the plan's single values fill whatever a band leaves out and
// every year past the last band. Defaults are the analysts' consensus (data/market_assumptions.json).
import market from '../data/market_assumptions.json';
import type { Assumptions } from './types';

export interface HorizonBand { through: number; inflation?: number; stocks?: number; bonds?: number; cash?: number }
export type BandKey = 'inflation' | 'stocks' | 'bonds' | 'cash';

export const MARKET = market;
// the bands of each plan, sorted once (Monte Carlo asks for every year of every trial)
const SORTED = new WeakMap<HorizonBand[], HorizonBand[]>();

/** The assumption for the plan's year i (0 for the first year). */
export function assumptionAt(a: Assumptions, key: BandKey, i: number): number {
  if (!a.horizons?.length) return key === 'inflation' ? a.inflation : a.returns[key];
  let sorted = SORTED.get(a.horizons);
  if (!sorted) { sorted = a.horizons.slice().sort((p, q) => p.through - q.through); SORTED.set(a.horizons, sorted); }
  const band = sorted.find((b) => i + 1 <= b.through && b[key] !== undefined);
  if (band) return band[key]!;
  return key === 'inflation' ? a.inflation : a.returns[key];
}

/** The consensus assumptions, to set on a plan: single values for the long run, and the bands before it. */
export function consensus(): Pick<Assumptions, 'inflation' | 'returns' | 'volatility' | 'correlation' | 'dividendYield' | 'horizons'> {
  const b = market.base;
  return {
    inflation: b.inflation,
    returns: { stocks: b.stocks, bonds: b.bonds, cash: b.cash },
    volatility: { stocks: b.volStocks, bonds: b.volBonds, cash: 0.01 },
    correlation: b.correlation,
    dividendYield: b.dividendYield,
    horizons: market.bands.map((x) => ({ ...x })),
  };
}

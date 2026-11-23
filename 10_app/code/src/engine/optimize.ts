// The strategy optimizer: tries every combination of Roth conversion bracket, withdrawal method, withdrawal shield,
// and 0% gain realization on the plan, and ranks them by net legacy in today's dollars (with lifetime taxes and
// whether the money lasts beside it). The plan's own setting is one of the candidates.
import { netLegacy } from './estate';
import { simulate } from './simulate';
import type { Plan, Strategy } from './types';

export interface Candidate {
  label: string;
  changes: Partial<Strategy>;
  netLegacyReal: number;
  lifetimeTaxReal: number;
  lasts: boolean;
}

export function optimize(plan: Plan, target: 'legacy' | 'taxes' = 'legacy'): Candidate[] {
  const brackets = [0, 0.12, 0.22, 0.24, 0.32];
  const shields: Strategy['shield'][] = ['none', 'bracket22', 'irmaa'];
  const out: Candidate[] = [];
  for (const b of brackets) for (const method of ['order', 'proportional'] as const) for (const shield of shields) for (const harvest of [false, true]) {
    const changes: Partial<Strategy> = { rothConversionBracket: b, withdrawalMethod: method, shield, harvestZeroGains: harvest };
    const p = structuredClone(plan);
    Object.assign(p.strategy, changes);
    if (b > 0 && !p.strategy.rothConversionStart) p.strategy.rothConversionStart = p.startYear;
    const proj = simulate(p);
    let k = 1, taxes = 0;
    for (const y of proj.years) { taxes += y.taxes.total / k; k *= 1 + p.assumptions.inflation; }
    const legacy = netLegacy(p, proj);
    out.push({
      label: `${b ? `Convert to the ${b * 100}% bracket` : 'No conversions'}, ${method === 'order' ? 'withdraw in order' : 'withdraw proportionally'}, ${shield === 'none' ? 'no shield' : shield === 'irmaa' ? 'shield under IRMAA' : 'shield under 22%'}${harvest ? ', realize 0% gains' : ''}`,
      changes, netLegacyReal: legacy.netLegacyReal, lifetimeTaxReal: taxes, lasts: proj.depletionYear === null,
    });
  }
  return out.sort((x, y) => (Number(y.lasts) - Number(x.lasts)) || (target === 'legacy' ? y.netLegacyReal - x.netLegacyReal : x.lifetimeTaxReal - y.lifetimeTaxReal));
}

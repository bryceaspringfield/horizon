// A strategy's impact (ProjectionLab's Optimize pages, 2026-11-23): the plan as set against the same plan with the
// strategy turned off, in lifetime taxes and net legacy (future dollars).
import { netLegacy } from './estate';
import { expandEvents, simulate } from './simulate';
import type { Plan } from './types';

export type ImpactFocus = 'tax' | 'flex' | 'roth' | 'drawdown' | 'harvest';

/** The plan with one strategy, or every tax strategy for 'tax', turned off. */
export function withoutStrategy(plan: Plan, focus: ImpactFocus): Plan {
  const p = structuredClone(plan), s = p.strategy;
  const offRoth = () => { s.autoRoth = undefined; s.rothConversionBracket = 0; s.manualConversions = []; };
  const offShield = () => { s.shield = 'none'; s.shields = undefined; s.incomeCeiling = undefined; };
  const offHarvest = () => { s.harvestZeroGains = false; };
  if (focus === 'roth') offRoth();
  if (focus === 'drawdown') offShield();
  if (focus === 'harvest') offHarvest();
  if (focus === 'flex' && s.flex) s.flex = { ...s.flex, enabled: false };
  if (focus === 'tax') { offRoth(); offShield(); offHarvest(); }
  return p;
}

function outcome(plan: Plan) {
  const p = expandEvents(structuredClone(plan));
  const proj = simulate(structuredClone(p));
  return { taxes: proj.years.reduce((t, y) => t + y.taxes.total, 0), legacy: netLegacy(p, proj).netLegacy };
}

/** Lifetime taxes and net legacy with the strategy and without, and the differences (with minus without). */
export function strategyImpact(plan: Plan, focus: ImpactFocus) {
  const on = outcome(plan), off = outcome(withoutStrategy(plan, focus));
  return { on, off, moreTaxes: on.taxes - off.taxes, moreLegacy: on.legacy - off.legacy };
}

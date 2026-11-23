// What the heirs keep: the estate at the last death, less the federal estate tax above the exemption (two exemptions
// for a couple through portability) and the income tax heirs pay emptying inherited traditional accounts. Taxable
// accounts and real estate pass with a stepped-up basis; Roth accounts and HSAs pass tax-free (an HSA left to a
// non-spouse is taxable, counted here at the heirs' rate).
import { estateTax, rulesFor } from './tax';
import { stateEstateTax, stateInheritanceTax } from './stateDeath';
import type { Plan, Projection } from './types';

export interface Legacy {
  year: number;
  grossEstate: number;
  estateTax: number;
  heirsIncomeTax: number;
  stateEstateTax: number;
  stateInheritanceTax: number;
  /** Settlement costs (estate settings) and their sum with every tax: the estate drag. */
  liquidation: number;
  admin: number;
  gainsTax: number;
  estateDrag: number;
  /** Left to charity (Metrics: charity share). */
  charity: number;
  /** The state of residence at the last death. */
  state: string;
  netLegacy: number;
  /** The same in today's dollars. */
  netLegacyReal: number;
  byKind: Record<string, number>;
}

export function netLegacy(plan: Plan, proj: Projection): Legacy {
  const last = proj.years[proj.years.length - 1];
  const rate = plan.estate?.heirsTaxRate ?? 0.24;
  let k = 1;
  for (let i = 0; i < proj.years.length - 1; i++) k *= 1 + plan.assumptions.inflation;
  const byKind: Record<string, number> = {};
  for (const a of plan.accounts) byKind[a.kind] = (byKind[a.kind] ?? 0) + (last.balances[a.id] ?? 0);
  const gross = last.netWorth;
  // a share left to charity comes off the top: deductible from the estate tax and not part of what heirs receive
  const charity = Math.max(0, gross) * Math.min(1, plan.assumptions.metrics?.charityShare ?? 0);
  const ri = k / Math.pow(1 + plan.assumptions.inflation, rulesFor(last.year).year - plan.startYear);
  const tax = estateTax(gross - charity, last.year, ri, 1 + (plan.people.length >= 2 && plan.assumptions.filingStatus === 'mfj' ? 1 : 0));
  const heirs = Math.max(0, (byKind.traditional ?? 0) + (byKind.hsa ?? 0)) * rate;
  // The state of residence at the last death: the last move at or before the final year.
  let state = plan.assumptions.state, at = -Infinity;
  for (const e of plan.events ?? []) if (e.kind === 'move' && e.year <= last.year && e.year > at) { state = e.state; at = e.year; }
  const couple = plan.people.length >= 2 && plan.assumptions.filingStatus === 'mfj';
  const since2026 = k * Math.pow(1 + plan.assumptions.inflation, plan.startYear - 2026);
  const stEstate = stateEstateTax(state, gross - charity, since2026, couple);
  const stInherit = stateInheritanceTax(state, Math.max(0, gross - charity - tax - stEstate), plan.estate?.heirs ?? 'children', plan.estate?.heirCount ?? 2);
  // settlement costs: selling real assets, administration, and gains tax on taxable accounts without a stepped-up basis
  const es = plan.estate;
  const liquidation = Math.max(0, byKind.asset ?? 0) * (es?.liquidationShare ?? 0);
  const admin = Math.max(0, gross) * (es?.adminShare ?? 0);
  const unrealized = plan.accounts.filter((a) => a.kind === 'taxable').reduce((t, a) => t + Math.max(0, (last.balances[a.id] ?? 0) - (last.basis?.[a.id] ?? 0)), 0);
  const gainsTax = es?.steppedUp === false ? unrealized * (es.gainsRate ?? 0.15) : 0;
  const costs = liquidation + admin + gainsTax;
  const net = gross - charity - tax - stEstate - stInherit - heirs - costs;
  return { liquidation, admin, gainsTax, estateDrag: tax + stEstate + stInherit + heirs + costs, year: last.year, grossEstate: gross, estateTax: tax, heirsIncomeTax: heirs, stateEstateTax: stEstate,
    stateInheritanceTax: stInherit, state, charity, netLegacy: net, netLegacyReal: net / k, byKind };
}

// State estate and inheritance taxes at the last death, from the Tax Foundation's table of October 1, 2026
// (20_tax_rules/input/state_death_taxes.json). Graduated states: the rate rises evenly from the lowest rate at the
// exemption to the top rate where the top rate starts, an approximation of each state's own brackets. Flat states
// (Connecticut, Vermont) tax all of the estate above the exemption at one rate. New York taxes the whole estate when it
// exceeds 105% of the exemption (the cliff). Hawaii and Maryland let a couple use two exemptions; the others one.
import table from '../data/state_death_taxes.json';

interface EstateRule { exemption: number; low: number; top: number; topAt: number; indexed?: boolean; portable?: boolean; cliff?: number }

/** State estate tax on an estate (dollars of the year of death); index is inflation since 2026. */
export function stateEstateTax(state: string, estate: number, index: number, couple: boolean): number {
  const r = (table.estate as Record<string, EstateRule>)[state];
  if (!r) return 0;
  const k = r.indexed ? index : 1;
  const exemption = r.exemption * k * (couple && r.portable ? 2 : 1);
  if (estate <= exemption) return 0;
  // New York: past 105% of the exemption, the whole estate is taxed.
  const base = r.cliff && estate > exemption * r.cliff ? 0 : exemption;
  if (r.low === r.top || r.topAt <= 0) return (estate - base) * r.top;
  // Integrate the rate, rising evenly from low at the exemption to top at topAt, then flat.
  const topAt = Math.max(exemption + 1, r.topAt * k);
  const slope = (r.top - r.low) / (topAt - exemption);
  const rate = (x: number) => (x >= topAt ? r.top : r.low + slope * (x - exemption));
  const ramp = (a: number, b: number) => (b <= a ? 0 : ((rate(a) + rate(b)) / 2) * (b - a));
  let tax = 0;
  const lo = Math.max(base, 0);
  // Below the exemption (only reached under New York's cliff) the lowest rate applies.
  if (lo < exemption) tax += (Math.min(estate, exemption) - lo) * r.low;
  tax += ramp(exemption, Math.min(estate, topAt)) + Math.max(0, estate - topAt) * r.top;
  return tax;
}

/** State inheritance tax the heirs pay, by their relationship; the estate is shared equally among them. */
export function stateInheritanceTax(state: string, estate: number, heirs: 'children' | 'siblings' | 'others', count: number): number {
  const r = (table.inheritance as Record<string, Record<string, number[]>>)[state];
  if (!r) return 0;
  const [exempt, rate] = r[heirs];
  const n = Math.max(1, count);
  return n * Math.max(0, estate / n - exempt) * rate;
}

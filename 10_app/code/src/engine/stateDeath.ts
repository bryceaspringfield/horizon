// State estate and inheritance taxes at the last death (20_tax_rules/input/state_death_taxes.json): exemptions from the
// Tax Foundation's table of October 1, 2026, and each state's own brackets and method from its statute or form.
//   excess  brackets on the estate above the exemption (CT, VT, HI, ME, MN, WA)
//   whole   brackets on the whole estate, 0% below the exemption (OR, DC)
//   credit  the old federal state death tax credit (26 U.S.C. 2011) on the estate less $60,000, less the same tax on the
//           exemption (MA, RI)
//   ny      New York's whole-estate table; its credit wipes the tax out up to the exemption and phases out by 105%
//   md      Maryland: the 2011 credit, at most 16% of the estate above the exemption
//   il      Illinois: the lesser of the 2011 credit and 40% of the estate above $4 million, each with the Illinois tax
//           deducted from the estate it is computed on
// Hawaii and Maryland let a couple use two exemptions; the others one.
import table from '../data/state_death_taxes.json';

type Brackets = number[][];
interface EstateRule { exemption: number; method: string; brackets?: Brackets; indexed?: boolean; portable?: boolean }

/** Tax on an amount under marginal brackets given as [start, rate] rows. */
export function marginal(x: number, b: Brackets): number {
  let tax = 0;
  for (let i = 0; i < b.length; i++) {
    const lo = b[i][0], hi = i + 1 < b.length ? b[i + 1][0] : Infinity;
    if (x <= lo) break;
    tax += (Math.min(x, hi) - lo) * b[i][1];
  }
  return tax;
}

const credit2011 = (x: number) => marginal(Math.max(0, x - 60000), table.credit2011 as Brackets);

/** Solves tax = f(estate - tax) for the states which deduct their own tax (Illinois). */
function interrelated(f: (base: number) => number, estate: number): number {
  let t = 0;
  for (let i = 0; i < 60; i++) {
    const next = f(estate - t);
    if (Math.abs(next - t) < 0.01) return next;
    t = next;
  }
  return t;
}

/** State estate tax on an estate (dollars of the year of death); index is inflation since 2026. */
export function stateEstateTax(state: string, estate: number, index: number, couple: boolean): number {
  const r = (table.estate as Record<string, EstateRule>)[state];
  if (!r) return 0;
  const x = r.exemption * (r.indexed ? index : 1) * (couple && r.portable ? 2 : 1);
  if (estate <= x) return 0;
  const b = r.brackets ?? [];
  switch (r.method) {
    case 'excess': return marginal(estate - x, b);
    case 'whole': return Math.max(0, marginal(estate, b) - marginal(x, b));
    case 'credit': return Math.max(0, credit2011(estate) - credit2011(x));
    case 'ny': {
      if (estate > x * 1.05) return marginal(estate, b);
      const credit = marginal(x * (1 - (estate - x) / (0.05 * x)), b);
      return Math.max(0, marginal(estate, b) - credit);
    }
    case 'md': return Math.min(0.16 * (estate - x), credit2011(estate));
    case 'il': return Math.min(interrelated((e) => credit2011(e), estate), (0.4 / 1.4) * (estate - x));
    default: return 0;
  }
}

/** State inheritance tax the heirs pay, by their relationship; the estate is shared equally among them. */
export function stateInheritanceTax(state: string, estate: number, heirs: 'children' | 'siblings' | 'others', count: number): number {
  const r = (table.inheritance as Record<string, Record<string, number[]>>)[state];
  if (!r) return 0;
  const [exempt, rate] = r[heirs];
  const n = Math.max(1, count);
  return n * Math.max(0, estate / n - exempt) * rate;
}

// German income tax, 2026. The tariff of § 32a EStG (gesetze-im-internet.de/estg/__32a.html): nothing to €12,348, two
// progressive zones to €69,878, then 42% and from €277,826 45%; couples filing jointly pay twice the tax on half their
// income (splitting). The solidarity surcharge (SolzG §§ 3-4): 5.5% of income tax above €20,350 (€40,700 jointly), at most
// 11.9% of the excess. Employee social insurance, half of each rate (2026 ceilings €101,400 for pension 18.6% and
// unemployment 2.6%, €69,750 for health 14.6% plus the 2.9% average add-on and care 3.6%), is deducted before income tax,
// with the €1,230 work-expense allowance. A statutory pension starting in 2026 is 84% taxable. Investment income above the
// €1,000 saver's allowance a person pays the flat 25% plus the surcharge (26.375%). Not modeled: church tax, the care
// surcharge for the childless, and the allowance for pensions' own expenses.
import type { TaxInput, TaxResult } from './tax';

/** Income tax by § 32a EStG for one taxable income (2026), rounded down to the euro. */
export function deTariff(income: number): number {
  const x = Math.floor(Math.max(0, income));
  let t: number;
  if (x <= 12348) t = 0;
  else if (x <= 17799) { const y = (x - 12348) / 10000; t = (914.51 * y + 1400) * y; }
  else if (x <= 69878) { const z = (x - 17799) / 10000; t = (173.1 * z + 2397) * z + 1034.87; }
  else if (x <= 277825) t = 0.42 * x - 11135.63;
  else t = 0.45 * x - 19470.38;
  return Math.floor(t);
}

/** The solidarity surcharge on an income tax (single, or joint for a couple). */
export function deSoli(tax: number, joint: boolean): number {
  const free = joint ? 40700 : 20350;
  return tax <= free ? 0 : Math.min(0.055 * tax, 0.119 * (tax - free));
}

/** One employee's share of social insurance on a year's wages (2026). */
export function deSocial(wages: number): number {
  const w = Math.max(0, wages);
  return Math.min(w, 101400) * (0.093 + 0.013) + Math.min(w, 69750) * (0.0875 + 0.018);
}

export function deTax(t: TaxInput): TaxResult {
  const joint = t.status === 'mfj', n = joint ? 2 : 1;
  const wages = t.wages + t.selfEmployment, social = n * deSocial(wages / n);
  const capital = t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains);
  const taxable = Math.max(0, wages - Math.min(wages, 1230 * n) - social - t.preTaxDeductions + t.otherOrdinary + 0.84 * t.socialSecurity);
  const income = joint ? 2 * deTariff(taxable / 2) : deTariff(taxable);
  const soli = deSoli(income, joint);
  const flat = Math.max(0, capital - 1000 * n) * 0.26375;
  const total = income + soli + flat + social;
  const gross = wages + t.otherOrdinary + capital + t.socialSecurity;
  const per = taxable / n, marginal = per > 277825 ? 0.45 : per > 69878 ? 0.42 : per > 12348 ? (deTariff(per + 100) - deTariff(per)) / 100 : 0;
  return { federal: income + soli, capitalGains: flat, niit: 0, fica: social, state: 0, penalty: 0, total, taxableIncome: taxable, ordinaryTaxable: taxable,
    taxableSocialSecurity: 0.84 * t.socialSecurity, marginalRate: marginal * (soli > 0 ? 1.055 : 1), effectiveRate: gross > 0 ? total / gross : 0, agi: gross - t.preTaxDeductions,
    deduction: social + Math.min(wages, 1230 * n), itemized: false, credits: 0, amt: 0, local: 0, foreignExclusion: 0, foreignTaxCredit: 0, foreignTaxPaid: 0, seniorDeduction: 0, qbi: 0 };
}

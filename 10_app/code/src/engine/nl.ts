// Dutch income tax, 2026, from the Belastingdienst (belastingdienst.nl, box 1: uitleg en tarieven; tabel algemene
// heffingskorting 2026; tabel arbeidskorting 2026; box 3: uitleg en tarieven). Box 1, below the state pension age: 35.75% to
// €38,883 (national insurance premiums included), 37.56% to €78,426, 49.50% above, less the general tax credit (€3,115,
// less 6.398% of income over €29,736) and the work credit on earnings. Box 3 taxes a deemed return on savings and investments
// above the tax-free allowance at 36%. The allowance (€59,357 a person) and the deemed returns (1.28% on bank balances,
// 6.00% on other assets) come from secondary sources that agree, not yet the Belastingdienst's own page. Each person is
// taxed alone: a couple's income is split evenly. Not modeled: the rates after the state pension age, box 2, and the
// mortgage interest deduction.
import { bracketTax, type TaxInput, type TaxResult } from './tax';

export const NL_BOX1 = [[0, 0.3575], [38883, 0.3756], [78426, 0.495]];

/** The general tax credit on a person's income (2026, below the state pension age). */
export function nlGeneralCredit(income: number): number {
  return income <= 29736 ? 3115 : income <= 78426 ? Math.max(0, 3115 - 0.06398 * (income - 29736)) : 0;
}

/** The work tax credit on a person's earnings (2026, below the state pension age). */
export function nlWorkCredit(e: number): number {
  if (e <= 11965) return 0.08324 * e;
  if (e <= 25845) return 996 + 0.31009 * (e - 11965);
  if (e <= 45592) return 5300 + 0.0195 * (e - 25845);
  if (e <= 132920) return Math.max(0, 5685 - 0.0651 * (e - 45592));
  return 0;
}

/** One person's box 1 tax after credits. */
export function nlBox1(income: number, earnings: number): number {
  return Math.max(0, bracketTax(Math.max(0, income), NL_BOX1) - nlGeneralCredit(income) - nlWorkCredit(earnings));
}

/** Box 3 on a person's savings and other investments. */
export function nlBox3(cash: number, other: number): number {
  const wealth = Math.max(0, cash) + Math.max(0, other);
  if (wealth <= 59357) return 0;
  const ret = Math.max(0, cash) * 0.0128 + Math.max(0, other) * 0.06;
  return 0.36 * ret * (wealth - 59357) / wealth;
}

export function nlTax(t: TaxInput): TaxResult {
  const n = t.status === 'mfj' ? 2 : 1;
  const earnings = (t.wages + t.selfEmployment - t.preTaxDeductions) / n;
  const income = earnings + (t.otherOrdinary + t.socialSecurity) / n;
  const box1 = n * nlBox1(income, Math.max(0, earnings));
  const box3 = n * nlBox3((t.wealthCash ?? 0) / n, (t.wealthOther ?? 0) / n);
  const total = box1 + box3;
  const gross = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains) + t.socialSecurity;
  const marginal = income > 78426 ? 0.495 : income > 38883 ? 0.3756 : 0.3575;
  return { federal: box1, capitalGains: box3, niit: 0, fica: 0, state: 0, penalty: 0, total, taxableIncome: income * n, ordinaryTaxable: income * n,
    taxableSocialSecurity: t.socialSecurity, marginalRate: marginal, effectiveRate: gross > 0 ? total / gross : 0, agi: gross - t.preTaxDeductions,
    deduction: 0, itemized: false, credits: 0, amt: 0, local: 0, foreignExclusion: 0, foreignTaxCredit: 0, foreignTaxPaid: 0, seniorDeduction: 0, qbi: 0 };
}

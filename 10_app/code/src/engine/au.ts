// Australian resident income tax, 2026-27 (from 1 July 2026), from the ATO: ato.gov.au/tax-rates-and-codes/
// tax-rates-australian-residents and the Treasury Laws Amendment (More Cost of Living Relief) Act 2025 (15% lowest rate).
// Each person is taxed alone: a couple's income is split evenly. The Medicare levy is 2% of taxable income; the low income
// tax offset (LITO) is $700 to $37,500, less 5c a dollar to $45,000, then 1.5c a dollar to $66,667. A capital gain on
// an asset held over 12 months is halved (the CGT discount). The levy phases in at 10c a dollar above the low-income
// threshold ($28,011, or $44,268 with the seniors offset: the ATO's latest, 2025-26; 2026-27's are not yet published). Without
// private hospital cover the Medicare levy surcharge applies (2026-27: 1%, 1.25%, 1.5% from $105,000, $123,001, $164,001
// single; double for families; ato.gov.au, Medicare levy surcharge income, thresholds and rates). Superannuation withdrawals are tax-free from 60 (each person's share of them, by how many are 60).
import { bracketTax, type TaxInput, type TaxResult } from './tax';

export const AU_BRACKETS = [[0, 0], [18200, 0.15], [45000, 0.3], [135000, 0.37], [190000, 0.45]];

/** One resident's income tax, Medicare levy, and marginal rate on a taxable income. */
export function auPerson(taxable: number, senior = false, noCover = false, family = false) {
  const base = bracketTax(taxable, AU_BRACKETS);
  const lito = taxable <= 37500 ? 700 : taxable <= 45000 ? 700 - 0.05 * (taxable - 37500) : Math.max(0, 325 - 0.015 * (taxable - 45000));
  const low = senior ? 44268 : 28011;
  const levy = Math.min(0.02 * taxable, Math.max(0, 0.1 * (taxable - low)));
  const k = family ? 2 : 1;
  const mls = noCover ? taxable * (taxable > 164000 * k ? 0.015 : taxable > 123000 * k ? 0.0125 : taxable > 105000 * k ? 0.01 : 0) : 0;
  const income = Math.max(0, base - lito), medicare = levy + mls;
  const marginal = [...AU_BRACKETS].reverse().find(([lo]) => taxable > lo)?.[1] ?? 0;
  return { income, medicare, marginal: marginal + 0.02 };
}

/** Australia in the shape of the engine's tax result: income tax in federal, the Medicare levy in fica. */
export function auTax(t: TaxInput): TaxResult {
  const n = t.status === 'mfj' ? 2 : 1;
  const gains = Math.max(0, t.longTermGains) * 0.5;
  const superTaxed = 1 - Math.min(n, t.over60 ?? 0) / n;
  const taxable = Math.max(0, t.wages + t.selfEmployment - t.preTaxDeductions + t.otherOrdinary * superTaxed + t.socialSecurity + t.interest + t.qualifiedDividends + gains);
  const per = auPerson(taxable / n, (t.over65 ?? 0) >= n, !!t.auNoCover, n === 2);
  const income = per.income * n, levy = per.medicare * n, total = income + levy;
  const gross = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains) + t.socialSecurity;
  return { federal: income, capitalGains: 0, niit: 0, fica: levy, state: 0, penalty: 0, total, taxableIncome: taxable, ordinaryTaxable: taxable,
    taxableSocialSecurity: t.socialSecurity, marginalRate: per.marginal, effectiveRate: gross > 0 ? total / gross : 0, agi: gross - t.preTaxDeductions,
    deduction: 0, itemized: false, credits: 0, amt: 0, local: 0, foreignExclusion: 0, foreignTaxCredit: 0, foreignTaxPaid: 0, seniorDeduction: 0, qbi: 0 };
}

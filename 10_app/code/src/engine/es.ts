// Spanish taxes, 2026, from the consolidated laws on boe.es. Income tax (Ley 35/2006): the state general scale of article
// 63 (9.5% to 24.5%) doubled for the reference regional scale (19% to 47% in all), the savings scale of article 66 (9.5% to
// 15%, doubled: 19% to 30%), the personal minimum of article 57 (€5,550, €1,150 more over 65) taxed at the scale's own rates
// and subtracted. Wealth tax (Ley 19/1991): €700,000 exempt (article 28), the main home's first €300,000 exempt, the state
// scale of article 30 (0.2% to 3.5%), and the cap of article 31 (income and wealth tax together at most 60% of the income
// tax base, the wealth tax cut by at most 80%). Employee social security 6.50% to €61,214.40 a year comes from secondary
// sources, not yet the 2026 contribution order. Each person is taxed alone: a couple's income and wealth are split evenly.
// Not modeled: regional scales other than the reference, and regional wealth tax allowances.
import { bracketTax, type TaxInput, type TaxResult } from './tax';

const STATE_GENERAL = [[0, 0.095], [12450, 0.12], [20200, 0.15], [35200, 0.185], [60000, 0.225], [300000, 0.245]];
const STATE_SAVINGS = [[0, 0.095], [6000, 0.105], [50000, 0.115], [200000, 0.135], [300000, 0.15]];
export const ES_GENERAL = STATE_GENERAL.map(([a, r]) => [a, 2 * r]);
export const ES_SAVINGS = STATE_SAVINGS.map(([a, r]) => [a, 2 * r]);
const WEALTH = [[0, 0.002], [167129.45, 0.003], [334252.88, 0.005], [668499.75, 0.009], [1336999.51, 0.013], [2673999.01, 0.017], [5347998.03, 0.021], [10695996.06, 0.035]];

/** One person's income tax: the general base, the savings base, and the personal minimum (taken from the general base first). */
export function esIncomeTax(general: number, savings: number, over65 = false): number {
  const min = 5550 + (over65 ? 1150 : 0);
  const g = Math.max(0, bracketTax(general, ES_GENERAL) - bracketTax(Math.min(min, general), ES_GENERAL));
  const left = Math.max(0, min - general);
  const s = Math.max(0, bracketTax(savings, ES_SAVINGS) - bracketTax(Math.min(left, savings), ES_SAVINGS));
  return g + s;
}

/** One person's wealth tax before the cap, on net wealth and the main home's value. */
export function esWealthTax(wealth: number, home = 0): number {
  return bracketTax(Math.max(0, wealth - Math.min(home, 300000) - 700000), WEALTH);
}

export function esTax(t: TaxInput): TaxResult {
  const n = t.status === 'mfj' ? 2 : 1;
  const wages = t.wages + t.selfEmployment, social = n * Math.min(wages / n, 61214.4) * 0.065;
  const general = Math.max(0, wages - social - t.preTaxDeductions + t.otherOrdinary + t.socialSecurity) / n;
  const savings = (t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains)) / n;
  const income = esIncomeTax(general, savings, (t.over65 ?? 0) >= n);
  const rawWealth = esWealthTax(((t.wealthCash ?? 0) + (t.wealthOther ?? 0)) / n, (t.wealthHome ?? 0) / n);
  const capRoom = Math.max(0, 0.6 * (general + savings) - income);
  const wealth = rawWealth > capRoom ? Math.max(rawWealth * 0.2, capRoom) : rawWealth;
  const total = n * (income + wealth) + social;
  const gross = wages + t.otherOrdinary + t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains) + t.socialSecurity;
  const rate = [...ES_GENERAL].reverse().find(([a]) => general > a)?.[1] ?? 0;
  return { federal: n * income, capitalGains: n * wealth, niit: 0, fica: social, state: 0, penalty: 0, total, taxableIncome: n * (general + savings),
    ordinaryTaxable: n * general, taxableSocialSecurity: t.socialSecurity, marginalRate: rate, effectiveRate: gross > 0 ? total / gross : 0, agi: gross - t.preTaxDeductions,
    deduction: 0, itemized: false, credits: 0, amt: 0, local: 0, foreignExclusion: 0, foreignTaxCredit: 0, foreignTaxPaid: 0, seniorDeduction: 0, qbi: 0 };
}

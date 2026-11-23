// United Kingdom income tax, National Insurance, and capital gains tax (England, Wales, and Northern Ireland), 2026 to 2027,
// from HMRC: gov.uk/government/publications/rates-and-allowances-income-tax (bands and the personal allowance, frozen through
// 2030 to 2031 by Budget 2026), gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027 (Class 1 NI),
// and gov.uk/government/publications/changes-to-tax-rates-for-property-savings-and-dividend-income (dividend rates from
// April 2026). The UK taxes each person: a couple's income is split evenly between the two. Not modeled: Scotland's bands,
// the 25% tax-free pension lump sum, and the 2-point rise in savings rates from April 2027.
import type { TaxInput, TaxResult } from './tax';

export const UK = {
  personalAllowance: 12570, taperFrom: 100000, basicBand: 37700, additionalFrom: 125140,
  rates: { basic: 0.2, higher: 0.4, additional: 0.45 },
  dividend: { allowance: 500, basic: 0.1075, higher: 0.3575, additional: 0.3935 },
  savings: { startingBand: 5000, psaBasic: 1000, psaHigher: 500 },
  cgt: { exempt: 3000, basic: 0.18, higher: 0.24 },
  ni: { primary: 12570, upper: 50270, main: 0.08, above: 0.02 },
};

/** One person's UK taxes, in pounds, with thresholds raised by the index (1 while they stay frozen). */
export function ukPerson(p: { earned: number; pension: number; savings: number; dividends: number; gains: number; employment: number }, k = 1) {
  const u = UK;
  const total = p.earned + p.pension + p.savings + p.dividends;
  const pa = Math.max(0, u.personalAllowance * k - Math.max(0, total - u.taperFrom * k) / 2);
  const basicTop = u.basicBand * k, addFrom = Math.max(0, u.additionalFrom * k - pa);
  // Non-savings income first, then savings, then dividends, each on the bands the earlier layers left.
  let used = 0, tax = 0, marginal = 0;
  const band = (amt: number, rates: [number, number, number]) => {
    let t = 0;
    for (const [hi, r] of [[basicTop, rates[0]], [addFrom, rates[1]], [Infinity, rates[2]]] as [number, number][]) {
      const room = Math.max(0, hi - used), take = Math.min(room, amt);
      if (take > 0) { t += take * r; used += take; amt -= take; marginal = r; }
    }
    return t;
  };
  const allowanceLeft = (x: number) => { const a = Math.min(x, paLeft); paLeft -= a; return x - a; };
  let paLeft = pa;
  const nonSav = allowanceLeft(p.earned + p.pension);
  tax += band(nonSav, [u.rates.basic, u.rates.higher, u.rates.additional]);
  let sav = allowanceLeft(p.savings);
  const starting = Math.max(0, u.savings.startingBand * k - nonSav), free0 = Math.min(sav, starting);
  used += free0; sav -= free0;
  const psa = used + sav > addFrom ? 0 : used + sav > basicTop ? u.savings.psaHigher * k : u.savings.psaBasic * k, free1 = Math.min(sav, psa);
  used += free1; sav -= free1;
  tax += band(sav, [u.rates.basic, u.rates.higher, u.rates.additional]);
  let div = allowanceLeft(p.dividends);
  const dAllow = Math.min(div, u.dividend.allowance * k);
  used += dAllow; div -= dAllow;
  tax += band(div, [u.dividend.basic, u.dividend.higher, u.dividend.additional]);
  const g = Math.max(0, p.gains - u.cgt.exempt * k), basicLeft = Math.max(0, basicTop - used);
  const cgt = Math.min(g, basicLeft) * u.cgt.basic + Math.max(0, g - basicLeft) * u.cgt.higher;
  const ni = Math.max(0, Math.min(p.employment, u.ni.upper * k) - u.ni.primary * k) * u.ni.main + Math.max(0, p.employment - u.ni.upper * k) * u.ni.above;
  return { income: tax, cgt, ni, taxable: Math.max(0, total - pa), allowance: pa, marginal };
}

/** The UK in the shape of the engine's tax result: income tax in federal, NI in fica, capital gains tax on its own line. */
export function ukTax(t: TaxInput): TaxResult {
  const n = t.status === 'mfj' ? 2 : 1, k = 1;
  const per = ukPerson({
    earned: (t.wages + t.selfEmployment - t.preTaxDeductions) / n, pension: (t.otherOrdinary + t.socialSecurity) / n,
    savings: t.interest / n, dividends: t.qualifiedDividends / n, gains: Math.max(0, t.longTermGains) / n, employment: (t.wages + t.selfEmployment) / n,
  }, k);
  const income = per.income * n, cgt = per.cgt * n, ni = per.ni * n, total = income + cgt + ni;
  const gross = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains) + t.socialSecurity;
  return { federal: income, capitalGains: cgt, niit: 0, fica: ni, state: 0, penalty: 0, total, taxableIncome: per.taxable * n,
    ordinaryTaxable: per.taxable * n, taxableSocialSecurity: t.socialSecurity, marginalRate: per.marginal, effectiveRate: gross > 0 ? total / gross : 0,
    agi: gross - t.preTaxDeductions, deduction: per.allowance * n, itemized: false, credits: 0, amt: 0, local: 0, foreignExclusion: 0, foreignTaxCredit: 0,
    foreignTaxPaid: 0, seniorDeduction: 0, qbi: 0 };
}

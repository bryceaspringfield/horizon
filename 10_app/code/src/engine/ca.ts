// Canadian income tax, 2026: federal and Ontario, from the CRA's T4032 payroll deductions tables for January 2026
// (canada.ca/content/dam/cra-arc/migration/cra-arc/tx/bsnss/tpcs/pyrll/t4032/2026/t4032-on-1-26e.pdf and -oc-1-26e.pdf).
// Each person is taxed alone: a couple's income is split evenly. Credits at the lowest rate: the basic personal amount
// (federal $16,452, falling to $14,829 between $181,440 and $258,482; Ontario $12,989), the Canada employment amount
// ($1,501), base CPP contributions, and EI premiums; the enhanced CPP contributions are deducted. Ontario adds its surtax
// and health premium. Capital gains are half included. Not modeled: other provinces, the OAS recovery tax, and Ontario's
// low-income tax reduction.
import { bracketTax, type TaxInput, type TaxResult } from './tax';

export const CA = {
  federal: [[0, 0.14], [58523, 0.205], [117045, 0.26], [181440, 0.29], [258482, 0.33]],
  bpa: { max: 16452, min: 14829, from: 181440, to: 258482 }, employmentAmount: 1501,
  ontario: [[0, 0.0505], [53891, 0.0915], [107785, 0.1116], [150000, 0.1216], [220000, 0.1316]], ontarioBpa: 12989,
  cpp: { ympe: 74600, yampe: 85000, exemption: 3500, base: 0.0495, first: 0.01, second: 0.04 },
  ei: { rate: 0.0163, maxPremium: 1123.07 },
};

/** Ontario's health premium on taxable income (T4032-ON, 2026). */
function healthPremium(x: number): number {
  if (x <= 20000) return 0;
  if (x <= 36000) return Math.min(300, 0.06 * (x - 20000));
  if (x <= 48000) return Math.min(450, 300 + 0.06 * (x - 36000));
  if (x <= 72000) return Math.min(600, 450 + 0.25 * (x - 48000));
  if (x <= 200000) return Math.min(750, 600 + 0.25 * (x - 72000));
  return Math.min(900, 750 + 0.25 * (x - 200000));
}

/** One Ontario resident's federal tax, Ontario tax, CPP, and EI. */
export function caPerson(p: { employment: number; other: number }) {
  const c = CA.cpp, e = Math.max(0, p.employment);
  const pensionable = Math.max(0, Math.min(e, c.ympe) - c.exemption);
  const cppBase = pensionable * c.base, cppFirst = pensionable * c.first, cpp2 = Math.max(0, Math.min(e, c.yampe) - c.ympe) * c.second;
  const ei = Math.min(CA.ei.maxPremium, e * CA.ei.rate);
  const taxable = Math.max(0, e + p.other - cppFirst - cpp2);
  const b = CA.bpa, bpa = taxable <= b.from ? b.max : taxable >= b.to ? b.min : b.max - (b.max - b.min) * (taxable - b.from) / (b.to - b.from);
  const fedCredits = 0.14 * (bpa + (e > 0 ? Math.min(CA.employmentAmount, e) : 0) + cppBase + ei);
  const federal = Math.max(0, bracketTax(taxable, CA.federal) - fedCredits);
  const onBasic = Math.max(0, bracketTax(taxable, CA.ontario) - 0.0505 * (CA.ontarioBpa + cppBase + ei));
  const surtax = 0.2 * Math.max(0, onBasic - 5818) + 0.36 * Math.max(0, onBasic - 7446);
  const ontario = onBasic + surtax + healthPremium(taxable);
  const fedRate = [...CA.federal].reverse().find(([lo]) => taxable > lo)?.[1] ?? 0.14;
  const onRate = [...CA.ontario].reverse().find(([lo]) => taxable > lo)?.[1] ?? 0.0505;
  return { federal, ontario, cpp: cppBase + cppFirst + cpp2, ei, taxable, marginal: fedRate + onRate * (surtax > 0 ? 1.56 : 1) };
}

/** Canada (Ontario) in the shape of the engine's tax result: federal tax, Ontario tax in state, CPP and EI in fica. */
export function caTax(t: TaxInput): TaxResult {
  const n = t.status === 'mfj' ? 2 : 1;
  const employment = (t.wages + t.selfEmployment) / n;
  const other = (t.otherOrdinary + t.socialSecurity + t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains) * 0.5 - t.preTaxDeductions) / n;
  const per = caPerson({ employment, other });
  const federal = per.federal * n, state = per.ontario * n, fica = (per.cpp + per.ei) * n, total = federal + state + fica;
  const gross = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains) + t.socialSecurity;
  return { federal, capitalGains: 0, niit: 0, fica, state, penalty: 0, total, taxableIncome: per.taxable * n, ordinaryTaxable: per.taxable * n,
    taxableSocialSecurity: t.socialSecurity, marginalRate: per.marginal, effectiveRate: gross > 0 ? total / gross : 0, agi: gross - t.preTaxDeductions,
    deduction: 0, itemized: false, credits: 0, amt: 0, local: 0, foreignExclusion: 0, foreignTaxCredit: 0, foreignTaxPaid: 0, seniorDeduction: 0, qbi: 0 };
}

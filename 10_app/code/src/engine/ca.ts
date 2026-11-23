// Canadian income tax, 2026: federal and every province and territory, from the CRA's T4032 payroll deductions tables for
// January 2026 (canada.ca/content/dam/cra-arc/migration/cra-arc/tx/bsnss/tpcs/pyrll/t4032/2026/t4032-XX-1-26e.pdf; Prince
// Edward Island's July table, -7-26e). Each person is taxed alone: a couple's income is split evenly. Credits at the lowest
// rate: the basic personal amount (federal $16,452, falling to $14,829 between $181,440 and $258,482), the Canada employment
// amount ($1,501), base CPP contributions, and EI premiums; the enhanced CPP contributions are deducted. Ontario adds its
// surtax and health premium; British Columbia its tax reduction (up to $575, less 3.56% of income over $25,570). Quebec
// (revenuquebec.ca income tax rates and Finance Quebec's 2026 parameters): its own brackets and $18,952 basic amount, the
// 16.5% federal abatement, QPP (5.3% base) in place of CPP, QPIP (0.43% to $103,000), and EI at 1.30%. Capital gains are half
// included. The OAS recovery tax takes back 15% of net income over $95,323 (2026 income; canada.ca/en/services/benefits/
// publicpensions/old-age-security/recovery-tax.html), at most the public pension received. Ontario's low-income tax
// reduction is twice its $300 basic amount less provincial tax with $575 more a child.
import { bracketTax, type TaxInput, type TaxResult } from './tax';

export const CA = {
  federal: [[0, 0.14], [58523, 0.205], [117045, 0.26], [181440, 0.29], [258482, 0.33]],
  bpa: { max: 16452, min: 14829, from: 181440, to: 258482 }, employmentAmount: 1501,
  ontario: [[0, 0.0505], [53891, 0.0915], [107785, 0.1116], [150000, 0.1216], [220000, 0.1316]], ontarioBpa: 12989,
  cpp: { ympe: 74600, yampe: 85000, exemption: 3500, base: 0.0495, first: 0.01, second: 0.04 },
  ei: { rate: 0.0163, maxPremium: 1123.07 },
};

export const PROVINCES: Record<string, { name: string; brackets: number[][]; bpa: number }> = {
  NL: { name: 'Newfoundland and Labrador', brackets: [[0, 0.087], [44678, 0.145], [89354, 0.158], [159528, 0.178], [223340, 0.198], [285319, 0.208], [570638, 0.213], [1141275, 0.218]], bpa: 11188 },
  PE: { name: 'Prince Edward Island', brackets: [[0, 0.095], [33928, 0.1347], [65820, 0.166], [106890, 0.1762], [142250, 0.19]], bpa: 14650 },
  NS: { name: 'Nova Scotia', brackets: [[0, 0.0879], [30995, 0.1495], [61991, 0.1667], [97417, 0.175], [157124, 0.21]], bpa: 11932 },
  NB: { name: 'New Brunswick', brackets: [[0, 0.094], [52333, 0.14], [104666, 0.16], [193861, 0.195]], bpa: 13664 },
  ON: { name: 'Ontario', brackets: [[0, 0.0505], [53891, 0.0915], [107785, 0.1116], [150000, 0.1216], [220000, 0.1316]], bpa: 12989 },
  MB: { name: 'Manitoba', brackets: [[0, 0.108], [47000, 0.1275], [100000, 0.174]], bpa: 15780 },
  SK: { name: 'Saskatchewan', brackets: [[0, 0.105], [54532, 0.125], [155805, 0.145]], bpa: 20381 },
  AB: { name: 'Alberta', brackets: [[0, 0.08], [61200, 0.1], [154259, 0.12], [185111, 0.13], [246813, 0.14], [370220, 0.15]], bpa: 22769 },
  BC: { name: 'British Columbia', brackets: [[0, 0.0506], [50363, 0.077], [100728, 0.105], [115648, 0.1229], [140430, 0.147], [190405, 0.168], [265545, 0.205]], bpa: 13216 },
  YT: { name: 'Yukon', brackets: [[0, 0.064], [58523, 0.09], [117045, 0.109], [181440, 0.128], [500000, 0.15]], bpa: 16452 },
  NT: { name: 'Northwest Territories', brackets: [[0, 0.059], [53003, 0.086], [106009, 0.122], [172346, 0.1405]], bpa: 18198 },
  QC: { name: 'Quebec', brackets: [[0, 0.14], [54345, 0.19], [108680, 0.24], [132245, 0.2575]], bpa: 18952 },
  NU: { name: 'Nunavut', brackets: [[0, 0.04], [55801, 0.07], [111602, 0.09], [181439, 0.115]], bpa: 19659 },
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
export function caPerson(p: { employment: number; other: number; oas?: number; kids?: number; over65?: boolean; alone?: boolean; pension?: number }, province = 'ON') {
  const pr = PROVINCES[province] ?? PROVINCES.ON, low = pr.brackets[0][1];
  const c = CA.cpp, e = Math.max(0, p.employment);
  const pensionable = Math.max(0, Math.min(e, c.ympe) - c.exemption);
  const qc = province === 'QC';
  const cppBase = pensionable * (qc ? 0.053 : c.base), cppFirst = pensionable * c.first, cpp2 = Math.max(0, Math.min(e, c.yampe) - c.ympe) * c.second;
  const ei = qc ? Math.min(895.7, e * 0.013) : Math.min(CA.ei.maxPremium, e * CA.ei.rate);
  const qpip = qc ? Math.min(e, 103000) * 0.0043 : 0;
  const taxable = Math.max(0, e + p.other - cppFirst - cpp2);
  const b = CA.bpa, bpa = taxable <= b.from ? b.max : taxable >= b.to ? b.min : b.max - (b.max - b.min) * (taxable - b.from) / (b.to - b.from);
  const fedCredits = 0.14 * (bpa + (e > 0 ? Math.min(CA.employmentAmount, e) : 0) + cppBase + ei);
  const fedBasic = Math.max(0, bracketTax(taxable, CA.federal) - fedCredits - 0.14 * qpip);
  const federal = qc ? fedBasic * (1 - 0.165) : fedBasic;
  const bcReduction = province === 'BC' ? Math.max(0, 575 - 0.0356 * Math.max(0, taxable - 25570)) : 0;
  // Quebec's amounts for living alone ($2,172), age 65 or more ($3,986), and retirement income (up to $3,541), together less 15% of
  // net income over $42,955, credited at 14% (Finance Quebec, parameters of the personal income tax system for 2026)
  const qcExtra = qc ? Math.max(0, (p.alone ? 2172 : 0) + (p.over65 ? 3986 : 0) + Math.min(3541, p.pension ?? 0) - 0.15 * Math.max(0, taxable - 42955)) : 0;
  const onBasic = Math.max(0, bracketTax(taxable, pr.brackets) - low * (pr.bpa + qcExtra + (qc ? 0 : cppBase + ei)) - bcReduction);
  const surtax = province === 'ON' ? 0.2 * Math.max(0, onBasic - 5818) + 0.36 * Math.max(0, onBasic - 7446) : 0;
  // Ontario's tax reduction (T4032-ON 2026): twice the $300 basic reduction amount less the provincial tax, at most that tax
  const pre = onBasic + surtax, onReduction = province === 'ON' ? Math.min(pre, Math.max(0, 2 * (300 + 575 * (p.kids ?? 0)) - pre)) : 0;
  const ontario = pre - onReduction + (province === 'ON' ? healthPremium(taxable) : 0);
  const fedRate = [...CA.federal].reverse().find(([lo]) => taxable > lo)?.[1] ?? 0.14;
  const onRate = [...pr.brackets].reverse().find(([lo]) => taxable > lo)?.[1] ?? low;
  const oasRecovery = Math.min(p.oas ?? 0, 0.15 * Math.max(0, taxable - 95323));
  return { federal: federal + oasRecovery, oasRecovery, ontario, cpp: cppBase + cppFirst + cpp2, ei: ei + qpip, taxable, marginal: fedRate + onRate * (surtax > 0 ? 1.56 : 1) };
}

/** Canada (Ontario) in the shape of the engine's tax result: federal tax, Ontario tax in state, CPP and EI in fica. */
export function caTax(t: TaxInput): TaxResult {
  const n = t.status === 'mfj' ? 2 : 1;
  const employment = (t.wages + t.selfEmployment) / n;
  const other = (t.otherOrdinary + t.socialSecurity + t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains) * 0.5 - t.preTaxDeductions) / n;
  const per = caPerson({ employment, other, oas: t.socialSecurity / n, kids: (t.children ?? 0) / n, over65: (t.over65 ?? 0) >= n, alone: n === 1, pension: t.otherOrdinary / n }, t.province);
  const federal = per.federal * n, state = per.ontario * n, fica = (per.cpp + per.ei) * n, total = federal + state + fica;
  const gross = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains) + t.socialSecurity;
  return { federal, capitalGains: 0, niit: 0, fica, state, penalty: 0, total, taxableIncome: per.taxable * n, ordinaryTaxable: per.taxable * n,
    taxableSocialSecurity: t.socialSecurity, marginalRate: per.marginal, effectiveRate: gross > 0 ? total / gross : 0, agi: gross - t.preTaxDeductions,
    deduction: 0, itemized: false, credits: 0, amt: 0, local: 0, foreignExclusion: 0, foreignTaxCredit: 0, foreignTaxPaid: 0, seniorDeduction: 0, qbi: 0 };
}

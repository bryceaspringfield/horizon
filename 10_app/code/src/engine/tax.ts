// US federal and state income tax for one household-year, plus the health premiums tied to income (Medicare with
// IRMAA, the ACA premium tax credit). Each year uses the newest published rules at or before it (2026, 2027), with
// dollar amounts indexed by the plan's inflation after that rules year.
import federalYears from '../data/federal.json';
import states from '../data/states.json';
import health from '../data/healthcare.json';
import type { FilingStatus } from './types';

type Bracket = [number, number];
export type Rules = (typeof federalYears)['2026'];
const YEARS = Object.keys(federalYears).map(Number).sort((a, b) => a - b);

/** The newest published rules at or before this year (the first table for earlier years). */
export function rulesFor(year: number): { rules: Rules; year: number } {
  let y = YEARS[0];
  for (const k of YEARS) if (k <= year) y = k;
  return { rules: (federalYears as unknown as Record<string, Rules>)[String(y)], year: y };
}

/** The rules of the first table, for code which needs no year (RMD table, Social Security formula). */
export const rules = rulesFor(YEARS[0]).rules;

export interface TaxInput {
  year: number;
  status: FilingStatus;
  /** Inflation since the year of the rules in force (1.0 in that year). */
  index: number;
  wages: number;
  selfEmployment: number;
  /** Ordinary income besides wages: pension, traditional withdrawals, Roth conversions, rental. */
  otherOrdinary: number;
  /** Interest and nonqualified dividends: ordinary income which also counts for the NIIT. */
  interest: number;
  qualifiedDividends: number;
  longTermGains: number;
  socialSecurity: number;
  /** Pre-tax contributions which lower taxable wages (401(k), traditional IRA, HSA). */
  preTaxDeductions: number;
  earlyWithdrawals: number;
  /** People aged 65 or more. */
  over65: number;
  state: string;
  /** Itemized deductions other than state and local taxes: mortgage interest and charity. */
  itemizedOther?: number;
  /** Property tax, which joins state income tax under the SALT cap. */
  propertyTax?: number;
  itemize?: boolean;
}

export interface TaxResult {
  federal: number;
  capitalGains: number;
  niit: number;
  fica: number;
  state: number;
  penalty: number;
  total: number;
  taxableIncome: number;
  ordinaryTaxable: number;
  taxableSocialSecurity: number;
  marginalRate: number;
  effectiveRate: number;
  agi: number;
  deduction: number;
  itemized: boolean;
}

const scale = (brackets: number[][], k: number): Bracket[] => brackets.map(([t, r]) => [t * k, r]);

/** Tax on income through progressive brackets. */
export function bracketTax(income: number, brackets: number[][]): number {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [lo, rate] = brackets[i];
    const hi = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    if (income <= lo) break;
    tax += (Math.min(income, hi) - lo) * rate;
  }
  return tax;
}

export function marginalRate(income: number, brackets: number[][]): number {
  let rate = brackets[0][1];
  for (const [lo, r] of brackets) if (income > lo) rate = r;
  return rate;
}

/** The ordinary taxable income at which a bracket of this rate ends (Roth conversions fill up to it). */
export function bracketTop(rate: number, status: FilingStatus, year: number, index: number): number {
  const b = scale(rulesFor(year).rules.brackets[status], index);
  for (let i = 0; i < b.length; i++) if (Math.abs(b[i][1] - rate) < 1e-9) return i + 1 < b.length ? b[i + 1][0] : Infinity;
  return 0;
}

/** The taxable income at which the 0% long-term capital gains band ends. */
export function zeroGainsTop(status: FilingStatus, year: number, index: number): number {
  return rulesFor(year).rules.capitalGains[status][1][0] * index;
}

export function standardDeduction(status: FilingStatus, year: number, index: number, over65: number): number {
  const r = rulesFor(year).rules;
  const extra = status === 'mfj' ? r.additionalDeduction65.married : r.additionalDeduction65.unmarried;
  return (r.standardDeduction[status] + extra * over65) * index;
}

/** The SALT cap for a year and income (IRC 164(b)(7) as amended in 2025); the statute sets the dollar amounts. */
export function saltCap(year: number, magi: number): number {
  const s = health.salt;
  if (year >= 2030) return s.after2029;
  const y = String(Math.max(2025, Math.min(2029, year)));
  const cap = (s.cap as Record<string, number>)[y];
  const threshold = (s.threshold as Record<string, number>)[y];
  return Math.max(s.floor, cap - s.phaseDownRate * Math.max(0, magi - threshold));
}

/** The taxable part of Social Security benefits (IRS Pub. 915's worksheet; the thresholds are not indexed). */
export function taxableSocialSecurity(benefits: number, otherIncome: number, status: FilingStatus): number {
  if (benefits <= 0) return 0;
  const [base1, base2] = rules.socialSecurityTaxation[status];
  const provisional = otherIncome + benefits / 2;
  if (provisional <= base1) return 0;
  if (provisional <= base2) return Math.min(0.5 * benefits, 0.5 * (provisional - base1));
  return Math.min(0.85 * benefits, 0.85 * (provisional - base2) + Math.min(0.5 * benefits, 0.5 * (base2 - base1)));
}

export function fica(wages: number, selfEmployment: number, status: FilingStatus, year: number, index: number): number {
  const r = rulesFor(year).rules;
  const f = r.fica;
  const base = f.wageBase * index;
  const ss = Math.min(wages, base) * f.socialSecurityRate;
  const se = selfEmployment * r.selfEmployment.rateShare;
  const seSs = Math.max(0, Math.min(se, base - wages)) * f.socialSecurityRate * 2;
  const medicare = wages * f.medicareRate + se * f.medicareRate * 2;
  const addl = Math.max(0, wages + se - f.additionalMedicareThreshold[status]) * f.additionalMedicareRate;
  return ss + seSs + medicare + addl;
}

interface StateRule {
  brackets: Record<string, number[][]>;
  standardDeduction: Record<string, number>;
  exemption: Record<string, number>;
  taxesSocialSecurity: boolean;
}

export function stateTax(state: string, agi: number, ssTaxable: number, status: FilingStatus, index: number): number {
  const rule = (states as unknown as Record<string, StateRule>)[state];
  if (!rule) return 0;
  const key = status === 'hoh' && !rule.brackets.hoh ? 'single' : status;
  const brackets = rule.brackets[key] ?? rule.brackets.single;
  if (!brackets || brackets.length === 0) return 0;
  const base = rule.taxesSocialSecurity ? agi : agi - ssTaxable;
  const deduction = ((rule.standardDeduction[key] ?? 0) + (rule.exemption[key] ?? 0)) * index;
  return bracketTax(Math.max(0, base - deduction), scale(brackets, index));
}

export function computeTax(t: TaxInput): TaxResult {
  const r = rulesFor(t.year).rules;
  const k = t.index;
  const ordinaryBrackets = scale(r.brackets[t.status], k);
  const gainBrackets = scale(r.capitalGains[t.status], k);

  const seDeduction = t.selfEmployment * r.selfEmployment.rateShare * r.fica.socialSecurityRate;
  const ordinaryBeforeSs = t.wages + t.selfEmployment - seDeduction + t.otherOrdinary + t.interest - t.preTaxDeductions;
  const preferential = t.qualifiedDividends + Math.max(0, t.longTermGains);
  const ssTaxable = taxableSocialSecurity(t.socialSecurity, ordinaryBeforeSs + preferential, t.status);
  const agi = ordinaryBeforeSs + preferential + ssTaxable;

  // State tax first: it is deductible (under the SALT cap) when itemizing.
  const state = stateTax(t.state, agi, ssTaxable, t.status, k);
  const standard = standardDeduction(t.status, t.year, k, t.over65);
  let deduction = standard, itemized = false;
  if (t.itemize) {
    const salt = Math.min(state + (t.propertyTax ?? 0), saltCap(t.year, agi));
    const total = salt + (t.itemizedOther ?? 0);
    if (total > standard) { deduction = total; itemized = true; }
  }

  const taxableIncome = Math.max(0, agi - deduction);
  const ordinaryTaxable = Math.max(0, taxableIncome - preferential);
  const ordinaryTax = bracketTax(ordinaryTaxable, ordinaryBrackets);
  // Gains stack on top of ordinary income: each slice is taxed at the rate of the band it lands in.
  const gainsTaxable = taxableIncome - ordinaryTaxable;
  const capitalGains = bracketTax(ordinaryTaxable + gainsTaxable, gainBrackets) - bracketTax(ordinaryTaxable, gainBrackets);

  const investmentIncome = preferential + t.interest;
  const niit = Math.max(0, Math.min(investmentIncome, agi - r.niit.threshold[t.status])) * r.niit.rate;
  const ficaTax = fica(t.wages, t.selfEmployment, t.status, t.year, k);
  const penalty = t.earlyWithdrawals * r.earlyWithdrawalPenalty;

  const total = ordinaryTax + capitalGains + niit + ficaTax + state + penalty;
  const gross = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + preferential + t.socialSecurity;
  return {
    federal: ordinaryTax,
    capitalGains,
    niit,
    fica: ficaTax,
    state,
    penalty,
    total,
    taxableIncome,
    ordinaryTaxable,
    taxableSocialSecurity: ssTaxable,
    marginalRate: marginalRate(ordinaryTaxable, ordinaryBrackets),
    effectiveRate: gross > 0 ? total / gross : 0,
    agi,
    deduction,
    itemized,
  };
}

type MedicareYear = (typeof health.medicare)['2026'];

function latest<T>(table: Record<string, T>, year: number): T {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  let y = keys[0];
  for (const k of keys) if (k <= year) y = k;
  return table[String(y)];
}

/** Yearly Medicare Part B and D premiums for one person, with the surcharge tier set by MAGI two years back. The
 * premium grows with healthcare costs (healthIndex), the tier thresholds and surcharges with inflation (index). */
export function medicarePremium(year: number, magiTwoYearsBack: number, status: FilingStatus, partDBase: number, index: number, healthIndex: number): number {
  const m = latest(health.medicare as unknown as Record<string, MedicareYear>, year);
  const tiers = status === 'mfj' ? m.tiers.mfj : m.tiers.single;
  let tier = 0;
  for (let i = 0; i < tiers.length; i++) if (magiTwoYearsBack > tiers[i] * index) tier = i + 1;
  return (m.partB * healthIndex + m.partBSurcharge[tier] * index + partDBase * healthIndex + m.partDSurcharge[tier] * index) * 12;
}

type AcaYear = (typeof health.aca)['2026'];

/** The ACA premium after the premium tax credit, for the household's members on marketplace coverage. */
export function acaNetPremium(year: number, magi: number, householdSize: number, covered: number, benchmarkEach: number, index: number): number {
  if (covered <= 0) return 0;
  const a = latest(health.aca as unknown as Record<string, AcaYear>, year);
  const poverty = (a.povertyLine.first + a.povertyLine.each * (householdSize - 1)) * index;
  const ratio = magi / poverty;
  const benchmark = benchmarkEach * covered;
  if (ratio > 4) return benchmark; // no credit above 400% of the poverty line
  let pct = a.applicable[0][2];
  for (const [lo, hi, p0, p1] of a.applicable) if (ratio >= lo && ratio < hi) pct = p0 + ((p1 - p0) * (ratio - lo)) / (hi - lo);
  return Math.min(benchmark, Math.max(0, magi) * pct);
}

/** The first IRMAA tier's MAGI threshold of the newest Medicare table (2027's when the plan reaches it). */
export function rulesTiers(status: FilingStatus): number {
  const m = latest(health.medicare as unknown as Record<string, MedicareYear>, 9999);
  return (status === 'mfj' ? m.tiers.mfj : m.tiers.single)[0];
}

/** 400% of the poverty line for a household, where the ACA credit ends (newest table). */
export function acaLimit(householdSize: number): number {
  const a = latest(health.aca as unknown as Record<string, AcaYear>, 9999);
  return 4 * (a.povertyLine.first + a.povertyLine.each * (householdSize - 1));
}

/** Federal estate tax on an estate if the last person died this year: 40% above the exemption, two exemptions for a
 * married couple (portability). */
export function estateTax(estate: number, year: number, index: number, people: number): number {
  const e = (rulesFor(year).rules as unknown as { estate: { exemption: number; rate: number } }).estate;
  const exempt = e.exemption * index * Math.max(1, people);
  return Math.max(0, estate - exempt) * e.rate;
}

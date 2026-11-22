// US federal and state income tax for one household-year. Brackets and thresholds are the base year's, indexed by the
// inflation factor since then (the IRS indexes them by chained CPI; the plan's inflation stands in for it).
import federal from '../data/federal.json';
import states from '../data/states.json';
import type { FilingStatus } from './types';

type Bracket = [number, number];

export interface TaxInput {
  status: FilingStatus;
  /** Cumulative inflation since the rules' base year (1.0 in the base year). */
  index: number;
  wages: number;
  selfEmployment: number;
  /** Ordinary income besides wages: pension, traditional withdrawals, Roth conversions, interest, rental. */
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
}

const scale = (brackets: Bracket[], k: number): Bracket[] => brackets.map(([t, r]) => [t * k, r]);

/** Tax on income through progressive brackets. */
export function bracketTax(income: number, brackets: Bracket[]): number {
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [lo, rate] = brackets[i];
    const hi = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    if (income <= lo) break;
    tax += (Math.min(income, hi) - lo) * rate;
  }
  return tax;
}

export function marginalRate(income: number, brackets: Bracket[]): number {
  let rate = brackets[0][1];
  for (const [lo, r] of brackets) if (income > lo) rate = r;
  return rate;
}

/** The ordinary taxable income at which a bracket of this rate ends (Roth conversions fill up to it). */
export function bracketTop(rate: number, status: FilingStatus, index: number): number {
  const b = scale(federal.brackets[status] as Bracket[], index);
  for (let i = 0; i < b.length; i++) if (Math.abs(b[i][1] - rate) < 1e-9) return i + 1 < b.length ? b[i + 1][0] : Infinity;
  return 0;
}

export function standardDeduction(status: FilingStatus, index: number, over65: number): number {
  const extra = status === 'mfj' ? federal.additionalDeduction65.married : federal.additionalDeduction65.unmarried;
  return (federal.standardDeduction[status] + extra * over65) * index;
}

/** The taxable part of Social Security benefits (IRS Pub. 915's worksheet; the thresholds are not indexed). */
export function taxableSocialSecurity(benefits: number, otherIncome: number, status: FilingStatus): number {
  if (benefits <= 0) return 0;
  const [base1, base2] = federal.socialSecurityTaxation[status];
  const provisional = otherIncome + benefits / 2;
  if (provisional <= base1) return 0;
  if (provisional <= base2) return Math.min(0.5 * benefits, 0.5 * (provisional - base1));
  return Math.min(0.85 * benefits, 0.85 * (provisional - base2) + Math.min(0.5 * benefits, 0.5 * (base2 - base1)));
}

export function fica(wages: number, selfEmployment: number, status: FilingStatus, index: number): number {
  const f = federal.fica;
  const base = f.wageBase * index;
  const ss = Math.min(wages, base) * f.socialSecurityRate;
  const se = selfEmployment * federal.selfEmployment.rateShare;
  const seSs = Math.max(0, Math.min(se, base - wages)) * f.socialSecurityRate * 2;
  const medicare = wages * f.medicareRate + se * f.medicareRate * 2;
  const addl = Math.max(0, wages + se - f.additionalMedicareThreshold[status]) * f.additionalMedicareRate;
  return ss + seSs + medicare + addl;
}

interface StateRule {
  /** Brackets on taxable income per filing status; a flat-tax state has one bracket, a no-tax state none. */
  brackets: Record<string, Bracket[]>;
  standardDeduction: Record<string, number>;
  exemption: Record<string, number>;
  /** Whether the state taxes Social Security benefits. */
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
  const k = t.index;
  const ordinaryBrackets = scale(federal.brackets[t.status] as Bracket[], k);
  const gainBrackets = scale(federal.capitalGains[t.status] as Bracket[], k);

  const seDeduction = t.selfEmployment * federal.selfEmployment.rateShare * federal.fica.socialSecurityRate;
  const ordinaryBeforeSs = t.wages + t.selfEmployment - seDeduction + t.otherOrdinary + t.interest - t.preTaxDeductions;
  const preferential = t.qualifiedDividends + Math.max(0, t.longTermGains);
  const ssTaxable = taxableSocialSecurity(t.socialSecurity, ordinaryBeforeSs + preferential, t.status);
  const agi = ordinaryBeforeSs + preferential + ssTaxable;
  const deduction = standardDeduction(t.status, k, t.over65);

  const taxableIncome = Math.max(0, agi - deduction);
  const ordinaryTaxable = Math.max(0, taxableIncome - preferential);
  const ordinaryTax = bracketTax(ordinaryTaxable, ordinaryBrackets);
  // Gains stack on top of ordinary income: each slice is taxed at the rate of the band it lands in.
  const gainsTaxable = taxableIncome - ordinaryTaxable;
  const capitalGains = bracketTax(ordinaryTaxable + gainsTaxable, gainBrackets) - bracketTax(ordinaryTaxable, gainBrackets);

  const investmentIncome = preferential + t.interest;
  const niit = Math.max(0, Math.min(investmentIncome, agi - federal.niit.threshold[t.status])) * federal.niit.rate;
  const ficaTax = fica(t.wages, t.selfEmployment, t.status, k);
  const state = stateTax(t.state, agi, ssTaxable, t.status, k);
  const penalty = t.earlyWithdrawals * federal.earlyWithdrawalPenalty;

  const fed = ordinaryTax;
  const total = fed + capitalGains + niit + ficaTax + state + penalty;
  const gross = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + preferential + t.socialSecurity;
  return {
    federal: fed,
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
  };
}

export const rules = federal;

// US federal and state income tax for one household-year, plus the health premiums tied to income (Medicare with
// IRMAA, the ACA premium tax credit). Each year uses the newest published rules at or before it (2026, 2027), with
// dollar amounts indexed by the plan's inflation after that rules year.
import { ukTax } from './uk';
import { auTax } from './au';
import { caTax } from './ca';
import { deTax } from './de';
import { nlTax } from './nl';
import { esTax } from './es';
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
  /** The country whose taxes apply: the United States where unset, or the UK (engine/uk.ts). */
  country?: 'US' | 'UK' | 'AU' | 'CA' | 'DE' | 'NL' | 'ES';
  /** Extra flat rates on ordinary income and on capital gains and qualified dividends (other taxes the model leaves out). */
  extraIncomeRate?: number;
  extraGainsRate?: number;
  /** The Netherlands' box 3: bank balances and other taxable investments at the start of the year. */
  wealthCash?: number;
  wealthOther?: number;
  /** Spain's wealth tax: the main home's value (its first €300,000 exempt). */
  wealthHome?: number;
  /** Germany: the church tax rate (0.08 or 0.09; none where unset), and care insurance's surcharge for the childless. */
  deChurch?: number;
  deChildless?: boolean;
  /** UK: a Scottish taxpayer; a quarter of pension withdrawals taken tax-free. Australia: people aged 60 or over. */
  scotland?: boolean;
  ukLumpSum?: boolean;
  over60?: number;
  /** Canada: the province or territory (two letters; Ontario where unset). */
  province?: string;
  /** The spread of incentive stock options exercised and held this year: an AMT preference item (section 56(b)(3)). */
  isoSpread?: number;
  /** A US person's income from abroad: the exclusion and the foreign tax credit. */
  foreign?: ForeignInput;
  /** Child and dependent care costs paid for children under 13, so the adults can work (the credit of section 21). */
  dependentCare?: number;
  childrenUnder13?: number;
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
  /** Wages excluded from payroll tax too (section 125 deductions: health premiums, an FSA). */
  ficaExcluded?: number;
  earlyWithdrawals: number;
  /** People aged 65 or more. */
  over65: number;
  state: string;
  /** Itemized deductions other than state and local taxes: mortgage interest and charity. */
  itemizedOther?: number;
  /** Property tax, which joins state income tax under the SALT cap. */
  propertyTax?: number;
  itemize?: boolean;
  /** Children under 17 (child tax credit), other dependents (the $500 credit), and students in their first four
   * years of college (American Opportunity credit). */
  children?: number;
  otherDependents?: number;
  collegeStudents?: number;
  /** Each person's contributions which count for the saver's credit (deferrals and IRA). */
  saverContributions?: number[];
  /** Local income tax: New York City's brackets, or a flat rate on wages or on taxable income. */
  local?: { kind: 'none' | 'nyc' | 'wages' | 'income'; rate?: number };
  /** HSA money spent on other than medical care: ordinary income (in otherOrdinary), and 20% more before 65. */
  hsaPenaltyBase?: number;
  /** Self-employment income from a specified service business (the QBI deduction phases out the same way here). */
  serviceBusiness?: boolean;
  /** A flat tax on all income in place of every income and payroll tax. */
  flatRate?: number;
}

/** A US person's income from abroad in one year (TaxInput.foreign). */
export interface ForeignInput {
  /** Pay for work done while living abroad (within wages and selfEmployment), in all and by person. */
  earned: number;
  earnedBy: number[];
  /** The foreign earned income exclusion (section 911) is claimed, with this year's qualifying housing costs. */
  exclusion: boolean;
  housing: number;
  /** Wages abroad owing no US Social Security or Medicare tax (a foreign employer). */
  noUsPayroll: number;
  /** Foreign income tax paid on the earned income above. */
  taxEarned: number;
  /** Other foreign income taxed as ordinary US income (a foreign pension), and the foreign tax paid on it: the general basket. */
  generalOther: number;
  taxGeneralOther: number;
  /** Foreign investment and rental income, and the foreign tax paid on it: the passive basket. */
  passiveIncome: number;
  taxPassive: number;
  /** Foreign tax paid on income the US does not tax: a cost with no credit. */
  taxOther: number;
  /** Unused foreign tax credits carried from the ten years before, by basket. */
  carryGeneral: number;
  carryPassive: number;
}

// The foreign earned income exclusion a person (IRS Rev. Proc. 2024-40 for 2025, Rev. Proc. 2025-32 for 2026), indexed
// after; the housing exclusion is the housing cost up to 30% of the limit, less a base of 16% of it (section 911(c);
// high-cost cities have higher caps, which are not modeled).
const FOREIGN = { exclusion: { 2025: 130000, 2026: 132900 } as Record<number, number>, housingBase: 0.16, housingCap: 0.3 };
export function foreignExclusionLimit(year: number, index: number): number {
  return (FOREIGN.exclusion[year] ?? FOREIGN.exclusion[2026]) * (year > 2026 ? index : 1);
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
  /** Credits applied (nonrefundable up to the income tax, plus refundable parts). */
  credits: number;
  amt: number;
  local: number;
  seniorDeduction: number;
  /** Income left out by the foreign earned income exclusion (housing included), the foreign tax credit taken, and the
   * foreign tax paid (inside total). */
  foreignExclusion: number;
  foreignTaxCredit: number;
  foreignTaxPaid: number;
  /** The credit's bookkeeping by basket: credit used, and this year's creditable foreign tax. */
  ftc?: { usedGeneral: number; usedPassive: number; newGeneral: number; newPassive: number };
  /** The qualified business income deduction. */
  qbi: number;
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

/** Taxes with the plan's extra flat rates on ordinary income and on capital gains added (ProjectionLab's tax settings). */
export function computeTax(t: TaxInput): TaxResult {
  const r = computeTaxBase(t);
  if (!t.extraIncomeRate && !t.extraGainsRate) return r;
  const ordinary = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + t.socialSecurity - t.preTaxDeductions;
  const extra = Math.max(0, ordinary) * (t.extraIncomeRate ?? 0) + Math.max(0, t.qualifiedDividends + t.longTermGains) * (t.extraGainsRate ?? 0);
  return { ...r, local: r.local + extra, total: r.total + extra, marginalRate: r.marginalRate + (t.extraIncomeRate ?? 0) };
}

function computeTaxBase(t: TaxInput): TaxResult {
  if (t.country === 'UK') return ukTax(t);
  if (t.country === 'AU') return auTax(t);
  if (t.country === 'CA') return caTax(t);
  if (t.country === 'DE') return deTax(t);
  if (t.country === 'NL') return nlTax(t);
  if (t.country === 'ES') return esTax(t);
  if (t.flatRate !== undefined) return flatTax(t, t.flatRate);
  const r = rulesFor(t.year).rules;
  const k = t.index;
  const ordinaryBrackets = scale(r.brackets[t.status], k);
  const gainBrackets = scale(r.capitalGains[t.status], k);

  const seDeduction = t.selfEmployment * r.selfEmployment.rateShare * r.fica.socialSecurityRate;
  // The foreign earned income exclusion: each person's pay abroad up to the limit, plus the housing exclusion, at most
  // the pay abroad. The excluded income is left out of AGI but still sets the rates of the income which remains (the
  // stacking rule of section 911(f)).
  const fo = t.foreign;
  let excluded = 0;
  if (fo?.exclusion && fo.earned > 0) {
    const lim = foreignExclusionLimit(t.year, k);
    const housing = Math.max(0, Math.min(fo.housing, FOREIGN.housingCap * lim) - FOREIGN.housingBase * lim);
    excluded = Math.min(fo.earned, fo.earnedBy.reduce((sum, e) => sum + Math.min(e, lim), 0) + housing);
  }
  const ordinaryBeforeSs = t.wages + t.selfEmployment - seDeduction + t.otherOrdinary + t.interest - t.preTaxDeductions - excluded;
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

  // The deduction of $6,000 a person 65 or over (2025-2028), phased out at 6% of income above the threshold; it is
  // taken with either the standard or the itemized deduction.
  const sd = r.credits.seniorDeduction;
  const senior = t.year >= sd.years[0] && t.year <= sd.years[1]
    ? Math.max(0, sd.amount * t.over65 - sd.rate * Math.max(0, agi - sd.phaseStart[t.status])) : 0;
  // The qualified business income deduction (section 199A): 20% of self-employment income less the deductible half of
  // its tax, at most 20% of taxable income less net capital gains. A sole owner has no W-2 wages or property to count,
  // so above the threshold the deduction phases out over the phase-in range (a service business's too). From 2026 an
  // owner with at least the minimum income gets at least the minimum deduction.
  const q = r.qbi;
  const beforeQbi = Math.max(0, agi - deduction - senior);
  let qbiDed = 0;
  const qbiIncome = Math.max(0, t.selfEmployment - seDeduction);
  if (q && qbiIncome > 0) {
    const over = Math.max(0, beforeQbi - q.threshold[t.status] * k);
    const keep = Math.max(0, 1 - over / (q.phaseIn[t.status] * k));
    qbiDed = q.rate * qbiIncome * keep;
    if (qbiIncome >= q.minimumIncome * k) qbiDed = Math.max(qbiDed, q.minimumDeduction * k);
    qbiDed = Math.min(qbiDed, q.rate * Math.max(0, beforeQbi - preferential));
  }
  const taxableIncome = Math.max(0, beforeQbi - qbiDed);
  const ordinaryTaxable = Math.max(0, taxableIncome - preferential);
  const ordinaryTax = bracketTax(ordinaryTaxable + excluded, ordinaryBrackets) - bracketTax(excluded, ordinaryBrackets);
  // Gains stack on top of ordinary income: each slice is taxed at the rate of the band it lands in.
  const gainsTaxable = taxableIncome - ordinaryTaxable;
  const capitalGains = bracketTax(ordinaryTaxable + excluded + gainsTaxable, gainBrackets) - bracketTax(ordinaryTaxable + excluded, gainBrackets);

  const investmentIncome = preferential + t.interest;
  const niit = Math.max(0, Math.min(investmentIncome, agi - r.niit.threshold[t.status])) * r.niit.rate;
  const ficaTax = fica(Math.max(0, t.wages - (fo?.noUsPayroll ?? 0) - (t.ficaExcluded ?? 0)), t.selfEmployment, t.status, t.year, k);
  const penalty = t.earlyWithdrawals * r.earlyWithdrawalPenalty + (t.hsaPenaltyBase ?? 0) * 0.2;

  // Alternative minimum tax: income with the standard deduction (or state and local taxes) added back, less the
  // exemption (phased out at 50% above its threshold), at 26% and 28% on ordinary income and the capital gains rates
  // on gains; owed where the tentative tax exceeds the regular tax.
  const am = r.amt;
  const amti = agi + (t.isoSpread ?? 0) - qbiDed - (itemized ? deduction - Math.min(state + (t.propertyTax ?? 0), saltCap(t.year, agi)) : 0);
  const exemption = Math.max(0, am.exemption[t.status] * k - am.phaseRate * Math.max(0, amti - am.phaseStart[t.status] * k));
  const amtBase = Math.max(0, amti - exemption);
  const amtPref = Math.min(preferential, amtBase);
  const amtOrd = amtBase - amtPref;
  const brk = am.rate28Above * k;
  const tentative = Math.min(amtOrd, brk) * 0.26 + Math.max(0, amtOrd - brk) * 0.28
    + bracketTax(amtOrd + amtPref, gainBrackets) - bracketTax(amtOrd, gainBrackets);
  const amt = Math.max(0, tentative - (ordinaryTax + capitalGains));

  // Credits. Nonrefundable ones reduce income tax to zero at most; the refundable parts can go beyond it.
  const c = r.credits;
  const kids = t.children ?? 0, others = t.otherDependents ?? 0, students = t.collegeStudents ?? 0;
  const ctcPhase = Math.ceil(Math.max(0, agi - c.childTaxCredit_phaseOut[t.status]) / 1000) * c.childTaxCredit_phaseOut.per1000;
  const ctcTotal = Math.max(0, kids * c.ctc * k + others * c.otherDependentCredit - ctcPhase);
  const [aLo, aHi] = c.aotc.phaseOut[t.status];
  const aotcEach = c.aotc.max * Math.max(0, Math.min(1, (aHi - agi) / (aHi - aLo)));
  const aotc = students * aotcEach;
  const tiers = (c.saversTiers as Record<string, number[]>)[t.status] ?? c.saversTiers.single;
  const saverRate = agi <= tiers[0] * k ? c.saversCreditRates[0] : agi <= tiers[1] * k ? c.saversCreditRates[1] : agi <= tiers[2] * k ? c.saversCreditRates[2] : 0;
  const saver = saverRate * (t.saverContributions ?? []).reduce((sum, x) => sum + Math.min(x, c.saversCreditPerPerson), 0);
  // The foreign tax credit (section 901), by basket: this year's foreign tax (the share on excluded pay is not
  // creditable) plus the carryover, up to the US tax on that basket's foreign income (its share of AGI). It reduces the
  // regular income tax only; the unused part carries forward ten years (kept by the simulation).
  let ftcCredit = 0, ftc: TaxResult['ftc'];
  if (fo) {
    const regular = ordinaryTax + capitalGains;
    const kept = fo.earned > 0 ? Math.max(0, fo.earned - excluded) / fo.earned : 0;
    const newGeneral = fo.taxEarned * kept + fo.taxGeneralOther, newPassive = fo.taxPassive;
    const share = (x: number) => (agi > 0 ? Math.min(1, Math.max(0, x) / agi) : 0);
    let usedGeneral = Math.min(newGeneral + fo.carryGeneral, regular * share(fo.earned - excluded + fo.generalOther));
    let usedPassive = Math.min(newPassive + fo.carryPassive, regular * share(fo.passiveIncome));
    const over = usedGeneral + usedPassive > regular ? regular / (usedGeneral + usedPassive) : 1;
    usedGeneral *= over; usedPassive *= over;
    ftcCredit = usedGeneral + usedPassive;
    ftc = { usedGeneral, usedPassive, newGeneral, newPassive };
  }
  const foreignPaid = fo ? fo.taxEarned + fo.taxGeneralOther + fo.taxPassive + fo.taxOther : 0;
  const incomeTax = ordinaryTax + capitalGains + amt - ftcCredit;
  // The child and dependent care credit: 20% of care costs up to $3,000 for one child and $6,000 for two or more, and
  // up to the lower earner's pay (taken here as all earned income); the higher rates of low incomes are not modeled.
  const careKids = t.childrenUnder13 ?? 0;
  const care = careKids > 0 ? 0.2 * Math.min(t.dependentCare ?? 0, careKids >= 2 ? 6000 : 3000, t.wages + t.selfEmployment) : 0;
  const nonrefundablePool = ctcTotal + aotc * (1 - c.aotc.refundableShare) + saver + care;
  const nonrefundable = Math.min(incomeTax, nonrefundablePool);
  // The refundable child credit: up to the refundable amount a child, 15% of earned income above $2,500.
  const earned = t.wages + t.selfEmployment;
  const ctcLeft = Math.max(0, Math.min(ctcTotal, ctcTotal - Math.max(0, nonrefundable - aotc * (1 - c.aotc.refundableShare) - saver)));
  const actc = Math.min(ctcLeft, kids * c.ctcRefundable * k, 0.15 * Math.max(0, earned - 2500));
  // The earned income credit, by the number of qualifying children (up to three).
  const e = c.eitc, n = Math.min(3, kids + students);
  const statusKey = t.status === 'mfj' ? 'mfj' : 'single';
  let eitc = 0;
  if (preferential + t.interest <= e.investmentLimit * k && earned > 0) {
    const phaseIn = Math.min(1, earned / (e.earnedAmount[n] * k)) * e.max[n] * k;
    const x = Math.max(agi, earned), lo = e.phaseStart[statusKey][n] * k, hi = e.phaseEnd[statusKey][n] * k;
    const phaseOut = x <= lo ? e.max[n] * k : Math.max(0, e.max[n] * k * (hi - x) / (hi - lo));
    eitc = Math.max(0, Math.min(phaseIn, phaseOut));
  }
  const credits = nonrefundable + actc + aotc * c.aotc.refundableShare + eitc;

  // Local income tax.
  let local = 0;
  const lt = t.local;
  if (lt?.kind === 'nyc') {
    const nyc = (health.local.nyc as Record<string, number[][]>)[t.status];
    local = bracketTax(taxableIncome, scale(nyc, k));
  } else if (lt?.kind === 'wages') local = (lt.rate ?? 0) * (t.wages + t.selfEmployment);
  else if (lt?.kind === 'income') local = (lt.rate ?? 0) * taxableIncome;

  // Washington's capital gains tax: long-term gains above the indexed exemption, 7%, plus 2.9% above $1 million.
  let waGains = 0;
  if (t.state === 'WA' && t.longTermGains > 0) {
    const w = health.waCapitalGains;
    const ex = w.exemption2025 * k * Math.pow(1.025, Math.max(0, rulesFor(t.year).year - 2025));
    const g = Math.max(0, t.longTermGains - ex);
    waGains = g * w.rate + Math.max(0, t.longTermGains - w.surchargeAbove) * w.surcharge;
  }

  const total = ordinaryTax + capitalGains + amt + niit + ficaTax + state + waGains + local + penalty - credits - ftcCredit + foreignPaid;
  const gross = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + preferential + t.socialSecurity;
  return {
    federal: ordinaryTax,
    capitalGains,
    niit,
    fica: ficaTax,
    state: state + waGains,
    penalty,
    total,
    taxableIncome,
    ordinaryTaxable,
    taxableSocialSecurity: ssTaxable,
    marginalRate: marginalRate(ordinaryTaxable + excluded, ordinaryBrackets),
    effectiveRate: gross > 0 ? total / gross : 0,
    agi,
    deduction,
    itemized,
    credits,
    amt,
    local,
    seniorDeduction: senior,
    foreignExclusion: excluded,
    foreignTaxCredit: ftcCredit,
    foreignTaxPaid: foreignPaid,
    ftc,
    qbi: qbiDed,
  };
}

/** One rate on every dollar of income (wages, business, withdrawals, gains, dividends, interest, and 85% of Social
 * Security, less pre-tax contributions), in place of the US rules; early-withdrawal penalties still apply. */
function flatTax(t: TaxInput, rate: number): TaxResult {
  const r = rulesFor(t.year).rules;
  const base = Math.max(0, t.wages + t.selfEmployment + t.otherOrdinary + t.interest + t.qualifiedDividends
    + Math.max(0, t.longTermGains) + 0.85 * t.socialSecurity - t.preTaxDeductions);
  const penalty = t.earlyWithdrawals * r.earlyWithdrawalPenalty + (t.hsaPenaltyBase ?? 0) * 0.2;
  const income = base * rate;
  const gross = t.wages + t.selfEmployment + t.otherOrdinary + t.interest + t.qualifiedDividends + Math.max(0, t.longTermGains) + t.socialSecurity;
  return { federal: income, capitalGains: 0, niit: 0, fica: 0, state: 0, penalty, total: income + penalty, taxableIncome: base,
    ordinaryTaxable: base, taxableSocialSecurity: 0.85 * t.socialSecurity, marginalRate: rate, effectiveRate: gross > 0 ? (income + penalty) / gross : 0,
    agi: base, deduction: 0, itemized: false, credits: 0, amt: 0, local: 0, foreignExclusion: 0, foreignTaxCredit: 0, foreignTaxPaid: 0, seniorDeduction: 0, qbi: 0 };
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
export function acaLimit(householdSize: number, multiple = 4): number {
  const a = latest(health.aca as unknown as Record<string, AcaYear>, 9999);
  return multiple * (a.povertyLine.first + a.povertyLine.each * (householdSize - 1));
}

/** Federal estate tax on an estate if the last person died this year: 40% above the exemption, two exemptions for a
 * married couple (portability). */
export function estateTax(estate: number, year: number, index: number, people: number): number {
  const e = (rulesFor(year).rules as unknown as { estate: { exemption: number; rate: number } }).estate;
  const exempt = e.exemption * index * Math.max(1, people);
  return Math.max(0, estate - exempt) * e.rate;
}

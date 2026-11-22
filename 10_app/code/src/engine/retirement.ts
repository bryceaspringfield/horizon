// Social Security claiming adjustments and the RMD start age (SECURE 2.0).
import { rules } from './tax';

/** Monthly benefit when claimed at this age, from the benefit at full retirement age (PIA), in today's dollars. */
export function benefitAtClaim(pia: number, claimAge: number): number {
  const b = rules.socialSecurityBenefit;
  const months = Math.round((claimAge - b.fullRetirementAge) * 12);
  if (months >= 0) {
    const delayed = Math.min(months, (b.maxDelayAge - b.fullRetirementAge) * 12);
    return pia * (1 + (delayed / 12) * b.delayedCreditPerYear);
  }
  const early = -months;
  const first = Math.min(early, 36), rest = Math.max(0, early - 36);
  return pia * (1 - first * b.earlyReductionFirst36 - rest * b.earlyReductionAfter36);
}

/** A spousal benefit a month: half the partner's PIA, reduced for a claim before full retirement age (25/36 of 1% a
 * month for the first 36 months, 5/12 of 1% after); no delayed credits apply to it. */
export function spousalAtClaim(partnerPia: number, claimAge: number): number {
  const b = rules.socialSecurityBenefit;
  const early = Math.max(0, Math.round((b.fullRetirementAge - claimAge) * 12));
  const first = Math.min(early, 36), rest = Math.max(0, early - 36);
  return 0.5 * partnerPia * (1 - first * (25 / 36 / 100) - rest * (5 / 12 / 100));
}

/** The PIA from average indexed monthly earnings, by the year's bend points (90%, 32%, 15%). */
export function piaFromAime(aime: number, index = 1): number {
  const [b1, b2] = rules.socialSecurityBenefit.bendPoints.map((x) => x * index);
  return 0.9 * Math.min(aime, b1) + 0.32 * Math.max(0, Math.min(aime, b2) - b1) + 0.15 * Math.max(0, aime - b2);
}

export function rmdStartAge(birthYear: number): number {
  const a = rules.rmdStartAge;
  if (birthYear < 1951) return a.bornBefore1951;
  if (birthYear < 1960) return a.born1951to1959;
  return a.born1960orLater;
}

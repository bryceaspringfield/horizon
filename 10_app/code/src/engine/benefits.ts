// Employer benefit presets (Bryce, 2026-11-23): an employer's published benefits applied to a salary in one step:
// paychecks a year, the medical premium as a pre-tax paycheck deduction, the employer's HSA deposit, and the 401(k)
// match. MIT's 2026 figures (data/benefits/mit.json, from hr.mit.edu, retrieved 2026-11-23) come first.
import mit from '../data/benefits/mit.json';
import type { Income } from './types';

export type MitGroup = 'staff' | 'support';
export type MitPlan = 'ppo' | 'hdhp';
export type MitTier = 'employee' | 'spouse' | 'children' | 'family';
export const MIT = mit;

/** The salary with MIT's benefits for the group, medical plan, and coverage tier. */
export function applyMit(inc: Income, group: MitGroup, plan: MitPlan, tier: MitTier): Income {
  const m = mit.medical[plan] as { name: string; premium: Record<MitGroup, Record<MitTier, number>>; hsaEmployer?: Record<MitTier, number> };
  const paychecks = mit.groups[group].paychecks;
  const others = (inc.deductions ?? []).filter((d) => !d.name.startsWith('MIT medical'));
  return {
    ...inc,
    paychecks,
    deductions: [...others, { name: `MIT medical: ${m.name}`, amount: m.premium[group][tier], per: 'paycheck', treatment: 'all' }],
    employerHsa: plan === 'hdhp' ? m.hsaEmployer?.[tier] : undefined,
    employerMatch: mit.retirement401k.matchRate,
    matchLimit: mit.retirement401k.matchLimit,
  };
}

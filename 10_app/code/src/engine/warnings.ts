// Things worth a look in a plan, found from the plan and its projection: shown on the dashboard, each with the page
// which fixes it. A warning is a fact about the numbers entered; none of them is advice.
import { foreignCurrencies, planCurrency } from './currency';
import { missingEssentials } from './essentials';
import type { Plan, Projection } from './types';

export interface PlanWarning { level: 'problem' | 'note'; text: string; page: string }

export function planWarnings(plan: Plan, proj: Projection): PlanWarning[] {
  const out: PlanWarning[] = [];
  const first = proj.years[0];
  const age = (year: number) => year - plan.people[0].birthYear;
  if (proj.depletionYear !== null) out.push({ level: 'problem', page: 'cashflow', text: `Money runs short in ${proj.depletionYear} (age ${age(proj.depletionYear)}): from then, the plan's expenses are not fully met.` });
  if (plan.expenses.length === 0 || (first && first.totalExpenses === 0 && plan.expenses.every((e) => e.amount === 0))) out.push({ level: 'problem', page: 'expenses', text: 'No spending is entered, so every result assumes none.' });
  // SSDI ends when work pays over the substantial gainful activity limit ($1,690 a month in 2026, not blind)
  for (const ss of plan.socialSecurity) {
    if (!ss.ssdi) continue;
    const pay = proj.years[0] ? plan.incomes.filter((i) => i.ownerId === ss.ownerId && (i.kind === 'salary' || i.kind === 'selfEmployment')).reduce((t, i) => t + (proj.years[0].income[i.id] ?? 0), 0) : 0;
    const who = plan.people.find((p) => p.id === ss.ownerId)?.name ?? 'Someone';
    if (pay / 12 > 1690) out.push({ level: 'problem', page: 'income', text: who + "'s pay is over the SSDI earnings limit ($1,690 a month in 2026), which ends disability benefits after the trial work period." });
  }
  const gaps = missingEssentials(plan);
  if (gaps.length && plan.expenses.length) out.push({ level: 'note', page: 'budget', text: `No expense covers ${gaps.length === 1 ? gaps[0].name.toLowerCase() : gaps.slice(0, -1).map((g) => g.name.toLowerCase()).join(', ') + ' or ' + gaps[gaps.length - 1].name.toLowerCase()}; the Budget page adds ${gaps.length === 1 ? 'it' : 'each'} at a starting estimate.` });
  const penalties = proj.years.filter((y) => y.taxes.penalty > 0.5);
  if (penalties.length) out.push({ level: 'note', page: 'strategy', text: `Early-withdrawal penalties arise in ${penalties.length} year${penalties.length > 1 ? 's' : ''}, first in ${penalties[0].year}: retirement accounts are drawn before 59½.` });
  for (const d of plan.accounts) {
    if (d.kind === 'debt' && d.balance > 0 && (d.payment ?? 0) + (d.extraPayment ?? 0) < d.balance * (d.interestRate ?? 0) && !d.forgiveYear) {
      out.push({ level: 'problem', page: 'accounts', text: `The payment on "${d.name}" is less than its yearly interest, so the debt grows.` });
    }
  }
  const reached = new Set(proj.years.flatMap((y) => y.milestonesReached));
  for (const m of plan.milestones) if (!reached.has(m.id)) out.push({ level: 'note', page: 'milestones', text: `The milestone "${m.name}" is not reached within the plan.` });
  for (const ss of plan.socialSecurity) {
    const p = plan.people.find((x) => x.id === ss.ownerId);
    if (p && ss.pia === 0 && plan.incomes.some((i) => i.ownerId === p.id && (i.kind === 'salary' || i.kind === 'selfEmployment'))) out.push({ level: 'note', page: 'income', text: `${p.name} has pay but a Social Security benefit of 0.` });
  }
  const home = planCurrency(plan);
  for (const c of foreignCurrencies(plan)) {
    const f = plan.assumptions.fx?.[c];
    if (!f || f.rate === 1) out.push({ level: 'note', page: 'assumptions', text: `Amounts in ${c} convert at a rate of 1 to ${home}; set the exchange rate.` });
  }
  for (const p of plan.people) {
    const retire = plan.strategy.retirementAge[p.id];
    if (retire !== undefined && p.lifeExpectancy <= retire) out.push({ level: 'note', page: 'people', text: `${p.name}'s plan ends at ${p.lifeExpectancy}, at or before the retirement age of ${retire}.` });
  }
  const ft = plan.assumptions.taxModel?.kind === 'flat';
  if (!ft && plan.accounts.some((a) => a.kind === 'asset' && a.saleYear && a.costBasis === undefined)) out.push({ level: 'note', page: 'accounts', text: 'An asset is sold with no cost basis entered, so its sale is taken as made at cost, with no tax on a gain.' });
  return out;
}

// Essentials a plan's expenses should cover (Bryce, 2026-11-23: "reminders to include essentials in expected expenses").
// Each is matched by the names and types of the plan's expenses; a missing one is offered with a starting estimate: a US
// household's yearly average from the BLS Consumer Expenditure Survey, 2023 (rounded), for the user to replace.
import type { Expense, ExpenseKind, Plan } from './types';

export interface Essential { key: string; name: string; kind: ExpenseKind; match: RegExp; kinds?: ExpenseKind[]; yearly: number; note: string }

export const ESSENTIALS: Essential[] = [
  { key: 'housing', name: 'Rent or mortgage', kind: 'housing', match: /rent|mortgage|housing|home|apartment|lease/i, kinds: ['housing'], yearly: 0, note: 'Enter your own; rent varies most by place.' },
  { key: 'groceries', name: 'Groceries', kind: 'living', match: /grocer|food|supermarket/i, yearly: 6100, note: 'Food at home, US household average.' },
  { key: 'utilities', name: 'Utilities (power, heat, water)', kind: 'housing', match: /utilit|electric|power|gas bill|heat|water/i, yearly: 3100, note: 'Energy and water, US household average.' },
  { key: 'phone', name: 'Cell phone', kind: 'living', match: /phone|cell|mobile|wireless/i, yearly: 1300, note: 'Phone service, US household average.' },
  { key: 'internet', name: 'Internet', kind: 'living', match: /internet|broadband|wifi|wi-fi/i, yearly: 900, note: 'Home internet, a typical plan.' },
  { key: 'health', name: 'Health insurance', kind: 'healthcare', match: /health|medical|insurance premium/i, kinds: ['healthcare'], yearly: 4800, note: 'Premiums paid by the household, US average.' },
  { key: 'vision', name: 'Glasses or contacts', kind: 'healthcare', match: /glasses|contact|vision|eye/i, yearly: 300, note: 'Lenses and an eye exam a year.' },
  { key: 'transport', name: 'Transportation (car or transit)', kind: 'living', match: /car|auto|gas|fuel|transit|train|bus|subway|uber|lyft|transport/i, yearly: 5000, note: 'Fuel, insurance, upkeep, or fares; enter your own if transit only.' },
  { key: 'clothing', name: 'Clothing', kind: 'living', match: /cloth|apparel|shoes/i, yearly: 2000, note: 'Apparel and services, US household average.' },
  { key: 'personal', name: 'Personal care', kind: 'living', match: /personal care|toiletr|haircut|hygiene/i, yearly: 950, note: 'US household average.' },
  { key: 'renters', name: "Renter's or home insurance", kind: 'insurance', match: /renter|homeowner|home insurance|property insurance/i, kinds: ['insurance'], yearly: 300, note: "A renter's policy; a homeowner's runs higher." },
];

const DAY_TO_DAY = new Set(['groceries', 'phone', 'internet', 'clothing', 'personal']);
const covers = (e: Expense, x: Essential) => x.match.test(e.name) || (x.kinds ?? []).includes(e.kind);

/** The essentials which no expense of the plan covers, matched by name and type; a catch-all living expense covers the
 * day-to-day ones (groceries, phone, clothing, personal care) and is noted as such. */
export function missingEssentials(plan: Plan): Essential[] {
  const catchAll = plan.expenses.some((e) => e.kind === 'living' && /living|general|everyday|day-to-day|household/i.test(e.name));
  return ESSENTIALS.filter((x) => !(catchAll && DAY_TO_DAY.has(x.key)) && !plan.expenses.some((e) => covers(e, x)));
}

/** A plan expense for an essential, at its starting estimate, from the plan's first year. */
export function essentialExpense(x: Essential, startYear: number, id: string): Expense {
  return { id, name: x.name, kind: x.kind, amount: x.yearly, growth: 0, startYear } as Expense;
}

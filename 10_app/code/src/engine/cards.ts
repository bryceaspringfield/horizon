// Card rewards (Bryce, 2026-11-23): cash back by spending category and overall, with yearly caps and bonus rates which end
// in a year and fall to a lower rate. Each category's spending goes to the card paying the most on it, past a cap to the
// next card; the same function prices a card the user does not hold (added value), for the card finder.
import type { Account, Expense } from './types';

export const SPEND_CATEGORIES = [
  ['groceries', 'Groceries'], ['dining', 'Dining'], ['gas', 'Gas and EV charging'], ['travel', 'Travel'],
  ['transit', 'Transit and rides'], ['online', 'Online shopping'], ['streaming', 'Streaming'], ['drugstore', 'Drugstores'],
  ['utilities', 'Utilities and phone'], ['entertainment', 'Entertainment'], ['other', 'Everything else'],
] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number][0];

/** One earning rate of a card: on a category or on all spending, up to a yearly cap, until a year, then a lower rate. */
export interface RewardRate { category: SpendCategory | 'all'; rate: number; capYearly?: number; untilYear?: number; thenRate?: number }

const GUESS: [RegExp, SpendCategory][] = [
  [/grocer|supermarket|food at home/i, 'groceries'], [/dining|restaurant|takeout|coffee|eat out/i, 'dining'],
  [/gas|fuel|charging/i, 'gas'], [/travel|flight|hotel|vacation|airbnb/i, 'travel'], [/transit|subway|train|bus|uber|lyft|ride/i, 'transit'],
  [/amazon|online|shopping/i, 'online'], [/stream|netflix|spotify|hulu|disney/i, 'streaming'], [/pharma|drug|prescription|cvs|walgreens/i, 'drugstore'],
  [/utilit|electric|phone|cell|internet|water/i, 'utilities'], [/movie|concert|entertain|game/i, 'entertainment'],
];

/** The category an expense's spending earns in: the one set on it, else a guess from its name and type. */
export function categoryOf(e: Expense): SpendCategory {
  if (e.spendCategory) return e.spendCategory;
  if (e.kind === 'travel') return 'travel';
  for (const [re, c] of GUESS) if (re.test(e.name)) return c;
  return 'other';
}

/** Spending which goes on a card: not housing paid by check, debt payments, taxes, or insurance billed by bank draft. */
export function cardable(e: Expense): boolean {
  return e.onCard ?? !(e.kind === 'housing' && /rent|mortgage/i.test(e.name));
}

const rateIn = (r: RewardRate, year: number) => (r.untilYear !== undefined && year > r.untilYear ? (r.thenRate ?? 0) : r.rate);

/** The year's cash back of each card, given spending by category: each dollar goes to the best rate still under its cap. */
export function cardRewards(year: number, spend: Partial<Record<SpendCategory, number>>, cards: Pick<Account, 'id' | 'rewards'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) out[c.id] = 0;
  for (const [cat, amount] of Object.entries(spend) as [SpendCategory, number][]) {
    let left = amount;
    // every rate which applies to this category, best first; a card's flat rate stands behind its category rates
    const offers = cards.flatMap((c) => (c.rewards ?? []).filter((r) => r.category === cat || r.category === 'all')
      .map((r) => ({ id: c.id, rate: rateIn(r, year), cap: r.capYearly ?? Infinity, key: c.id + r.category })))
      .sort((a, b) => b.rate - a.rate);
    const used: Record<string, number> = {};
    for (const o of offers) {
      if (left <= 0) break;
      const room = o.cap - (used[o.key] ?? 0);
      const take = Math.min(left, room);
      if (take <= 0) continue;
      out[o.id] += take * o.rate; used[o.key] = (used[o.key] ?? 0) + take; left -= take;
    }
  }
  return out;
}

/** The yearly added value of a new card: the cash back gained over the cards held, less its annual fee. */
export function addedValue(year: number, spend: Partial<Record<SpendCategory, number>>, held: Pick<Account, 'id' | 'rewards'>[], card: { id: string; rewards: RewardRate[]; annualFee?: number }): number {
  const before = Object.values(cardRewards(year, spend, held)).reduce((s, v) => s + v, 0);
  const after = Object.values(cardRewards(year, spend, [...held, card])).reduce((s, v) => s + v, 0);
  return after - before - (card.annualFee ?? 0);
}

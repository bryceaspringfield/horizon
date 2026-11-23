// The card finder (Bryce, 2026-11-23): ranks catalog cards by their added value over the cards held, on the plan's spending
// by category, and sets aside each card the user cannot get or does not want, with the reason.
import catalog from '../data/cards.json';
import { addedValue, cardRewards, type RewardRate, type SpendCategory } from './cards';
import type { Account } from './types';

export type CreditTier = 'building' | 'fair' | 'good' | 'excellent';
const TIER: Record<CreditTier, number> = { building: 0, fair: 1, good: 2, excellent: 3 };
export interface CatalogCard { id: string; name: string; issuer: string; annualFee: number; credit: CreditTier; rewards: RewardRate[]; perks: string[] }
export const CARDS = catalog.cards as CatalogCard[];
export const CATALOG_NOTE = catalog.note;
export const CATALOG_DATE = catalog.asOf;

export interface FinderFilters {
  /** The user's credit: a card needing better credit is set aside. */
  credit: CreditTier;
  maxFee?: number;
  /** At least this rate on all spending, or on one category. */
  minRate?: number;
  minRateOn?: SpendCategory | 'all';
  /** Perks wanted, matched by words (travel, insurance, hotel, concierge, phone). */
  perks?: string[];
  /** Personal cards opened in the last 24 months: Chase approves few applicants at 5 or more (the 5/24 rule). */
  newCards24?: number;
}

export interface FinderRow { card: CatalogCard; value: number; cashBack: number; out?: string }

const rateOn = (c: CatalogCard, cat: SpendCategory | 'all') =>
  Math.max(0, ...c.rewards.filter((r) => r.category === cat || r.category === 'all').map((r) => r.rate));

/** Every catalog card with its added value a year (cash back gained over the cards held, less the fee), its cash back
 * alone, and the reason it is set aside, if one is; cards in reach come first, best value first. */
export function findCards(year: number, spend: Partial<Record<SpendCategory, number>>, held: Pick<Account, 'id' | 'rewards'>[],
  f: FinderFilters, heldNames: string[] = []): FinderRow[] {
  const rows = CARDS.map((card): FinderRow => {
    const value = addedValue(year, spend, held, card);
    const cashBack = Object.values(cardRewards(year, spend, [{ id: card.id, rewards: card.rewards }])).reduce((s, v) => s + v, 0);
    let out: string | undefined;
    const where = f.minRateOn && f.minRateOn !== 'all' ? 'on ' + f.minRateOn : 'overall';
    if (heldNames.some((n) => n.toLowerCase() === card.name.toLowerCase())) out = 'You hold this card';
    else if (TIER[card.credit] > TIER[f.credit]) out = 'Needs ' + card.credit + ' credit';
    else if (f.maxFee !== undefined && card.annualFee > f.maxFee) out = 'Annual fee $' + card.annualFee;
    else if (f.minRate && rateOn(card, f.minRateOn ?? 'all') < f.minRate) out = 'Under ' + (f.minRate * 100).toFixed(1) + '% ' + where;
    else if (f.perks?.length && !f.perks.every((w) => card.perks.some((p) => p.toLowerCase().includes(w.toLowerCase())))) out = 'Lacks a perk wanted';
    else if (card.issuer === 'Chase' && (f.newCards24 ?? 0) >= 5) out = 'Chase 5/24: 5 or more new cards in 24 months';
    return { card, value, cashBack, out };
  });
  return rows.sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.value - a.value);
}

// Purchase goals (Bryce, 2026-11-23): a thing to buy by a date, the monthly saving it takes, and the offers found for it,
// ranked by what each costs after a coupon, a cash-back portal, and card cash back stack.
export interface Offer { store: string; price: number; coupon?: number; portal?: number; card?: number }
export interface PurchaseGoal { id: string; name: string; price: number; by: string; saved: number; offers?: Offer[] }

/** What an offer costs after the coupon (dollars off), then the portal's and the card's cash back on the price paid. */
export function effectivePrice(o: Offer): number {
  const paid = Math.max(0, o.price - (o.coupon ?? 0));
  return paid * (1 - (o.portal ?? 0) - (o.card ?? 0));
}

/** Months from a date (YYYY-MM-DD) to the goal's date, at least one. */
export function monthsUntil(by: string, from = new Date()): number {
  const d = new Date(by + 'T00:00:00');
  return Math.max(1, (d.getFullYear() - from.getFullYear()) * 12 + d.getMonth() - from.getMonth());
}

/** The monthly saving to reach the goal by its date, at the best offer's price when offers are listed. */
export function goalPlan(g: PurchaseGoal, from = new Date()) {
  const ranked = [...(g.offers ?? [])].sort((a, b) => effectivePrice(a) - effectivePrice(b));
  const target = ranked.length ? effectivePrice(ranked[0]) : g.price;
  const months = monthsUntil(g.by, from);
  return { ranked, target, months, monthly: Math.max(0, target - g.saved) / months };
}

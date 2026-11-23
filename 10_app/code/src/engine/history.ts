// Net worth history (ProjectionLab's tracked accounts, 2026-11-23): balances recorded on dates, net worth by date, the change
// over a range (1M to All), and the latest composition (investable assets, liquid assets, liquid net worth).
import type { Account, Plan } from './types';

export interface Snapshot { date: string; balances: Record<string, number> }
// Snapshots are the app's progress records (store.ts), shared with the Progress page; a debt counts as minus its size
// whichever sign it was recorded with.
export type Range = '1M' | '3M' | 'YTD' | '1Y' | '5Y' | '10Y' | 'All';
export const RANGES: Range[] = ['1M', '3M', 'YTD', '1Y', '5Y', '10Y', 'All'];

const INVESTABLE: Account['kind'][] = ['taxable', 'traditional', 'roth', 'hsa', 'college529'];

/** A snapshot of every account's balance today. */
export function snapshotNow(plan: Plan, date: string): Snapshot {
  return { date, balances: Object.fromEntries(plan.accounts.map((a) => [a.id, a.kind === 'debt' ? Math.abs(a.balance) : a.balance])) };
}

/** The first date a range covers, counted back from the latest date. */
export function rangeStart(range: Range, latest: string): string {
  if (range === 'All') return '0000-01-01';
  const d = new Date(latest + 'T00:00:00Z');
  if (range === 'YTD') return `${d.getUTCFullYear()}-01-01`;
  const months = { '1M': 1, '3M': 3, '1Y': 12, '5Y': 60, '10Y': 120 }[range];
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** A snapshot's totals, by the plan's accounts (an account no longer in the plan counts as an asset by its sign). */
export function totals(s: Snapshot, accounts: Account[]) {
  const kind = new Map(accounts.map((a) => [a.id, a.kind]));
  let netWorth = 0, investable = 0, liquid = 0, debts = 0;
  for (const [id, v] of Object.entries(s.balances)) {
    const k = kind.get(id);
    netWorth += k === 'debt' ? -Math.abs(v) : v;
    if (k === 'debt') debts -= Math.abs(v);
    if (k && INVESTABLE.includes(k)) investable += v;
    if (k === 'cash' || (k && INVESTABLE.includes(k))) liquid += v;
  }
  return { netWorth, investable, liquid, liquidNetWorth: liquid + debts };
}

/** The snapshots in a range, sorted by date, with each one's net worth, and the change from the first to the last. */
export function history(snaps: Snapshot[], accounts: Account[], range: Range) {
  const sorted = [...snaps].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return { points: [], change: 0, changeShare: 0 };
  const from = rangeStart(range, sorted[sorted.length - 1].date);
  const points = sorted.filter((s) => s.date >= from).map((s) => ({ date: s.date, ...totals(s, accounts) }));
  const first = points[0].netWorth, last = points[points.length - 1].netWorth;
  return { points, change: last - first, changeShare: first ? (last - first) / Math.abs(first) : 0 };
}

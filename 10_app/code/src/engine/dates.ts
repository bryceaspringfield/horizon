// Exact start and end points of incomes and expenses (Bryce, 2026-11-23: an end of January 20, 2028 is not "2028"; the user
// picks a date on a calendar, or ties the point to a life event, a milestone, an age, or retirement, and a tied point
// follows the event when the event changes). Points become fractional years; a year's amount is prorated by the share of
// the year the item runs.
import type { Plan } from './types';

export type DateRef =
  | { kind: 'date'; date: string }
  | { kind: 'event'; eventId: string; at?: 'start' | 'end' }
  | { kind: 'milestone'; milestoneId: string }
  | { kind: 'age'; personId: string; age: number }
  | { kind: 'retirement'; personId: string };

/** A calendar date (YYYY-MM-DD) as a fractional year: January 1 is the year itself, July 2 about half past it. */
export function yearOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const start = Date.UTC(y, 0, 1), next = Date.UTC(y + 1, 0, 1);
  return y + (Date.UTC(y, (m || 1) - 1, d || 1) - start) / (next - start);
}

/** A fractional year as a calendar date. */
export function dateOf(t: number): string {
  const y = Math.floor(t);
  const start = Date.UTC(y, 0, 1), next = Date.UTC(y + 1, 0, 1);
  return new Date(start + (t - y) * (next - start) + 43200000).toISOString().slice(0, 10);
}

/** Where a point falls, as a fractional year; undefined while it has not happened (a milestone not yet reached). */
export function resolve(ref: DateRef | undefined, plan: Plan, reachedAt: Record<string, number> = {}): number | undefined {
  if (!ref) return undefined;
  if (ref.kind === 'date') return ref.date ? yearOf(ref.date) : undefined;
  if (ref.kind === 'milestone') return reachedAt[ref.milestoneId];
  const person = (id: string) => plan.people.find((p) => p.id === id);
  if (ref.kind === 'age') { const p = person(ref.personId); return p ? p.birthYear + ref.age : undefined; }
  if (ref.kind === 'retirement') { const p = person(ref.personId); return p ? p.birthYear + (plan.strategy.retirementAge[p.id] ?? 65) : undefined; }
  const e = (plan.events ?? []).find((x) => x.id === ref.eventId);
  if (!e) return undefined;
  const start = e.date ? yearOf(e.date) : e.year;
  if (ref.at === 'end' && 'endYear' in e && typeof e.endYear === 'number') return e.endDate ? yearOf(e.endDate) : e.endYear + 1;
  return start;
}

/** The share of year y an item runs, from its start point to its end point (the end exclusive: an item ending on
 * January 20 runs through January 19). Unset points fall back to the item's start year and its default last year. */
export function shareOfYear(y: number, start: number | undefined, end: number | undefined): number {
  const a = Math.max(y, start ?? -Infinity), b = Math.min(y + 1, end ?? Infinity);
  return Math.max(0, Math.min(1, b - a));
}

/** A short label of a point, for lists: "Jan 20, 2028", "At: Buy a home", "When Coast FI is reached", "At 67". */
export function refLabel(ref: DateRef | undefined, plan: Plan): string {
  if (!ref) return '';
  if (ref.kind === 'date') return ref.date ? new Date(ref.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
  if (ref.kind === 'milestone') return 'When ' + (plan.milestones.find((m) => m.id === ref.milestoneId)?.name ?? 'a milestone') + ' is reached';
  if (ref.kind === 'age' || ref.kind === 'retirement') {
    const who = plan.people.find((p) => p.id === ref.personId)?.name ?? '';
    return ref.kind === 'age' ? who + ' at ' + ref.age : who + "'s retirement";
  }
  const e = (plan.events ?? []).find((x) => x.id === ref.eventId);
  return (ref.at === 'end' ? 'End of ' : 'At ') + (e?.name ?? 'a life event');
}

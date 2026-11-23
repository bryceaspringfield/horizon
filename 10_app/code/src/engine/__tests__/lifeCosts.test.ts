import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { adoptionCost, birthCost, weddingCost } from '../lifeCosts';
import { expandEvents, simulate } from '../simulate';

// Planned life events: weddings, births, adoptions (Bryce, 2026-11-23).
describe('life event costs', () => {
  it('estimates weddings by style, size, place, days, and locations', () => {
    expect(weddingCost({ style: 'midsize', guests: 0, days: 1, locations: 1, destination: 'home' })).toBe(27200);
    expect(weddingCost({ style: 'courthouse', guests: 0, days: 1, locations: 1, destination: 'home' })).toBe(300);
    const sa = weddingCost({ style: 'southAsian', guests: 300, days: 3, locations: 1, destination: 'home' });
    expect(sa).toBe(180000);
    expect(weddingCost({ style: 'midsize', guests: 0, days: 2, locations: 2, destination: 'domestic' })).toBeGreaterThan(27200 * 1.6);
  });
  it('prices births and adoptions from the published figures', () => {
    expect(birthCost('employer', false)).toBe(2563 + 475);
    expect(birthCost('medicaid', true)).toBe(0);
    expect(adoptionCost('foster')).toBeLessThan(adoptionCost('agency'));
  });
  it('adds a wedding as a one-time cost on its date', () => {
    const plan = examplePlan(2026);
    plan.events = [{ id: 'w', kind: 'wedding', name: 'Wedding', year: 2028, date: '2028-06-10', style: 'small', guests: 40, days: 1, locations: 1, destination: 'home' }];
    const ys = simulate(expandEvents(structuredClone(plan))).years;
    expect(ys.find((y) => y.year === 2028)!.expenses.ev_once_w).toBeGreaterThan(40 * 292);
  });
});

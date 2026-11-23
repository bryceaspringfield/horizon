import { describe, expect, it } from 'vitest';
import { effectivePrice, goalPlan } from '../goals';

describe('purchase goals', () => {
  it('stacks a coupon, portal, and card cash back, and spreads the rest over the months left', () => {
    expect(effectivePrice({ store: 'A', price: 1000, coupon: 100, portal: 0.05, card: 0.02 })).toBeCloseTo(900 * 0.93, 6);
    const g = goalPlan({ id: 'g', name: 'Laptop', price: 1200, by: '2027-06-01', saved: 300, offers: [{ store: 'A', price: 1100 }, { store: 'B', price: 1000, coupon: 50 }] }, new Date('2026-12-01T00:00:00'));
    expect(g.target).toBe(950);
    expect(g.months).toBe(6);
    expect(g.monthly).toBeCloseTo(650 / 6, 6);
  });
});

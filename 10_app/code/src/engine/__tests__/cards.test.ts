import { describe, expect, it } from 'vitest';
import { addedValue, cardRewards } from '../cards';

// Card rewards by category, caps, and bonus rates which end (Bryce, 2026-11-23).
describe('card rewards', () => {
  const flat = { id: 'flat', rewards: [{ category: 'all' as const, rate: 0.02 }] };
  const groc = { id: 'groc', rewards: [{ category: 'groceries' as const, rate: 0.06, capYearly: 6000 }, { category: 'all' as const, rate: 0.01 }] };
  it('sends each category to the best rate and the rest past a cap to the next card', () => {
    const r = cardRewards(2026, { groceries: 8000, dining: 1000 }, [flat, groc]);
    expect(r.groc).toBeCloseTo(6000 * 0.06, 6);
    expect(r.flat).toBeCloseTo(2000 * 0.02 + 1000 * 0.02, 6);
  });
  it('drops a bonus rate after its last year', () => {
    const intro = { id: 'i', rewards: [{ category: 'all' as const, rate: 0.03, untilYear: 2026, thenRate: 0.015 }] };
    expect(cardRewards(2026, { other: 1000 }, [intro]).i).toBeCloseTo(30, 6);
    expect(cardRewards(2027, { other: 1000 }, [intro]).i).toBeCloseTo(15, 6);
  });
  it('prices a new card by what it adds over the cards held, less its fee', () => {
    const v = addedValue(2026, { groceries: 6000 }, [flat], { ...groc, annualFee: 95 });
    expect(v).toBeCloseTo(6000 * (0.06 - 0.02) - 95, 6);
  });
});

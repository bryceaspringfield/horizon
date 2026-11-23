import { describe, expect, it } from 'vitest';
import { foodMonthly, groceriesYearly } from '../food';

// Groceries from each person's food plan (2026-11-23).
describe('groceries', () => {
  it('prices one adult with the one-person adjustment', () => {
    expect(groceriesYearly([{ age: 30, sex: 'male', plan: 'moderate' }])).toBe(Math.round(398.9 * 1.2 * 12));
  });
  it('counts no food for a person whose food others pay, and costs a child less than an adult', () => {
    expect(groceriesYearly([{ age: 24, sex: 'female', paidByOthers: true }])).toBe(0);
    expect(foodMonthly(2, 'unknown', 'moderate')).toBeLessThan(foodMonthly(30, 'female', 'moderate'));
  });
});

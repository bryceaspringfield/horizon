import { describe, expect, it } from 'vitest';
import { ukPerson } from '../uk';

describe('UK tax, 2026 to 2027', () => {
  it('taxes a £50,000 salary as HMRC does', () => {
    // income tax: (50,000 - 12,570) x 20% = 7,486; NI: (50,000 - 12,570) x 8% = 2,994.40
    const r = ukPerson({ earned: 50000, pension: 0, savings: 0, dividends: 0, gains: 0, employment: 50000 });
    expect(r.income).toBeCloseTo(7486, 2);
    expect(r.ni).toBeCloseTo(2994.4, 2);
  });
  it('tapers the personal allowance away by £125,140', () => {
    // no allowance: 37,700 x 20% + (125,140 - 37,700) x 40% + (130,000 - 125,140) x 45%
    const r = ukPerson({ earned: 130000, pension: 0, savings: 0, dividends: 0, gains: 0, employment: 0 });
    expect(r.allowance).toBe(0);
    expect(r.income).toBeCloseTo(37700 * 0.2 + 87440 * 0.4 + 4860 * 0.45, 2);
  });
  it('taxes dividends above the allowance at the ordinary rate', () => {
    const r = ukPerson({ earned: 20000, pension: 0, savings: 0, dividends: 2500, gains: 0, employment: 0 });
    expect(r.income).toBeCloseTo((20000 - 12570) * 0.2 + 2000 * 0.1075, 2);
  });
});

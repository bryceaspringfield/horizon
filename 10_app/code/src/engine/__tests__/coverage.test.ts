import { describe, expect, it } from 'vitest';
import { outOfPocket } from '../coverage';

describe('health plan out-of-pocket costs', () => {
  const c = { deductible: 1700, coinsurance: 0.2, oopMax: 5000 };
  it('pays the deductible, then coinsurance, up to the maximum', () => {
    expect(outOfPocket(1000, c)).toBe(1000);
    expect(outOfPocket(11700, c)).toBeCloseTo(3700);
    expect(outOfPocket(100000, c)).toBe(5000);
  });
});

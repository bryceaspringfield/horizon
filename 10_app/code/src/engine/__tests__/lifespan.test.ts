import { describe, expect, it } from 'vitest';
import { expectedAgeAtDeath } from '../lifespan';

// Expected age at death (2026-11-23): SSA 2022 table, CDC 2022 race factors, condition years lost.
describe('expected age at death', () => {
  it('matches the SSA table for a 65-year-old with no other details', () => {
    expect(expectedAgeAtDeath(65, 'male')).toBeCloseTo(65 + 18.12, 1);
    expect(expectedAgeAtDeath(65, 'female')).toBeCloseTo(65 + 20.66, 1);
  });
  it('is longer for Asian Americans and shorter for smokers', () => {
    const base = expectedAgeAtDeath(40, 'female');
    expect(expectedAgeAtDeath(40, 'female', 'asian')).toBeGreaterThan(base + 2);
    expect(expectedAgeAtDeath(40, 'female', 'all', ['smoker'])).toBeCloseTo(base - 10, 0);
  });
});

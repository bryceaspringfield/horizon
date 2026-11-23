import { describe, expect, it } from 'vitest';
import { deSoli, deTariff } from '../de';

describe('German income tax, 2026', () => {
  it('follows the § 32a tariff', () => {
    expect(deTariff(12348)).toBe(0);
    expect(deTariff(50000)).toBe(10548);
    expect(deTariff(100000)).toBe(Math.floor(0.42 * 100000 - 11135.63));
    expect(deTariff(300000)).toBe(Math.floor(0.45 * 300000 - 19470.38));
  });
  it('charges the solidarity surcharge only above the threshold, phased in', () => {
    expect(deSoli(20000, false)).toBe(0);
    expect(deSoli(21000, false)).toBeCloseTo(0.119 * 650, 2);
    expect(deSoli(60000, false)).toBeCloseTo(0.055 * 60000, 2);
  });
});

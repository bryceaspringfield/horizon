import { describe, expect, it } from 'vitest';
import { bracketTax } from '../tax';
import { ES_GENERAL, esIncomeTax, esWealthTax } from '../es';

describe('Spanish taxes, 2026', () => {
  it('follows the BOE state scale, doubled', () => {
    // article 63: the state tax at 60,000 is 8,950.75
    expect(bracketTax(60000, ES_GENERAL)).toBeCloseTo(2 * 8950.75, 2);
  });
  it('subtracts the scale on the personal minimum', () => {
    expect(esIncomeTax(30000, 0)).toBeCloseTo(bracketTax(30000, ES_GENERAL) - 0.19 * 5550, 2);
  });
  it('exempts €700,000 and the first €300,000 of the home from wealth tax', () => {
    expect(esWealthTax(900000, 300000)).toBe(0);
    // article 30: 334.26 on the first 167,129.45, then 0.3%
    expect(esWealthTax(1200000, 300000)).toBeCloseTo(334.26 + 0.003 * (200000 - 167129.45), 1);
  });
});

describe('Spanish regions', () => {
  it("adds a region's own scale to the state's: Madrid's lower than Catalonia's", () => {
    expect(esIncomeTax(30000, 0, false, 'Madrid')).toBeLessThan(esIncomeTax(30000, 0, false, 'Catalonia'));
  });
});

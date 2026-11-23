import { describe, expect, it } from 'vitest';
import { bracketTax } from '../tax';
import { NL_BOX1, nlBox3, nlGeneralCredit, nlWorkCredit } from '../nl';

describe('Dutch income tax, 2026', () => {
  it("matches the Belastingdienst's worked example: €29,531 on €80,000 before credits", () => {
    // the example rounds each bracket's tax (13,900 + 14,852 + 779), each rounded down; unrounded, 13,900.67 + 14,852.35 + 779.13 = 29,532.15
    expect(Math.abs(bracketTax(80000, NL_BOX1) - 29531)).toBeLessThan(2);
  });
  it('phases the credits out by the published tables', () => {
    expect(nlGeneralCredit(20000)).toBe(3115);
    expect(nlGeneralCredit(80000)).toBe(0);
    expect(nlWorkCredit(30000)).toBeCloseTo(5300 + 0.0195 * 4155, 2);
    expect(nlWorkCredit(140000)).toBe(0);
  });
  it('taxes no box 3 under the allowance', () => {
    expect(nlBox3(20000, 30000)).toBe(0);
    expect(nlBox3(0, 159357)).toBeCloseTo(0.36 * 0.06 * 100000, 2);
  });
});

import { nlBox1 } from '../nl';
describe('Dutch tax from the state pension age', () => {
  it('uses 17.85% in the first bracket and the elderly credit', () => {
    const t = 20000 * 0.1785 - 1556 - 2067;
    expect(nlBox1(20000, 0, true)).toBeCloseTo(Math.max(0, t), 2);
    expect(nlBox1(30000, 0, true)).toBeCloseTo(30000 * 0.1785 - (1556 - 0.03195 * 264) - 2067, 2);
  });
});

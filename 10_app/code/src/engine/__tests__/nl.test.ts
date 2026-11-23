import { describe, expect, it } from 'vitest';
import { bracketTax } from '../tax';
import { NL_BOX1, nlBox3, nlGeneralCredit, nlWorkCredit } from '../nl';

describe('Dutch income tax, 2026', () => {
  it("matches the Belastingdienst's worked example: €29,531 on €80,000 before credits", () => {
    // the example rounds each bracket's tax (13,900 + 14,852 + 779), the sum of the unrounded parts is 29,531.7
    expect(Math.abs(bracketTax(80000, NL_BOX1) - 29531)).toBeLessThan(1);
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

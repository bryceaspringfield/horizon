import { describe, expect, it } from 'vitest';
import { auPerson } from '../au';

describe('Australian tax, 2026-27', () => {
  it('taxes $90,000 as the ATO table does', () => {
    // $4,020 + 30% of $45,000 = $17,520; LITO 0 at $90,000; Medicare levy 2% = $1,800
    const r = auPerson(90000);
    expect(r.income).toBeCloseTo(17520, 2);
    expect(r.medicare).toBeCloseTo(1800, 2);
  });
  it('applies the low income tax offset', () => {
    // (30,000 - 18,200) x 15% = 1,770, less the $700 offset
    expect(auPerson(30000).income).toBeCloseTo(1070, 2);
  });
});

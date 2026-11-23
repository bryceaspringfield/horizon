import { describe, expect, it } from 'vitest';
import { caPerson } from '../ca';

describe('Canadian tax, Ontario, 2026', () => {
  it('charges CPP and EI at their 2026 maxima on a high salary', () => {
    const r = caPerson({ employment: 200000, other: 0 });
    expect(r.cpp).toBeCloseTo(4230.45 + 416, 2);
    expect(r.ei).toBeCloseTo(1123.07, 2);
  });
  it('taxes a $50,000 salary at the lowest rates less the credits', () => {
    const r = caPerson({ employment: 50000, other: 0 });
    const cppBase = 46500 * 0.0495, cppFirst = 465, ei = 815;
    const taxable = 50000 - cppFirst;
    expect(r.federal).toBeCloseTo(0.14 * taxable - 0.14 * (16452 + 1501 + cppBase + ei), 1);
    expect(r.ontario).toBeCloseTo(0.0505 * taxable - 0.0505 * (12989 + cppBase + ei) + Math.min(600, 450 + 0.25 * (taxable - 48000)), 1);
  });
});

describe('Canadian provinces', () => {
  it('Alberta taxes $60,000 at 8% less its credit', () => {
    const r = caPerson({ employment: 60000, other: 0 }, 'AB');
    const cppBase = (60000 - 3500) * 0.0495, ei = 60000 * 0.0163, taxable = 60000 - (60000 - 3500) * 0.01;
    expect(r.ontario).toBeCloseTo(0.08 * taxable - 0.08 * (22769 + cppBase + ei), 1);
  });
});

describe('OAS recovery tax', () => {
  it('takes back 15% of income over $95,323, at most the pension', () => {
    expect(caPerson({ employment: 0, other: 105323, oas: 9000 }).oasRecovery).toBeCloseTo(1500, 2);
    expect(caPerson({ employment: 0, other: 300000, oas: 9000 }).oasRecovery).toBe(9000);
  });
});

describe('Quebec', () => {
  it('charges QPP, EI at 1.30%, and QPIP at their 2026 maxima', () => {
    const r = caPerson({ employment: 200000, other: 0 }, 'QC');
    expect(r.cpp).toBeCloseTo(71100 * 0.063 + 416, 2);
    expect(r.ei).toBeCloseTo(895.7 + 442.9, 2);
  });
  it('taxes $40,000 at 14% less the $18,952 credit, and abates federal tax by 16.5%', () => {
    const r = caPerson({ employment: 0, other: 40000 }, 'QC');
    expect(r.ontario).toBeCloseTo(0.14 * (40000 - 18952), 2);
    expect(r.federal).toBeCloseTo(0.14 * (40000 - 16452) * 0.835, 2);
  });
});

describe("Ontario's tax reduction", () => {
  it('cancels a small provincial tax', () => {
    // a low income whose Ontario tax before reduction is under $600 pays none of it
    const r = caPerson({ employment: 0, other: 18000 }, 'ON');
    expect(r.ontario).toBe(0);
  });
});

describe('Quebec credits and Ontario children', () => {
  it('credits living alone, age, and retirement income at 14%', () => {
    const base = caPerson({ employment: 0, other: 30000 }, 'QC').ontario;
    const more = caPerson({ employment: 0, other: 30000, alone: true, over65: true, pension: 5000 }, 'QC').ontario;
    expect(base - more).toBeCloseTo(0.14 * (2172 + 3986 + 3541), 2);
  });
});

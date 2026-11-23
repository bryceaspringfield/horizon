import { describe, expect, it } from 'vitest';
import { stateEstateTax, stateInheritanceTax } from '../stateDeath';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';
import { netLegacy } from '../estate';

describe('state estate taxes (2026 table)', () => {
  it('taxes Connecticut at a flat 12% above $15M, and Vermont at 16% above $5M', () => {
    expect(stateEstateTax('CT', 20000000, 1, false)).toBeCloseTo(0.12 * 5000000, 0);
    expect(stateEstateTax('VT', 6000000, 1, false)).toBeCloseTo(0.16 * 1000000, 0);
  });
  it('is zero below the exemption and in states without the tax', () => {
    expect(stateEstateTax('MA', 1900000, 1, false)).toBe(0);
    expect(stateEstateTax('TX', 50000000, 1, false)).toBe(0);
  });
  it('taxes the whole New York estate past 105% of the exemption', () => {
    const under = stateEstateTax('NY', 7350000 * 1.04, 1, false);
    const over = stateEstateTax('NY', 7350000 * 1.06, 1, false);
    expect(over).toBeGreaterThan(under * 5);
  });
  it('rises to the top rate: Washington\'s 20% applies at the margin above $9M', () => {
    const a = stateEstateTax('WA', 12000000, 1, false), b = stateEstateTax('WA', 13000000, 1, false);
    expect(b - a).toBeCloseTo(0.2 * 1000000, 0);
  });
  it('gives a Hawaii couple two exemptions and a Massachusetts couple one', () => {
    expect(stateEstateTax('HI', 10000000, 1, true)).toBe(0);
    expect(stateEstateTax('MA', 3000000, 1, true)).toBeGreaterThan(0);
  });
});

describe('state inheritance taxes', () => {
  it('charges Pennsylvania 4.5% on children and 15% on others', () => {
    expect(stateInheritanceTax('PA', 1000000, 'children', 2)).toBeCloseTo(45000, 0);
    expect(stateInheritanceTax('PA', 1000000, 'others', 2)).toBeCloseTo(150000, 0);
  });
  it('exempts children in New Jersey, Kentucky, and Maryland', () => {
    for (const s of ['NJ', 'KY', 'MD']) expect(stateInheritanceTax(s, 1000000, 'children', 2)).toBe(0);
  });
});

describe('net legacy by the state at the last death', () => {
  it('falls when the couple moves to Massachusetts', () => {
    const p = examplePlan(2026);
    p.assumptions.state = 'TX';
    const tx = netLegacy(p, simulate(structuredClone(p)));
    p.events = [{ id: 'mv', kind: 'move', name: 'Boston', year: 2040, state: 'MA' }];
    const ma = netLegacy(p, simulate(structuredClone(p)));
    expect(tx.stateEstateTax).toBe(0);
    expect(ma.state).toBe('MA');
    expect(ma.stateEstateTax).toBeGreaterThan(0);
  });
});

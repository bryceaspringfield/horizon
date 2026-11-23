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
  it('phases New York\'s credit out between 100% and 105% of the exemption, then taxes the whole estate', () => {
    const a = stateEstateTax('NY', 7350000 * 1.005, 1, false), b = stateEstateTax('NY', 7350000 * 1.04, 1, false);
    expect(a).toBeLessThan(b);
    const e = 7350000 * 1.06;
    expect(stateEstateTax('NY', e, 1, false)).toBeCloseTo(650800 + 0.136 * (e - 7100000), 0);
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

describe('state estate taxes against published figures', () => {
  it('Massachusetts: $39,200 on $2.5M and $292,000 on $5M', () => {
    expect(stateEstateTax('MA', 2500000, 1, false)).toBeCloseTo(39200, 0);
    expect(stateEstateTax('MA', 5000000, 1, false)).toBeCloseTo(292000, 0);
  });
  it('Rhode Island (2026 exemption $1,838,056): $94,060 on $3M and $303,660 on $5M', () => {
    expect(stateEstateTax('RI', 3000000, 1, false)).toBeCloseTo(94060, -1);
    expect(stateEstateTax('RI', 5000000, 1, false)).toBeCloseTo(303660, -1);
  });
  it('Illinois: $285,714 on $5M (Attorney General fact sheet)', () => {
    expect(stateEstateTax('IL', 5000000, 1, false)).toBeCloseTo(285714, 0);
  });
  it('New York: the ET-706 worksheet example (exclusion $7,160,000, estate $7,354,036, credit $208,011)', () => {
    const t = stateEstateTax('NY', 7354036, 7160000 / 7350000, false);
    expect(t).toBeGreaterThan(685349 - 208011 - 5);
    expect(t).toBeLessThan(685349 - 208011 + 5);
  });
  it('Hawaii: $1,385,000 on a net taxable estate of $10M; Oregon: $1,022,500 on $9.5M', () => {
    expect(stateEstateTax('HI', 15490000, 1, false)).toBeCloseTo(1385000, 0);
    expect(stateEstateTax('OR', 9500000, 1, false)).toBeCloseTo(1022500, 0);
  });
  it('DC taxes each dollar above its exemption at its bracket by the whole estate; Maryland caps the credit at 16%', () => {
    expect(stateEstateTax('DC', 6000000, 1, false)).toBeCloseTo((5000000 - 4988400) * 0.112 + 1000000 * 0.12, 0);
    expect(stateEstateTax('MD', 6000000, 1, false)).toBeCloseTo(160000, 0);
  });
  it('Minnesota and Maine tax the excess over the exemption at their brackets', () => {
    expect(stateEstateTax('MN', 3000000 + 8100000, 1, false)).toBeCloseTo(1059000, 0);
    expect(stateEstateTax('ME', 7160000 + 6000000, 1, false)).toBeCloseTo(540000, 0);
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

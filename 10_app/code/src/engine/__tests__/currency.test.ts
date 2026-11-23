import { describe, expect, it } from 'vitest';
import { convertCurrencies, foreignCurrencies, formatMoney } from '../currency';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';

describe('currencies', () => {
  it('formats an amount in a plan\'s currency', () => {
    expect(formatMoney(1234.4, 'USD')).toBe('$1,234');
    expect(formatMoney(1234, 'EUR')).toBe('€1,234');
    expect(formatMoney(1234, 'GBP')).toBe('£1,234');
    expect(formatMoney(2000000, 'NOK', true)).toMatch(/kr\s?2M/);
    expect(formatMoney(12, 'ZZZ9')).toBe('12');
  });

  it('converts foreign accounts, incomes, and expenses into the plan\'s currency', () => {
    const p = examplePlan(2026);
    p.assumptions.fx = { EUR: { rate: 1.1, drift: 0.02 }, GBP: { rate: 1.25, drift: 0 } };
    p.accounts.push({ id: 'eu', name: 'Flat in Lisbon', kind: 'asset', ownerId: 'p1', balance: 200000, allocation: { stocks: 0, bonds: 0, cash: 0 }, appreciation: 0.03, currency: 'EUR' });
    p.accounts.push({ id: 'isa', name: 'ISA', kind: 'taxable', ownerId: 'p1', balance: 10000, costBasis: 8000, allocation: { stocks: 1, bonds: 0, cash: 0 }, currency: 'GBP' });
    p.incomes.push({ id: 'pen', name: 'German pension', kind: 'pension', ownerId: 'p1', amount: 12000, growth: 0, startYear: 2056, inflationAdjusted: true, taxable: true, currency: 'EUR', steps: [{ year: 2060, amount: 14000 }] });
    p.expenses.push({ id: 'rent', name: 'Rent abroad', kind: 'housing', amount: 6000, startYear: 2026, growth: 0.01, currency: 'EUR' });
    expect(foreignCurrencies(p)).toEqual(['EUR', 'GBP']);
    convertCurrencies(p);
    const acc = (id: string) => p.accounts.find((a) => a.id === id)!;
    expect(acc('eu').balance).toBeCloseTo(220000);
    expect(acc('eu').appreciation).toBeCloseTo(1.03 * 1.02 - 1);
    expect(acc('isa')).toMatchObject({ balance: 12500, costBasis: 10000 });
    const pen = p.incomes.find((i) => i.id === 'pen')!;
    expect(pen.amount).toBeCloseTo(13200);
    expect(pen.steps![0].amount).toBeCloseTo(15400);
    expect(pen.growth).toBeCloseTo(0.02);
    expect(p.expenses.find((e) => e.id === 'rent')!.amount).toBeCloseTo(6600);
    expect(foreignCurrencies(p)).toEqual([]);
    const again = structuredClone(p);
    expect(convertCurrencies(again)).toEqual(p);
  });

  it('a foreign account at a rate of 2 projects as the same account at twice the balance', () => {
    const base = examplePlan(2026);
    const foreign = structuredClone(base);
    const doubled = structuredClone(base);
    foreign.assumptions.fx = { EUR: { rate: 2, drift: 0 } };
    foreign.accounts.find((a) => a.id === 'a_roth')!.currency = 'EUR';
    doubled.accounts.find((a) => a.id === 'a_roth')!.balance *= 2;
    const a = simulate(foreign), b = simulate(doubled);
    expect(a.endingNetWorthReal).toBeCloseTo(b.endingNetWorthReal, 2);
    expect(a.years[0].netWorth).not.toBeCloseTo(simulate(structuredClone(base)).years[0].netWorth, 0);
  });
});

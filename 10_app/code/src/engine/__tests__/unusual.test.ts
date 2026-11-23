import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';
import type { YearResult } from '../types';

const tax = (y: YearResult) => y.taxes.federal + y.taxes.state + y.taxes.capitalGains + y.taxes.niit;

// Unusual money situations (Bryce, 2026-11-23): bonuses, settlements, paid-back spending, FSA spending, collectibles.
describe('unusual money situations', () => {
  it('pays an account bonus once, untaxed from a card and taxed from a bank', () => {
    const plan = examplePlan(), y0 = plan.startYear, who = plan.people[0].id;
    const base = simulate(plan).years[0];
    plan.incomes.push({ id: 'cardb', name: 'Card bonus', kind: 'accountBonus', bonusSource: 'card', ownerId: who, amount: 750, growth: 0, startYear: y0, inflationAdjusted: false, taxable: false });
    const card = simulate(plan).years;
    expect(card[0].income.cardb).toBeCloseTo(750, 0);
    expect(card[1].income.cardb).toBeUndefined();
    expect(tax(card[0])).toBeCloseTo(tax(base), 0);
    plan.incomes[plan.incomes.length - 1] = { ...plan.incomes[plan.incomes.length - 1], bonusSource: 'bank', taxable: true };
    const bank = simulate(plan).years[0];
    expect((tax(bank)) - (tax(base))).toBeGreaterThan(50);
  });
  it('pays back a reimbursed expense in the year set', () => {
    const plan = examplePlan(), y0 = plan.startYear;
    plan.expenses.push({ id: 'trip', name: 'Work trip', kind: 'oneTime', amount: 2000, growth: 0, startYear: y0, inflationAdjusted: false, reimbursedShare: 1, reimbursedAfterYears: 1 } as never);
    const ys = simulate(plan).years;
    expect(ys[0].income.__reimbursed).toBeUndefined();
    expect(ys[1].income.__reimbursed).toBeCloseTo(2000, 0);
  });
  it('taxes a collectible gain more than the same gain on another asset', () => {
    const plan = examplePlan(), who = plan.people[0].id, y = plan.startYear + 1;
    plan.accounts.push({ id: 'coins', name: 'Coins', kind: 'asset', ownerId: who, balance: 60000, costBasis: 10000, saleYear: y, appreciation: 0, allocation: { stocks: 0, bonds: 0, cash: 0 } } as never);
    const plain = tax(simulate(plan).years[1]);
    (plan.accounts[plan.accounts.length - 1] as { collectible?: boolean }).collectible = true;
    const coll = tax(simulate(plan).years[1]);
    expect(coll).toBeGreaterThan(plain);
  });
});

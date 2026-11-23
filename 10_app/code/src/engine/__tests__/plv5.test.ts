import { describe, expect, it } from 'vitest';
import { importProjectionLab, isProjectionLabExport } from '../projectionlab';
import v5 from './fixtures/projectionlab_v5_synthetic.json';

// A synthetic ProjectionLab 5 export (every value invented) following the v5 export structure, from the open-source
// projectionlab-mcp project's test fixture (github.com/Backroads4Me/projectionlab-mcp, test/fixtures/v5-export.mjs).
describe('ProjectionLab 5 export', () => {
  it('reads people, accounts, assets, debts, income, and expenses', () => {
    expect(isProjectionLabExport(v5)).toBe(true);
    const r = importProjectionLab(v5, 2026);
    expect(r.plans.map((p) => p.name)).toEqual(['Main Plan', 'Retire Early']);
    const p = r.plans[0];
    expect(p.people.map((q) => [q.name, q.birthYear])).toEqual([['Alex', 1980], ['Sam', 1982]]);
    const acc = Object.fromEntries(p.accounts.map((a) => [a.name, [a.kind, a.balance]]));
    expect(acc['Brokerage']).toEqual(['taxable', 50000]);
    expect(acc['Work 401k']).toEqual(['traditional', 20000]);
    expect(acc['Land']).toEqual(['asset', 120000]);
    expect(acc['Old Savings']).toBeUndefined();
    expect(p.accounts.find((a) => a.kind === 'debt')?.balance).toBe(60000);
    expect(p.incomes.map((x) => [x.name, x.amount])).toEqual([['Salary', 90000]]);
    expect(p.expenses.map((x) => [x.name, x.amount])).toEqual([['Living', 50000]]);
  });
});

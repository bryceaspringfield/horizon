import { describe, expect, it } from 'vitest';
import { examplePlan } from '../defaults';
import { simulate } from '../simulate';
import { computeTax, foreignExclusionLimit, type ForeignInput } from '../tax';

const base = { year: 2026, status: 'single' as const, index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 0, interest: 0, qualifiedDividends: 0,
  longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0, state: 'TX' };
const abroad = (earned: number, more: Partial<ForeignInput> = {}): ForeignInput => ({ earned, earnedBy: [earned], exclusion: false, housing: 0, noUsPayroll: earned,
  taxEarned: 0, generalOther: 0, taxGeneralOther: 0, passiveIncome: 0, taxPassive: 0, taxOther: 0, carryGeneral: 0, carryPassive: 0, ...more });

describe('a US person\'s income from abroad', () => {
  it('the exclusion leaves out pay up to the limit, and a foreign employer\'s wages owe no US payroll tax', () => {
    expect(foreignExclusionLimit(2026, 1)).toBe(132900);
    const t = computeTax({ ...base, wages: 120000, foreign: abroad(120000, { exclusion: true }) });
    expect(t.foreignExclusion).toBe(120000);
    expect(t.agi).toBe(0);
    expect(t.total).toBe(0);
    const us = computeTax({ ...base, wages: 120000 });
    expect(us.fica).toBeGreaterThan(9000);
    expect(computeTax({ ...base, wages: 120000, foreign: abroad(120000, { exclusion: true, noUsPayroll: 0 }) }).total).toBeCloseTo(us.fica);
  });

  it('pay above the limit is taxed at the rates it would reach with no exclusion (the stacking rule)', () => {
    const t = computeTax({ ...base, wages: 200000, foreign: abroad(200000, { exclusion: true }) });
    expect(t.foreignExclusion).toBe(132900);
    expect(t.agi).toBe(67100);
    // the taxed slice sits wholly inside the 24% band, above the excluded $132,900
    expect(t.federal).toBeCloseTo(0.24 * t.ordinaryTaxable, 0);
    expect(t.marginalRate).toBe(0.24);
    const plain = computeTax({ ...base, wages: 67100 });
    expect(t.federal).toBeGreaterThan(plain.federal * 1.5);
  });

  it('the housing exclusion adds the cost between 16% and 30% of the limit', () => {
    const t = computeTax({ ...base, wages: 200000, foreign: abroad(200000, { exclusion: true, housing: 50000 }) });
    expect(t.foreignExclusion).toBeCloseTo(132900 + 0.14 * 132900);
    const low = computeTax({ ...base, wages: 200000, foreign: abroad(200000, { exclusion: true, housing: 20000 }) });
    expect(low.foreignExclusion).toBe(132900);
  });

  it('the foreign tax credit cancels US income tax on foreign pay, and the rest carries over', () => {
    const plain = computeTax({ ...base, wages: 100000 });
    const regular = plain.federal;
    const t = computeTax({ ...base, wages: 100000, foreign: abroad(100000, { taxEarned: 30000 }) });
    expect(t.foreignTaxCredit).toBeCloseTo(regular);
    expect(t.total).toBeCloseTo(30000);
    expect(t.ftc!.newGeneral - t.ftc!.usedGeneral).toBeCloseTo(30000 - regular);
    // a low foreign tax leaves US tax owed on top: the two together equal the US tax
    const low = computeTax({ ...base, wages: 100000, foreign: abroad(100000, { taxEarned: 5000 }) });
    expect(low.foreignTaxCredit).toBe(5000);
    expect(low.total).toBeCloseTo(regular);
    // a carryover from earlier years is used where this year's foreign tax falls short
    const carried = computeTax({ ...base, wages: 100000, foreign: abroad(100000, { taxEarned: 5000, carryGeneral: 4000 }) });
    expect(carried.foreignTaxCredit).toBe(9000);
  });

  it('the credit stops at the US tax on the foreign share of income, by basket', () => {
    const t = computeTax({ ...base, wages: 100000, otherOrdinary: 100000, foreign: abroad(100000, { taxEarned: 60000 }) });
    const usShare = (t.federal + t.capitalGains) * (100000 / t.agi);
    expect(t.foreignTaxCredit).toBeCloseTo(usShare);
    const p = computeTax({ ...base, wages: 100000, qualifiedDividends: 10000, foreign: abroad(0, { noUsPayroll: 0, passiveIncome: 10000, taxPassive: 5000 }) });
    expect(p.ftc!.usedGeneral).toBe(0);
    expect(p.ftc!.usedPassive).toBeCloseTo((p.federal + p.capitalGains) * (10000 / p.agi));
    // with the exclusion, foreign tax on the excluded pay earns no credit
    const x = computeTax({ ...base, wages: 120000, foreign: abroad(120000, { exclusion: true, taxEarned: 40000 }) });
    expect(x.foreignTaxCredit).toBe(0);
    expect(x.ftc!.newGeneral).toBe(0);
    expect(x.total).toBe(40000);
  });

  it('a plan with pay abroad pays the foreign tax, takes the credit, and uses the carryover after moving home', () => {
    const p = examplePlan(2026);
    p.people = [p.people[0]]; p.assumptions.filingStatus = 'single'; p.assumptions.state = 'TX';
    p.accounts = p.accounts.filter((a) => a.ownerId === 'p1'); p.socialSecurity = [p.socialSecurity[0]];
    p.incomes = [
      { id: 'abroad', name: 'Job in Oslo', kind: 'salary', ownerId: 'p1', amount: 150000, growth: 0, startYear: 2026, endYear: 2028, inflationAdjusted: true, taxable: true, abroad: true, foreignTaxRate: 0.35 },
      { id: 'home', name: 'Job at home', kind: 'salary', ownerId: 'p1', amount: 150000, growth: 0, startYear: 2029, inflationAdjusted: true, taxable: true },
    ];
    const proj = simulate(p);
    const y0 = proj.years[0].taxes, y3 = proj.years[3].taxes;
    expect(y0.foreign).toBeCloseTo(52500);
    expect(y0.foreignCredit).toBeGreaterThan(20000);
    expect(y0.fica).toBe(0);
    expect(y0.federal + y0.capitalGains - y0.foreignCredit!).toBeLessThan(1500);
    // at home again: no foreign income, so the carried credit has no foreign-source income to apply to
    expect(y3.foreign).toBeUndefined();
    expect(y3.fica).toBeGreaterThan(9000);
    const ex = structuredClone(p); ex.assumptions.expat = { exclusion: true, housing: 0 };
    const e0 = simulate(ex).years[0].taxes;
    expect(e0.foreignExclusion).toBeCloseTo(132900);
    expect(e0.foreign).toBeCloseTo(52500);
  });
});

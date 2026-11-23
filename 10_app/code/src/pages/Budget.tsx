// The budget (Bryce, 2026-11-23): a year's spending a month, by type and by expense, beside take-home pay a month, and
// the essentials checklist, whose missing items are added to the plan at a starting estimate in one tap.
import { useState } from 'react';
import { uid } from '../engine/defaults';
import { ESSENTIALS, essentialExpense, missingEssentials } from '../engine/essentials';
import type { ExpenseKind } from '../engine/types';
import { useStore } from '../store';
import { useProjection } from '../useProjection';
import { Card, Num, Stat, money, PALETTE } from '../ui';

const KIND: Record<ExpenseKind, string> = {
  living: 'Living', housing: 'Housing', healthcare: 'Healthcare', education: 'Education', travel: 'Travel', other: 'Other',
  oneTime: 'One-time', insurance: 'Insurance', longTermCare: 'Long-term care', childcare: 'Childcare',
} as Record<ExpenseKind, string>;

export function BudgetPage() {
  const { plan, proj } = useProjection();
  const update = useStore((s) => s.update);
  const [year, setYear] = useState(plan.startYear);
  const y = proj.years.find((r) => r.year === year) ?? proj.years[0];
  if (!y) return <Card title="Budget"><p className="muted">The plan has no years to show.</p></Card>;
  const t = y.taxes;
  const gross = Object.values(y.income).reduce((s, v) => s + v, 0) + y.socialSecurity;
  const taxes = t.federal + t.state + t.fica + t.capitalGains + t.niit + t.penalty;
  const rows = plan.expenses.map((e) => ({ e, m: (y.expenses[e.id] ?? 0) / 12 })).filter((r) => r.m > 0.5).sort((a, b) => b.m - a.m);
  const other = Object.entries(y.expenses).filter(([id]) => !plan.expenses.some((e) => e.id === id)).reduce((s, [, v]) => s + v, 0) / 12;
  const byKind = new Map<string, number>();
  for (const r of rows) byKind.set(KIND[r.e.kind] ?? r.e.kind, (byKind.get(KIND[r.e.kind] ?? r.e.kind) ?? 0) + r.m);
  if (other > 0.5) byKind.set('Debt payments, premiums, and taxes on homes', other);
  const spend = [...byKind.values()].reduce((s, v) => s + v, 0);
  const takeHome = (gross - taxes) / 12;
  const kinds = [...byKind.entries()].sort((a, b) => b[1] - a[1]);
  const missing = missingEssentials(plan);
  const add = (key: string) => {
    const x = ESSENTIALS.find((k) => k.key === key)!;
    update((p) => { p.expenses.push(essentialExpense(x, p.startYear, 'e' + uid())); });
  };
  return (
    <>
      <Card title="Budget a month">
        <div className="grid">
          <Num label="Year" value={year} onChange={(v) => setYear(Math.max(plan.startYear, Math.min(v, plan.startYear + proj.years.length - 1)))} />
        </div>
        <div className="stats">
          <Stat icon="trend" label="Take-home pay" value={money(takeHome)} sub="income after taxes, a month" />
          <Stat icon="trend" label="Spending" value={money(spend)} sub="a month" />
          <Stat icon="trend" label="Left over" value={money(takeHome - spend)} sub={takeHome > 0 ? `${Math.round(((takeHome - spend) / takeHome) * 100)}% of take-home pay` : ''} tone={takeHome - spend >= 0 ? 'good' : 'bad'} />
        </div>
        <div className="budgetbar" role="img" aria-label="Spending by type">
          {kinds.map(([k, v], i) => <span key={k} style={{ flex: v, background: PALETTE[i % PALETTE.length] }} title={`${k}: ${money(v)}`} />)}
        </div>
        <ul className="budgetlist">
          {kinds.map(([k, v], i) => (
            <li key={k}><i style={{ background: PALETTE[i % PALETTE.length] }} /><span>{k}</span><b>{money(v)}</b><em>{spend > 0 ? Math.round((v / spend) * 100) : 0}%</em></li>
          ))}
        </ul>
      </Card>
      <Card title="Each expense a month">
        <ul className="budgetlist">
          {rows.map(({ e, m }) => <li key={e.id}><span>{e.name}</span><b>{money(m)}</b><em>{KIND[e.kind] ?? e.kind}</em></li>)}
        </ul>
      </Card>
      <Card title="Essentials">
        <ul className="essentials">
          {ESSENTIALS.map((x) => {
            const gap = missing.some((m) => m.key === x.key);
            return (
              <li key={x.key} className={gap ? 'gap' : 'ok'}>
                <span className="mark">{gap ? '!' : '✓'}</span>
                <span className="what"><b>{x.name}</b><small>{gap ? x.note : 'In the plan'}</small></span>
                {gap && <button onClick={() => add(x.key)}>+ Add{x.yearly ? ` at ${money(x.yearly / 12)} a month` : ''}</button>}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

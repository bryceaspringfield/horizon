// The budget (Bryce, 2026-11-23): a year's spending a month, by type and by expense, beside take-home pay a month, and
// the essentials checklist, whose missing items are added to the plan at a starting estimate in one tap.
import { useState } from 'react';
import { uid } from '../engine/defaults';
import { groceriesYearly } from '../engine/food';
import { ESSENTIALS, essentialExpense, missingEssentials } from '../engine/essentials';
import type { ExpenseKind } from '../engine/types';
import { useStore } from '../store';
import { useProjection } from '../useProjection';
import { Card, Num, Stat, money, PALETTE } from '../ui';

const KIND: Record<ExpenseKind, string> = {
  living: 'Living', housing: 'Housing', healthcare: 'Healthcare', education: 'Education', travel: 'Travel', other: 'Other',
  oneTime: 'One-time', insurance: 'Insurance', longTermCare: 'Long-term care', childcare: 'Childcare', transportation: 'Transportation', pets: 'Pets', homeProjects: 'Home projects',
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
  const groceries = groceriesYearly(plan.people.map((q) => ({ age: plan.startYear - q.birthYear, sex: q.sex, plan: q.foodPlan, paidByOthers: q.foodPaidByOthers })));
  const add = (key: string) => {
    const x = ESSENTIALS.find((k) => k.key === key)!;
    // groceries from each person's USDA food plan (engine/food.ts); the rest at their starting estimate
    const amount = key === 'groceries' ? groceries : x.yearly;
    update((p) => { p.expenses.push({ ...essentialExpense(x, p.startYear, 'e' + uid()), amount }); });
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
      <TimeValue takeHomeYear={takeHome * 12} />
      <Card title="Essentials">
        <ul className="essentials">
          {ESSENTIALS.map((x) => {
            const gap = missing.some((m) => m.key === x.key);
            return (
              <li key={x.key} className={gap ? 'gap' : 'ok'}>
                <span className="mark">{gap ? '!' : '✓'}</span>
                <span className="what"><b>{x.name}</b><small>{gap ? x.note : 'In the plan'}</small></span>
                {gap && <button onClick={() => add(x.key)}>+ Add{(x.key === 'groceries' ? groceries : x.yearly) ? ` at ${money((x.key === 'groceries' ? groceries : x.yearly) / 12)} a month` : ''}</button>}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

/** The money value of an hour (Bryce, 2026-11-23): take-home pay less the costs of working, over the hours work takes
 * (hours worked and commuting); a price in hours of work; and whether paying for a chore beats doing it. */
function TimeValue({ takeHomeYear }: { takeHomeYear: number }) {
  const [hours, setHours] = useState(40);
  const [commute, setCommute] = useState(5);
  const [costs, setCosts] = useState(0);
  const [price, setPrice] = useState(1000);
  const [choreHours, setChoreHours] = useState(2);
  const [choreCost, setChoreCost] = useState(60);
  const weeks = 48;
  const hourly = Math.max(0, takeHomeYear - costs) / Math.max(1, (hours + commute) * weeks);
  const worth = choreCost < choreHours * hourly;
  return (
    <Card title="Value of your time">
      <div className="grid">
        <Num label="Hours worked a week" value={hours} onChange={(v) => setHours(Math.max(0, v))} />
        <Num label="Commute hours a week" value={commute} onChange={(v) => setCommute(Math.max(0, v))} />
        <Num label="Yearly costs of working" value={costs} onChange={(v) => setCosts(Math.max(0, v))} />
      </div>
      <div className="stats">
        <Stat icon="trend" label="Your time is worth" value={money(hourly)} sub="an hour, after taxes and costs of working" />
        <Stat icon="trend" label="A price in hours of work" value={hourly ? (price / hourly).toFixed(1) + ' hours' : 'n/a'} sub={'for ' + money(price)} />
        <Stat icon="trend" label="Paying for the chore" value={worth ? 'Pays off' : 'Costs more'} sub={money(choreCost) + ' against ' + money(choreHours * hourly) + ' of your time'} tone={worth ? 'good' : 'bad'} />
      </div>
      <div className="grid">
        <Num label="A purchase's price" value={price} onChange={(v) => setPrice(Math.max(0, v))} />
        <Num label="Hours a chore takes you" value={choreHours} onChange={(v) => setChoreHours(Math.max(0, v))} />
        <Num label="Price to pay someone for it" value={choreCost} onChange={(v) => setChoreCost(Math.max(0, v))} />
      </div>
    </Card>
  );
}

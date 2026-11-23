// The plan report: a printable summary of the plan (its people, accounts, income, expenses, events, strategy, and
// results), saved as a PDF through the browser's print dialog.
import { useStore as useYearStore } from '../store';
import { useMemo, useState } from 'react';
import { netLegacy } from '../engine/estate';
import { runMonteCarlo } from '../engine/montecarlo';
import { useActivePlan, useStore } from '../store';
import { useProjection } from '../useProjection';
import { money, pct } from '../ui';

export function ReportPage() {
  const raw = useActivePlan();
  const update = useStore((s) => s.update);
  const settings = useStore((s) => s.settings);
  const { plan, proj, adj, real } = useProjection();
  const align = useYearStore((s) => s.settings.yearAlignment ?? 'calendar');
  const yearLabel = (y: number) => (align === 'calendar' ? String(y) : `${y}-${String((y + 1) % 100).padStart(2, '0')}`);
  const [mc, setMc] = useState<number | null>(null);
  const legacy = useMemo(() => netLegacy(plan, proj), [plan, proj]);
  const first = proj.years[0];
  const step = Math.max(1, Math.round(proj.years.length / 20));
  const rows = proj.years.filter((_, i) => i % step === 0 || i === proj.years.length - 1);
  const lifetimeTax = proj.years.reduce((t, y, i) => t + adj(y.taxes.total, i), 0);
  const name = (id: string) => plan.people.find((p) => p.id === id)?.name ?? '';
  const dollars = real ? "today's dollars" : 'future dollars';
  return (
    <div className="report">
      <div className="row noprint" style={{ marginBottom: 14 }}>
        <button onClick={() => window.print()}>Print or save as PDF</button>
        <button className="ghost" onClick={() => setMc(runMonteCarlo(raw, settings.mcMethod, 500).successRate)}>Add the Monte Carlo success rate</button>
      </div>
      <section className="card">
        <h1>{plan.name}</h1>
        <p className="muted">Prepared {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} with Horizon · amounts in {dollars} · {plan.assumptions.state}, filing {plan.assumptions.filingStatus === 'mfj' ? 'jointly' : plan.assumptions.filingStatus === 'hoh' ? 'as head of household' : 'single'}</p>
        <table className="num kv"><tbody>
          {plan.people.map((p) => <tr key={p.id}><th>{p.name}</th><td>born {p.birthYear}, retires at {plan.strategy.retirementAge[p.id] ?? '—'}, plan to age {p.lifeExpectancy}</td></tr>)}
          <tr><th>Net worth today</th><td>{money(first?.netWorth ?? 0)}</td></tr>
          <tr><th>Financial independence</th><td>{proj.financialIndependenceYear ?? 'Not reached'}</td></tr>
          <tr><th>Money lasts</th><td>{proj.depletionYear === null ? 'Through the plan' : `Runs short in ${proj.depletionYear}`}</td></tr>
          {mc !== null && <tr><th>Monte Carlo success rate</th><td>{pct(mc, 0)} of 500 trials</td></tr>}
          <tr><th>Net worth at the end</th><td>{money(proj.endingNetWorthReal)} (today's dollars)</td></tr>
          <tr><th>Lifetime taxes</th><td>{money(lifetimeTax)}</td></tr>
          <tr><th>Net legacy</th><td>{money(legacy.netLegacyReal)} (today's dollars)</td></tr>
        </tbody></table>
      </section>
      <section className="card">
        <h3>Accounts</h3>
        <table className="num"><thead><tr><th>Account</th><th>Owner</th><th>Type</th><th>Balance</th></tr></thead><tbody>
          {raw.accounts.map((a) => <tr key={a.id}><td>{a.name}</td><td>{name(a.ownerId)}</td><td>{a.kind}</td><td>{money(a.kind === 'debt' ? -Math.abs(a.balance) : a.balance)}</td></tr>)}
        </tbody></table>
      </section>
      <section className="card">
        <h3>Income and expenses (today's dollars)</h3>
        <table className="num"><thead><tr><th>Item</th><th>Yearly</th><th>Years</th></tr></thead><tbody>
          {raw.incomes.map((x) => <tr key={x.id}><td>{x.name}</td><td>{money(x.amount)}</td><td>{x.startYear}{x.endYear ? '–' + x.endYear : '–'}</td></tr>)}
          {raw.expenses.map((x) => <tr key={x.id}><td>{x.name}</td><td>−{money(x.amount)}</td><td>{x.startYear}{x.kind === 'oneTime' ? '' : '–' + (x.endYear ?? '')}</td></tr>)}
          {raw.socialSecurity.map((x) => <tr key={x.ownerId}><td>Social Security, {name(x.ownerId)}</td><td>{money(x.pia * 12)} at 67</td><td>from age {x.claimAge}</td></tr>)}
        </tbody></table>
        {(raw.events ?? []).length > 0 && <p>Life events: {(raw.events ?? []).map((e) => `${e.name} (${e.year})`).join('; ')}.</p>}
      </section>
      <section className="card">
        <h3>Strategy and assumptions</h3>
        <p>Withdrawals {plan.strategy.withdrawalMethod === 'proportional' ? 'in proportion to balances' : 'in the order ' + plan.strategy.withdrawalOrder.join(', ')}; Roth conversions {plan.strategy.rothConversionBracket > 0 ? 'up to the ' + pct(plan.strategy.rothConversionBracket, 0) + ' bracket' : 'none'}; spending rule: {plan.strategy.spending}; safe withdrawal rate {pct(plan.strategy.safeWithdrawalRate)}. Inflation {pct(plan.assumptions.inflation)}, stocks {pct(plan.assumptions.returns.stocks)}, bonds {pct(plan.assumptions.returns.bonds)}{plan.assumptions.taxModel?.kind === 'flat' ? `; a flat tax of ${pct(plan.assumptions.taxModel.rate)}` : ''}.</p>
      </section>
      <section className="card">
        <h3>Projection ({dollars})</h3>
        <table className="num"><thead><tr><th>Year</th><th>Ages</th><th>Income</th><th>Spending</th><th>Taxes</th><th>Invested</th><th>Net worth</th></tr></thead><tbody>
          {rows.map((y) => {
            const i = proj.years.indexOf(y);
            const inc = Object.values(y.income).reduce((t, v) => t + v, 0) + y.socialSecurity;
            return <tr key={y.year}><td>{yearLabel(y.year)}</td><td>{Object.values(y.ages).join(', ')}</td><td>{money(adj(inc, i), true)}</td><td>{money(adj(y.totalExpenses, i), true)}</td>
              <td>{money(adj(y.taxes.total, i), true)}</td><td>{money(adj(y.liquidNetWorth, i), true)}</td><td>{money(adj(y.netWorth, i), true)}</td></tr>;
          })}
        </tbody></table>
      </section>
      <section className="card">
        <h3>Notes</h3>
        <textarea className="noprint" rows={4} style={{ width: '100%' }} value={raw.notes ?? ''} placeholder="Notes printed with the report" onChange={(e) => { const v = e.target.value; update((p) => { p.notes = v; }); }} />
        <p className="printonly">{raw.notes}</p>
      </section>
    </div>
  );
}

// The pages reading the projection: the dashboard, net worth and cash-flow charts, taxes, Monte Carlo, plan
// comparison, progress against the plan, and the year-by-year table.
import { YearView } from './YearView';
import { MC_METRICS, grade, type McMetric } from '../engine/montecarlo';
import { useDark } from '../store';
import { useMemo, useState } from 'react';
import type { AccountKind, Plan } from '../engine/types';
import { runMonteCarlo, type MonteCarloResult } from '../engine/montecarlo';
import { useStore, type Snapshot } from '../store';
import { projectPlan, useProjection } from '../useProjection';
import { Card, Chart, Num, Select, Stat, money, moneyAxis, moneyTooltip, pct } from '../ui';
import { Icon } from '../icons';
import { NotableEvents, TaxByItem, TaxYear } from './More';
import { uid } from '../engine/defaults';
import { fireMetrics } from '../engine/fire';

const KIND_LABEL: Record<AccountKind, string> = {
  cash: 'Cash', taxable: 'Taxable', traditional: 'Traditional', roth: 'Roth', hsa: 'HSA', college529: '529', asset: 'Assets', debt: 'Debts',
};

function dollarsNote(real: boolean) {
  return real ? "today's dollars" : 'future (nominal) dollars';
}

function milestoneMarks(plan: Plan, years: { year: number; milestonesReached: string[] }[]) {
  return years.flatMap((y) => y.milestonesReached.map((id) => ({
    xAxis: String(y.year),
    label: { formatter: plan.milestones.find((m) => m.id === id)?.name ?? '', position: 'insideEndTop', fontSize: 10 },
  })));
}

export function Dashboard() {
  const { plan, proj, adj, real } = useProjection();
  const first = proj.years[0];
  const retireYear = Math.min(...plan.people.map((p) => p.birthYear + (plan.strategy.retirementAge[p.id] ?? 200)));
  const ri = proj.years.findIndex((y) => y.year === retireYear);
  const atRet = proj.years[ri] ?? first;
  const lifeTax = proj.years.reduce((t, y, i) => t + adj(y.taxes.total, i), 0);
  const savingsRate = (() => {
    const y = first, gross = Object.values(y.income).reduce((t, v) => t + v, 0) + y.employerMatch;
    const saved = Object.values(y.contributions).reduce((t, v) => t + v, 0);
    return gross > 0 ? saved / gross : 0;
  })();
  // A quick 300-trial Monte Carlo for the gauge; the Monte Carlo page runs the full version.
  const mc = useMemo(() => runMonteCarlo(plan, 'normal', 300, 7), [plan]);
  const pctOk = mc.successRate;
  const tone = pctOk >= 0.85 ? 'var(--good)' : pctOk >= 0.7 ? 'var(--warn)' : 'var(--bad)';
  const events = proj.years.flatMap((y) => y.milestonesReached.map((id) => ({ year: y.year, m: plan.milestones.find((m) => m.id === id)! })));
  return (
    <>
      <YearView />
      <div className="stats">
        <Stat icon="coins" label="Net worth today" value={money(first.netWorth, true)} sub={`${money(first.liquidNetWorth, true)} invested`} />
        <Stat icon="flag" label="Financial independence" value={proj.financialIndependenceYear ?? 'Not reached'}
          sub={proj.financialIndependenceYear ? `at age ${proj.financialIndependenceYear - plan.people[0].birthYear}` : 'within the plan'} tone={proj.financialIndependenceYear ? 'good' : 'bad'} />
        <Stat icon="trend" label={`Invested at retirement (${retireYear})`} value={money(adj(atRet.liquidNetWorth, Math.max(0, ri)), true)} sub={real ? "today's dollars" : 'future dollars'} />
        <Stat icon="shield" label="Money lasts" value={proj.depletionYear ? String(proj.depletionYear) : 'For life'} sub={proj.depletionYear ? 'investments run out' : `through ${proj.years[proj.years.length - 1].year}`} tone={proj.depletionYear ? 'bad' : 'good'} />
        <Stat icon="income" label="Savings rate" value={pct(savingsRate, 0)} sub="of this year's pay" />
        <Stat icon="taxes" label="Lifetime taxes" value={money(lifeTax, true)} sub="income, payroll, and health surcharges" />
      </div>
      <div className="cols">
        <NetWorthChart hero />
        <section className="card">
          <header><h3>Chance of success</h3></header>
          <div className="gauge">
            <div className="ring" style={{ background: `conic-gradient(${tone} ${pctOk * 360}deg, var(--line) 0)` }}>
              <div style={{ color: tone }}>{pct(pctOk, 0)}</div>
            </div>
            <div className="muted">of 300 market paths last for life</div>
          </div>
          <div className="stats" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, marginBottom: 0 }}>
            <Stat label="Median at the end" value={money(mc.endingReal.p50, true)} />
            <Stat label="Bad case (10th pct.)" value={money(mc.endingReal.p10, true)} />
          </div>
        </section>
      </div>
      <div style={{ height: 18 }} />
      {events.length > 0 && <Card title="Milestones">
        <div className="timeline">
          {events.map((e) => (
            <div key={e.m.id} className="ev">
              <div className="dot"><Icon name="flag" size={15} /></div>
              <div><b>{e.m.name}</b><span>{e.year} · {plan.people.map((p) => `${p.name} ${e.year - p.birthYear}`).join(', ')}</span></div>
            </div>
          ))}
        </div>
      </Card>}
      <Card title="Income and spending" wide>
        <IncomeSpendingChart />
      </Card>
    </>
  );
}

export function NetWorthChart({ hero }: { hero?: boolean }) {
  const { plan, proj, adj, real } = useProjection();
  const withReal = useStore((s) => s.settings.chartRealAssets !== false);
  const setSettings = useStore((s) => s.setSettings);
  // Without real assets: no home or other asset, and no debt secured by one.
  const counts = (a: (typeof plan.accounts)[0]) => withReal || !(a.kind === 'asset' || (a.kind === 'debt' && a.securedBy));
  const kinds: AccountKind[] = ['cash', 'taxable', 'traditional', 'roth', 'hsa', 'college529', 'asset', 'debt'];
  const area = (color: string) => ({ color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + 'cc' }, { offset: 1, color: color + '33' }] } });
  const colors: Record<string, string> = { cash: '#94a3b8', taxable: '#5b5bf0', traditional: '#f59e0b', roth: '#a855f7', hsa: '#14b8a6', college529: '#0ea5e9', asset: '#84cc16', debt: '#f43f5e' };
  const series: Record<string, unknown>[] = kinds
    .map((k) => ({
      name: KIND_LABEL[k], type: 'line', stack: k === 'debt' ? 'debt' : 'nw', smooth: true, symbol: 'none', lineStyle: { width: 0 },
      areaStyle: area(colors[k]), itemStyle: { color: colors[k] }, emphasis: { focus: 'series' },
      data: proj.years.map((y, i) => Math.round(adj(plan.accounts.filter((a) => a.kind === k && counts(a)).reduce((t, a) => t + (y.balances[a.id] ?? 0), 0), i))),
    }))
    .filter((s) => (s.data as number[]).some((v) => v !== 0));
  series.push({ name: 'Net worth', type: 'line', smooth: true, symbol: 'none', lineStyle: { width: 2.5, color: '#1b2033' }, itemStyle: { color: '#1b2033' },
    data: proj.years.map((y, i) => Math.round(adj(withReal ? y.netWorth : y.financialNetWorth ?? y.netWorth, i))),
    markLine: { symbol: 'none', lineStyle: { type: 'dashed', color: '#8b8fa8' }, label: { show: !hero, color: '#6b7185' }, data: milestoneMarks(plan, proj.years) } });
  return (
    <section className={'card' + (hero ? ' hero' : '')}>
      <header><h3>Net worth by account type</h3><span className="muted">{dollarsNote(real)} · <label className="inline"><input type="checkbox" checked={withReal} onChange={(e) => setSettings({ chartRealAssets: e.target.checked })} /> real assets</label></span></header>
      <Chart height={hero ? 400 : 460} option={{
        tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 16, top: 44, bottom: hero ? 30 : 56 },
        xAxis: { type: 'category', boundaryGap: false, data: proj.years.map((y) => String(y.year)) }, yAxis: moneyAxis,
        dataZoom: hero ? undefined : [{ type: 'slider', height: 18, bottom: 10, borderColor: 'transparent' }], series,
      }} />
    </section>
  );
}

function IncomeSpendingChart() {
  const { proj, adj } = useProjection();
  const yrs = proj.years.map((y) => String(y.year));
  const inc = (f: (y: (typeof proj.years)[0]) => number) => proj.years.map((y, i) => Math.round(adj(f(y), i)));
  return (
    <Chart option={{
      tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: yrs }, yAxis: moneyAxis,
      series: [
        { name: 'Work and other income', type: 'bar', stack: 'in', barMaxWidth: 14, data: inc((y) => Object.values(y.income).reduce((t, v) => t + v, 0)) },
        { name: 'Social Security', type: 'bar', stack: 'in', data: inc((y) => y.socialSecurity) },
        { name: 'Withdrawals', type: 'bar', stack: 'in', data: inc((y) => Object.values(y.withdrawals).reduce((t, v) => t + v, 0)) },
        { name: 'Spending', type: 'line', smooth: true, symbol: 'none', lineStyle: { width: 2.5 }, data: inc((y) => y.spending ?? y.totalExpenses) },
        { name: 'Taxes', type: 'line', smooth: true, symbol: 'none', lineStyle: { width: 2, type: 'dashed' }, data: inc((y) => y.taxes.total) },
      ],
    }} />
  );
}

export function CashFlowPage() {
  const dark = useDark();
  const { plan, proj, adj, real } = useProjection();
  const [year, setYear] = useState(plan.startYear);
  const i = Math.max(0, proj.years.findIndex((y) => y.year === year));
  const y = proj.years[i];
  const name = (id: string): string =>
    id.startsWith('cb_') ? (plan.accounts.find((x) => 'cb_' + x.id === id)?.name ?? 'Card') + ' cash back' :
    plan.incomes.find((x) => x.id === id)?.name ?? plan.expenses.find((x) => x.id === id)?.name ?? plan.accounts.find((x) => x.id === id)?.name ?? ({ __reimbursed: 'Paid back to you', __cardFees: 'Card annual fees', __spending: 'Retirement spending', __medicare: 'Medicare premiums', __aca: 'ACA premiums', __charity: 'Charity', __propertyTax: 'Property tax' } as Record<string, string>)[id] ?? id;
  const links: { source: string; target: string; value: number }[] = [];
  const add = (source: string, target: string, v: number) => { if (v > 1) links.push({ source, target, value: Math.round(adj(v, i)) }); };
  for (const [id, v] of Object.entries(y.income)) add(name(id), 'Cash flow', v);
  add('Social Security', 'Cash flow', y.socialSecurity);
  add('Employer match', 'Cash flow', y.employerMatch);
  for (const [id, v] of Object.entries(y.withdrawals)) add(name(id) + ' (withdrawal)', 'Cash flow', v);
  add('Cash flow', 'Federal tax', y.taxes.federal + y.taxes.capitalGains + y.taxes.niit + y.taxes.penalty);
  add('Cash flow', 'State tax', y.taxes.state);
  add('Cash flow', 'Payroll tax', y.taxes.fica);
  for (const [id, v] of Object.entries(y.expenses)) add('Cash flow', name(id), v);
  for (const [id, v] of Object.entries(y.contributions)) add('Cash flow', name(id) + ' (saved)', v);
  const nodes = [...new Set(links.flatMap((l) => [l.source, l.target]))].map((n) => ({ name: n }));
  return (
    <Card title={`Where the money goes in ${year} (${dollarsNote(real)})`} wide actions={
      <input type="range" min={plan.startYear} max={proj.years[proj.years.length - 1].year} value={year} onChange={(e) => setYear(Number(e.target.value))} />
    }>
      <div className="stats">
        <Stat label="Year" value={year} sub={plan.people.map((p) => `${p.name} ${y.ages[p.id]}`).join(', ')} />
        <Stat label="Spending" value={money(adj(y.spending ?? y.totalExpenses, i))} />
        <Stat label="Taxes" value={money(adj(y.taxes.total, i))} sub={`${pct(y.taxes.effectiveRate)} effective`} />
        <Stat label="Saved" value={money(adj(Object.values(y.contributions).reduce((t, v) => t + v, 0), i))} />
      </div>
      <Chart height={520} option={{
        tooltip: { trigger: 'item', valueFormatter: (v: number) => money(v) },
        series: [{ type: 'sankey', data: nodes, links, nodeGap: 14, left: 8, right: 210, top: 10, bottom: 10, emphasis: { focus: 'adjacency' }, lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.35 },
          // plain labels in the theme's text color (an outline blurred them), each with its amount, and room on the right for long names
          label: { color: dark ? '#e8eaf4' : '#1d2033', fontSize: 13, fontWeight: 500, textBorderWidth: 0, textShadowBlur: 0, lineHeight: 17,
            formatter: (p: { name: string; value: number }) => p.name + '\n{v|' + money(p.value) + '}', rich: { v: { color: dark ? '#9aa1bb' : '#6b7185', fontSize: 12, fontWeight: 400 } } } }],
      }} />
    </Card>
  );
}

export function TaxesPage() {
  const { proj, adj, real } = useProjection();
  const yrs = proj.years.map((y) => String(y.year));
  const s = (f: (t: (typeof proj.years)[0]['taxes']) => number) => proj.years.map((y, i) => Math.round(adj(f(y.taxes), i)));
  return (
    <>
      <Card title={`Taxes and health premiums by year (${dollarsNote(real)})`} wide>
        <Chart option={{
          tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'category', data: yrs }, yAxis: moneyAxis,
          series: [
            { name: 'Federal income', type: 'bar', stack: 't', data: s((t) => t.federal) },
            { name: 'Capital gains', type: 'bar', stack: 't', data: s((t) => t.capitalGains) },
            { name: 'NIIT', type: 'bar', stack: 't', data: s((t) => t.niit) },
            { name: 'State', type: 'bar', stack: 't', data: s((t) => t.state) },
            { name: 'Payroll (FICA)', type: 'bar', stack: 't', data: s((t) => t.fica) },
            { name: 'Early withdrawal penalty', type: 'bar', stack: 't', data: s((t) => t.penalty) },
            { name: 'AMT', type: 'bar', stack: 't', data: s((t) => t.amt ?? 0) },
            { name: 'Local', type: 'bar', stack: 't', data: s((t) => t.local ?? 0) },
            { name: 'Foreign, net of the US credit', type: 'bar', stack: 't', data: s((t) => (t.foreign ?? 0) - (t.foreignCredit ?? 0)) },
            { name: 'Medicare premiums', type: 'bar', stack: 't', data: s((t) => t.medicare) },
            { name: 'Credits (negative)', type: 'bar', stack: 'c', data: s((t) => -(t.credits ?? 0)) },
            { name: 'ACA premiums', type: 'bar', stack: 't', data: s((t) => t.aca) },
          ],
        }} />
      </Card>
      <TaxYear />
      <TaxByItem />
      <NotableEvents />
      {proj.years.some((y) => y.taxes.withheld) && <Card title="Tax withheld and tax owed" wide>
        <Chart height={260} option={{
          tooltip: moneyTooltip, legend: {}, grid: { left: 70, right: 16, top: 40, bottom: 30 }, xAxis: { type: 'category', data: proj.years.map((y) => String(y.year)) }, yAxis: moneyAxis,
          series: [
            { name: 'Withheld', type: 'bar', data: proj.years.map((y, i) => Math.round(adj(y.taxes.withheld ?? 0, i))) },
            { name: 'Refund (+) or balance due (-)', type: 'line', data: proj.years.map((y, i) => Math.round(adj((y.taxes.withheld ?? 0) - y.taxes.total, i))) },
          ],
        }} />
      </Card>}
      <Card title="Tax rates" wide>
        <Chart height={300} option={{
          tooltip: { trigger: 'axis', valueFormatter: (v: number) => pct(v) }, legend: { top: 0 }, grid: { left: 60, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'category', data: yrs }, yAxis: { type: 'value', axisLabel: { formatter: (v: number) => pct(v, 0) } },
          series: [
            { name: 'Marginal federal bracket', type: 'line', step: 'end', data: proj.years.map((y) => y.taxes.marginalRate) },
            { name: 'Effective rate (all taxes)', type: 'line', data: proj.years.map((y) => +y.taxes.effectiveRate.toFixed(4)) },
          ],
        }} />
      </Card>
      <Card title="Roth conversions and required distributions" wide>
        <Chart height={300} option={{
          tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'category', data: yrs }, yAxis: moneyAxis,
          series: [
            { name: 'Roth conversion', type: 'bar', data: proj.years.map((y, i) => Math.round(adj(y.rothConversion, i))) },
            { name: 'Required minimum distribution', type: 'bar', data: proj.years.map((y, i) => Math.round(adj(y.rmd, i))) },
          ],
        }} />
      </Card>
    </>
  );
}

export function MonteCarloPage() {
  const plan = useProjection().plan;
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [metric, setMetric] = useState<McMetric>('liquid');
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    setTimeout(() => {
      setResult(runMonteCarlo(plan, settings.mcMethod, settings.mcTrials));
      setBusy(false);
    }, 20);
  };
  return (
    <>
      <Card title="Monte Carlo simulation" actions={<button onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run'}</button>}>
        <div className="grid">
          <Select label="Returns" value={settings.mcMethod} options={[['normal', 'Random, from your assumptions'], ['historicalBlocks', 'Random 5-year blocks of 1928–2025'], ['backtest', 'Every historical start year']]}
            onChange={(v) => setSettings({ mcMethod: v })} />
          {settings.mcMethod !== 'backtest' && <Num label="Trials" value={settings.mcTrials} onChange={(v) => setSettings({ mcTrials: Math.max(50, Math.min(10000, v)) })} />}
        </div>
      </Card>
      {result && <>
        <div className="stats">
          <Stat label="Chance of success" value={pct(result.successRate, 0)} sub={grade(result.successRate).label + ' · ' + result.trials + (result.method === 'backtest' ? ' start years' : ' trials')} tone={grade(result.successRate).tone === 'bad' ? 'bad' : 'good'} />
          <Stat label="Ending, median (today's $)" value={money(result.endingReal.p50, true)} />
          <Stat label="Ending, bad case (10th pct.)" value={money(result.endingReal.p10, true)} />
          <Stat label="Ending, good case (90th pct.)" value={money(result.endingReal.p90, true)} />
        </div>
        <Card title="Outcomes">
          <div className="budgetbar" role="img" aria-label="Outcomes of the trials">
            {result.outcomes.filter((o) => o.share > 0).map((o) => <span key={o.key} title={o.label + ': ' + pct(o.share, 0)} style={{ flex: o.share, background: o.success ? (o.key === 'clean' ? '#14b8a6' : '#5eead4') : o.key === 'early' ? '#f43f5e' : o.key === 'mid' ? '#fb923c' : '#f59e0b' }} />)}
          </div>
          <ul className="budgetlist">
            {result.outcomes.map((o) => <li key={o.key}><span>{o.label}</span><b>{pct(o.share, 0)}</b><em>{o.success ? 'success' : 'shortfall'}</em></li>)}
          </ul>
        </Card>
        <div className="row"><Select label="Show" value={metric} options={MC_METRICS} onChange={setMetric} /></div>
        <Card title={(MC_METRICS.find((m) => m[0] === metric)?.[1] ?? '') + " across trials (today's dollars)"} wide>
          <Chart height={400} option={{
            tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
            xAxis: { type: 'category', data: result.metricBands[metric].map((b) => String(b.year)) }, yAxis: moneyAxis,
            series: [
              { name: '10th', type: 'line', stack: 'b', symbol: 'none', lineStyle: { opacity: 0 }, data: result.metricBands[metric].map((b) => Math.round(b.p10)) },
              { name: '10th–90th', type: 'line', stack: 'b', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { opacity: 0.15 }, data: result.metricBands[metric].map((b) => Math.round(b.p90 - b.p10)) },
              { name: '25th', type: 'line', symbol: 'none', lineStyle: { type: 'dashed' }, data: result.metricBands[metric].map((b) => Math.round(b.p25)) },
              { name: 'Median', type: 'line', symbol: 'none', lineStyle: { width: 3 }, data: result.metricBands[metric].map((b) => Math.round(b.p50)) },
              { name: '75th', type: 'line', symbol: 'none', lineStyle: { type: 'dashed' }, data: result.metricBands[metric].map((b) => Math.round(b.p75)) },
            ],
          }} />
        </Card>
        <Card title="Share of trials with money left" wide>
          <Chart height={260} option={{
            tooltip: { trigger: 'axis', valueFormatter: (v: number) => pct(v, 0) }, grid: { left: 60, right: 20, top: 20, bottom: 30 },
            xAxis: { type: 'category', data: result.survival.map((s) => String(s.year)) }, yAxis: { type: 'value', min: 0, max: 1, axisLabel: { formatter: (v: number) => pct(v, 0) } },
            series: [{ type: 'line', areaStyle: { opacity: 0.2 }, data: result.survival.map((s) => s.share) }],
          }} />
        </Card>
        {result.starts && <Card title="Outcome by historical start year (today's dollars at the end)" wide>
          <Chart height={300} option={{
            tooltip: moneyTooltip, grid: { left: 70, right: 20, top: 20, bottom: 30 },
            xAxis: { type: 'category', data: result.starts.map((s) => String(s.start)) }, yAxis: moneyAxis,
            series: [{ type: 'bar', data: result.starts.map((s) => ({ value: Math.round(s.endingReal), itemStyle: { color: s.success ? '#10b981' : '#ef4444' } })) }],
          }} />
        </Card>}
      </>}
          </>
  );
}

export function ComparePage() {
  const plans = useStore((s) => s.plans);
  const chosenIds = useStore((s) => s.compareIds);
  const mainId = useStore((s) => s.settings.mainPlanId);
  const activeId = useStore((s) => s.activeId);
  // Nothing chosen yet: the main plan beside the open one.
  const compareIds = useMemo(() => (chosenIds.length ? chosenIds : [...new Set([mainId, activeId].filter((x): x is string => !!x))]), [chosenIds, mainId, activeId]);
  const setCompare = useStore((s) => s.setCompare);
  const real = useStore((s) => s.settings.realDollars);
  const chosen = plans.filter((p) => compareIds.includes(p.id));
  const runs = useMemo(() => chosen.map((p) => ({ plan: p, ...projectPlan(p) })), [chosen]);
  const years = [...new Set(runs.flatMap((r) => r.proj.years.map((y) => y.year)))].sort();
  return (
    <>
      <Card title="Plans to compare">
        {plans.map((p) => (
          <label key={p.id} className="check">
            <input type="checkbox" checked={compareIds.includes(p.id)} onChange={(e) => setCompare(e.target.checked ? [...compareIds, p.id] : compareIds.filter((x) => x !== p.id))} />
            {p.id === mainId ? '★ ' : ''}{p.name}
          </label>
        ))}
      </Card>
      {runs.length > 0 && <>
        <Card title={`Net worth (${dollarsNote(real)})`} wide>
          <Chart option={{
            tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
            xAxis: { type: 'category', data: years.map(String) }, yAxis: moneyAxis,
            series: runs.map((r) => ({ name: r.plan.name, type: 'line', symbol: 'none', data: years.map((y) => {
              const i = r.proj.years.findIndex((x) => x.year === y);
              return i < 0 ? null : Math.round(real ? r.proj.years[i].netWorth / r.d[i] : r.proj.years[i].netWorth);
            }) })),
          }} />
        </Card>
        <Card title="Side by side" wide>
          <table>
            <thead><tr><th></th>{runs.map((r) => <th key={r.plan.id}>{r.plan.name}</th>)}</tr></thead>
            <tbody>
              <tr><td>Financial independence</td>{runs.map((r) => <td key={r.plan.id}>{r.proj.financialIndependenceYear ?? '—'}</td>)}</tr>
              <tr><td>Money runs out</td>{runs.map((r) => <td key={r.plan.id}>{r.proj.depletionYear ?? 'Never'}</td>)}</tr>
              <tr><td>Ending net worth (today's $)</td>{runs.map((r) => <td key={r.plan.id}>{money(r.proj.endingNetWorthReal)}</td>)}</tr>
              <tr><td>Lifetime taxes (today's $)</td>{runs.map((r) => <td key={r.plan.id}>{money(r.proj.years.reduce((t, y, i) => t + y.taxes.total / r.d[i], 0))}</td>)}</tr>
            </tbody>
          </table>
        </Card>
      </>}
    </>
  );
}

export function ProgressPage() {
  const { plan, proj } = useProjection();
  const snapshots = useStore((s) => s.snapshots);
  const addSnapshot = useStore((s) => s.addSnapshot);
  const deleteSnapshot = useStore((s) => s.deleteSnapshot);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(plan.accounts.map((a) => [a.id, a.balance])));
  const importCsv = (file: File) => file.text().then((text) => {
    const byDate: Record<string, Record<string, number>> = {};
    let n = 0, unknown = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cells.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue;
      const balance = Number(cells.slice(2).join('').replace(/[$\s]/g, ''));
      const acc = plan.accounts.find((a) => a.name.toLowerCase() === cells[1].toLowerCase());
      if (!acc || !isFinite(balance)) { unknown.add(cells[1]); continue; }
      (byDate[cells[0]] ??= {})[acc.id] = balance;
      n++;
    }
    for (const [d, balances] of Object.entries(byDate)) addSnapshot({ id: uid(), date: d, balances });
    alert(`Imported ${n} balances on ${Object.keys(byDate).length} dates.` + (unknown.size ? ` Not matched: ${[...unknown].join(', ')}.` : ''));
  });
  const total = (s: Snapshot) => Object.entries(s.balances).reduce((t, [id, v]) => t + (plan.accounts.find((a) => a.id === id)?.kind === 'debt' ? -v : v), 0);
  return (
    <>
      <Card title="Record today's balances">
        <div className="grid">
          <label className="field"><span>Date</span><div className="input"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></label>
          {plan.accounts.map((a) => <Num key={a.id} label={a.name} value={vals[a.id]} onChange={(v) => setVals({ ...vals, [a.id]: v })} />)}
        </div>
        <div className="row">
          <button onClick={() => addSnapshot({ id: uid(), date, balances: vals })}>Save snapshot</button>
          <label className="button ghost" style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line)', boxShadow: 'none' }}>
            Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          </label>
        </div>
      </Card>
      <Card title="Actual net worth against the plan (nominal dollars)" wide>
        <Chart option={{
          tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'time' }, yAxis: moneyAxis,
          series: [
            { name: 'Plan', type: 'line', symbol: 'none', data: proj.years.slice(0, 15).map((y) => [`${y.year}-01-01`, Math.round(y.netWorth)]) },
            { name: 'Actual', type: 'line', data: snapshots.map((s) => [s.date, Math.round(total(s))]) },
          ],
        }} />
        <table>
          <thead><tr><th>Date</th><th>Net worth</th><th></th></tr></thead>
          <tbody>{snapshots.map((s) => <tr key={s.id}><td>{s.date}</td><td>{money(total(s))}</td><td><button className="ghost danger" onClick={() => deleteSnapshot(s.id)}>Delete</button></td></tr>)}</tbody>
        </table>
      </Card>
    </>
  );
}

export function TablePage() {
  const { plan, proj, adj, real } = useProjection();
  const rows = proj.years.map((y, i) => ({
    Year: y.year,
    ...Object.fromEntries(plan.people.map((p) => [`Age ${p.name}`, y.ages[p.id]])),
    Income: adj(Object.values(y.income).reduce((t, v) => t + v, 0), i),
    'Social Security': adj(y.socialSecurity, i),
    Spending: adj(y.totalExpenses, i),
    Taxes: adj(y.taxes.total, i),
    Withdrawals: adj(Object.values(y.withdrawals).reduce((t, v) => t + v, 0), i),
    'Roth conversion': adj(y.rothConversion, i),
    RMD: adj(y.rmd, i),
    'Investment return': adj(y.investmentReturn, i),
    Investments: adj(y.liquidNetWorth, i),
    'Net worth': adj(y.netWorth, i),
  }));
  const cols = Object.keys(rows[0] ?? {});
  const csv = () => {
    const text = [cols.join(','), ...rows.map((r) => cols.map((c) => Math.round(Number((r as Record<string, number>)[c]))).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = `${plan.name}.csv`;
    a.click();
  };
  return (
    <Card title={`Year by year (${dollarsNote(real)})`} wide actions={<><button onClick={csv}>Download CSV</button><button className="ghost" onClick={() => window.print()}>Print or save as PDF</button></>}>
      <div className="scroll">
        <table className="num">
          <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.Year}>{cols.map((c) => {
              const v = (r as Record<string, number>)[c];
              return <td key={c}>{c === 'Year' || c.startsWith('Age') ? v : money(v)}</td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  );
}

export function FirePage() {
  const { plan, proj } = useProjection();
  const f = fireMetrics(plan, proj);
  const age = (y: number | null) => (y === null ? 'Not within the plan' : `${y} (age ${y - plan.people[0].birthYear})`);
  const bar = (label: string, target: number, year: number | null) => {
    const share = Math.min(1, f.investedToday / target);
    return (
      <div style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><b>{label}: {money(target, true)}</b><span className="muted">reached {age(year)}</span></div>
        <div style={{ height: 10, borderRadius: 6, background: 'var(--line)', overflow: 'hidden', marginTop: 6 }}>
          <div style={{ width: `${share * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
        </div>
        <div className="muted" style={{ marginTop: 4 }}>{pct(share, 0)} of the way today</div>
      </div>
    );
  };
  return (
    <>
      <div className="stats">
        <Stat icon="fire" label="FI number" value={money(f.fiNumber, true)} sub={`${money(f.retirementSpending, true)} a year at ${pct(plan.strategy.safeWithdrawalRate, 1)}`} />
        <Stat icon="coins" label="Invested today" value={money(f.investedToday, true)} />
        <Stat icon="flag" label="Coast FI number" value={money(f.coastFiNumber, true)} sub={f.coastReached ? 'reached: no more saving needed' : 'not yet reached'} tone={f.coastReached ? 'good' : undefined} />
        <Stat icon="trend" label="Financial independence" value={f.fiYear ?? 'Not reached'} sub={f.fiYear ? `age ${f.fiYear - plan.people[0].birthYear}` : undefined} tone={f.fiYear ? 'good' : 'bad'} />
      </div>
      <Card title="Progress to each FIRE target (today's dollars)">
        {bar('Lean FI', f.leanFiNumber, f.leanFiYear)}
        {bar('FI', f.fiNumber, f.fiYear)}
        {bar('Fat FI', f.fatFiNumber, f.fatFiYear)}
        {bar('Coast FI', f.coastFiNumber, f.coastReached ? plan.startYear : null)}
      </Card>
    </>
  );
}

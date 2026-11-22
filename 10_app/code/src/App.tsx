import { useEffect, useState } from 'react';
import { AccountsPage, AssumptionsPage, ExpensesPage, IncomePage, MilestonesPage, PeoplePage, StrategyPage } from './pages/Editors';
import { CashFlowPage, ComparePage, Dashboard, MonteCarloPage, NetWorthChart, ProgressPage, TablePage, TaxesPage } from './pages/Analysis';
import { useActivePlan, useStore } from './store';
import { Card, Check, Select } from './ui';
import { examplePlan } from './engine/defaults';

const PAGES = {
  dashboard: ['Dashboard', Dashboard],
  people: ['People and plan', PeoplePage],
  accounts: ['Accounts', AccountsPage],
  income: ['Income', IncomePage],
  expenses: ['Expenses', ExpensesPage],
  milestones: ['Milestones', MilestonesPage],
  strategy: ['Strategy', StrategyPage],
  assumptions: ['Assumptions', AssumptionsPage],
  networth: ['Net worth', NetWorthChart],
  cashflow: ['Cash flow', CashFlowPage],
  taxes: ['Taxes', TaxesPage],
  montecarlo: ['Monte Carlo', MonteCarloPage],
  compare: ['Compare plans', ComparePage],
  progress: ['Progress', ProgressPage],
  table: ['Year table', TablePage],
  settings: ['Settings and data', SettingsPage],
} as const;
type PageKey = keyof typeof PAGES;
const GROUPS: [string, PageKey[]][] = [
  ['', ['dashboard']],
  ['Your plan', ['people', 'accounts', 'income', 'expenses', 'milestones', 'strategy', 'assumptions']],
  ['Results', ['networth', 'cashflow', 'taxes', 'montecarlo', 'compare', 'table']],
  ['Tracking', ['progress', 'settings']],
];

export default function App() {
  const [page, setPage] = useState<PageKey>(() => (location.hash.slice(1) as PageKey) in PAGES ? (location.hash.slice(1) as PageKey) : 'dashboard');
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { location.hash = page; }, [page]);
  const [title, Page] = PAGES[page];
  return (
    <div className="app">
      <nav>
        <div className="brand">Horizon</div>
        <PlanMenu />
        {GROUPS.map(([g, keys]) => (
          <div key={g} className="group">
            {g && <div className="glabel">{g}</div>}
            {keys.map((k) => <a key={k} className={k === page ? 'on' : ''} onClick={() => setPage(k)}>{PAGES[k][0]}</a>)}
          </div>
        ))}
      </nav>
      <main>
        <h2>{title}</h2>
        <Page />
      </main>
    </div>
  );
}

function PlanMenu() {
  const plans = useStore((s) => s.plans);
  const plan = useActivePlan();
  const { setActive, addPlan, duplicatePlan, deletePlan } = useStore.getState();
  return (
    <div className="planmenu">
      <select value={plan.id} onChange={(e) => setActive(e.target.value)}>
        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className="row">
        <button className="ghost" onClick={() => addPlan()}>New</button>
        <button className="ghost" onClick={() => duplicatePlan(plan.id)}>Copy</button>
        <button className="ghost danger" onClick={() => { if (confirm(`Delete "${plan.name}"?`)) deletePlan(plan.id); }}>Delete</button>
      </div>
    </div>
  );
}

function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const exportAll = () => {
    const { plans, snapshots, settings } = useStore.getState();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ plans, snapshots, settings }, null, 1)], { type: 'application/json' }));
    a.download = `horizon-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importAll = (file: File) => file.text().then((t) => {
    const data = JSON.parse(t);
    if (!Array.isArray(data.plans) || data.plans.length === 0) throw new Error('No plans in this file');
    useStore.getState().importAll(data);
  }).catch((e) => alert('Could not import: ' + e.message));
  return (
    <>
      <Card title="Display">
        <div className="grid">
          <Check label="Show amounts in today's dollars" value={settings.realDollars} onChange={(v) => setSettings({ realDollars: v })} />
          <Select label="Theme" value={settings.theme} options={[['light', 'Light'], ['dark', 'Dark']]} onChange={(v) => setSettings({ theme: v })} />
        </div>
      </Card>
      <Card title="Your data">
        <p className="muted">Everything stays in this browser's storage; nothing is sent anywhere. Export a file to keep a backup or to move to another device.</p>
        <div className="row">
          <button onClick={exportAll}>Export all</button>
          <label className="button">Import<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} /></label>
          <button className="danger" onClick={() => { if (confirm('Replace every plan and snapshot with the example plan?')) useStore.getState().importAll({ plans: [examplePlan()], snapshots: [], settings }); }}>Reset</button>
        </div>
      </Card>
      <Card title="What the model covers">
        <p className="muted">2026 federal brackets, standard deduction, long-term capital gains and qualified dividends stacked on ordinary income, the 3.8% net investment income tax, FICA with the wage base and Additional Medicare Tax, taxation of Social Security benefits, 2026 state brackets for all states and DC, 401(k), IRA, and HSA limits with catch-up contributions, RMDs at 73 or 75, the 10% early withdrawal penalty, Social Security claiming adjustments and survivor benefits, and Roth conversions. Brackets and limits rise with the plan's inflation after 2026. Not modeled: itemized deductions, credits, the alternative minimum tax, local income taxes, Medicare premium surcharges (IRMAA), and state taxes on capital gains alone.</p>
      </Card>
    </>
  );
}

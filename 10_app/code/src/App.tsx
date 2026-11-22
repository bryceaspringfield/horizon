import { useEffect, useState } from 'react';
import { AccountsPage, AssumptionsPage, ExpensesPage, IncomePage, MilestonesPage, PeoplePage, StrategyPage } from './pages/Editors';
import { CashFlowPage, ComparePage, Dashboard, MonteCarloPage, NetWorthChart, ProgressPage, TablePage, TaxesPage } from './pages/Analysis';
import { useActivePlan, useStore } from './store';
import { Card, Check, Select } from './ui';
import { examplePlan } from './engine/defaults';
import { hasVault, lock, openExport, removePassword, sealExport, setPassword } from './vault';

/** The app's state as the store saves it. */
const snapshotOfState = () => JSON.stringify({ state: useStore.getState(), version: 0 });

function PasswordCard() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const protectedNow = hasVault();
  const save = async () => {
    if (pw.length < 8) return setMsg('Use at least 8 characters.');
    if (pw !== pw2) return setMsg('The two passwords differ.');
    await setPassword(pw, snapshotOfState());
    setPw(''); setPw2('');
    setMsg(protectedNow ? 'Password changed.' : 'Your plans are now encrypted with this password.');
  };
  return (
    <Card title="Password protection">
      <div className="lockbox">
        <p className="muted">{protectedNow
          ? 'On. Your plans are stored encrypted (AES-256-GCM, key from PBKDF2-SHA-256 with 600,000 iterations) and open only with your password. A lost password cannot be recovered; keep an encrypted backup.'
          : 'Off. Set a password to store your plans encrypted on this device and ask for the password each time the app opens.'}</p>
        <label className="field"><span>{protectedNow ? 'New password' : 'Password'}</span><div className="input"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div></label>
        <label className="field"><span>Repeat it</span><div className="input"><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div></label>
        {msg && <p className="muted">{msg}</p>}
        <div className="row">
          <button onClick={save}>{protectedNow ? 'Change password' : 'Protect with a password'}</button>
          {protectedNow && <button className="ghost" onClick={lock}>Lock now</button>}
          {protectedNow && <button className="ghost danger" onClick={() => { if (confirm('Store your plans unencrypted again?')) { removePassword(snapshotOfState()); setMsg('Protection removed.'); } }}>Remove password</button>}
        </div>
      </div>
    </Card>
  );
}

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
  const download = (text: string, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    a.click();
  };
  const day = new Date().toISOString().slice(0, 10);
  const exportAll = async (encrypted: boolean) => {
    const { plans, snapshots, settings } = useStore.getState();
    const text = JSON.stringify({ plans, snapshots, settings }, null, 1);
    if (!encrypted) return download(text, `horizon-${day}.json`);
    const pw = prompt('Password for this backup file (needed to import it):');
    if (!pw) return;
    download(await sealExport(pw, text), `horizon-${day}-encrypted.json`);
  };
  const importAll = (file: File) => file.text().then(async (t) => {
    let raw = t;
    if (t.includes('horizonEncryptedBackup')) {
      const pw = prompt('This backup is encrypted. Its password:');
      if (!pw) return;
      raw = await openExport(pw, t).catch(() => { throw new Error('wrong password'); });
    }
    const data = JSON.parse(raw);
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
      <PasswordCard />
      <Card title="Your data">
        <p className="muted">Everything stays in this browser's storage; nothing is sent anywhere. To use another device, export an encrypted backup and import it there.</p>
        <div className="row">
          <button onClick={() => exportAll(true)}>Export encrypted backup</button>
          <button className="ghost" onClick={() => exportAll(false)}>Export unencrypted</button>
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

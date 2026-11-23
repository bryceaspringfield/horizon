import { useEffect, useState } from 'react';
import { AccountsPage, AssumptionsPage, ExpensesPage, IncomePage, MilestonesPage, PeoplePage, StrategyPage, TaxHealthPage, EventsPage } from './pages/Editors';
import { TermsPage } from './pages/Terms';
import { Setup } from './pages/Setup';
import { ImportReportCard, ProjectionLabButton } from './pages/ImportPL';
import { PlanWarnings } from './pages/Warnings';
import { BudgetPage } from './pages/Budget';
import { CardsPage } from './pages/Cards';
import { SpendingPage } from './pages/Spending';
import { Icon } from './icons';
import { EstatePage, OptimizePage, PlotPage } from './pages/More';
import { ReportPage } from './pages/Report';
import { CashFlowPage, ComparePage, Dashboard, FirePage, MonteCarloPage, NetWorthChart, ProgressPage, TablePage, TaxesPage } from './pages/Analysis';
import { useActivePlan, useDark, useStore, useUndo } from './store';
import { Card, Check, Select, setAmountsHidden, setShownCurrency } from './ui';
import { planCurrency } from './engine/currency';
import { examplePlan } from './engine/defaults';
import { accountName, changePassword, deleteAccount, keepThisCopy, MODE_KEY, moveToDevice, moveToServer, onSyncStatus, signedIn, signOut, syncStatus, takeServerCopy, type SyncStatus } from './account';
import { install, installed, useInstallOffer } from './install';
import { hasVault, lock, openExport, removePassword, sealExport, setPassword } from './vault';

/** The app's state as the store saves it. */
const snapshotOfState = () => JSON.stringify({ state: useStore.getState(), version: 3 });

const SYNC_LABEL: Record<SyncStatus, string> = { saved: 'Saved', saving: 'Saving…', offline: 'Offline, will retry', conflict: 'Changed on another device', signedOut: 'Signed out' };

function useSync() {
  const [s, setS] = useState(syncStatus());
  useEffect(() => { const off = onSyncStatus(setS); return () => { off(); }; }, []);
  return s;
}

/** The account card: who is signed in, the password, signing out, and deleting the account. */
function AccountCard() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const sync = useSync();
  if (!signedIn()) return (
    <Card title="Account">
      <p className="muted">You use Horizon without an account; your plans stay on this device. With an account, they are encrypted in your browser and kept on Horizon's server, so you can sign in from any device.</p>
      <button onClick={() => { localStorage.removeItem(MODE_KEY); location.reload(); }}>Sign in or create an account</button>
    </Card>
  );
  const change = async () => {
    if (pw.length < 10) return setMsg('Use at least 10 characters.');
    if (pw !== pw2) return setMsg('The two passwords differ.');
    const err = await changePassword(pw);
    setPw(''); setPw2('');
    setMsg(err ?? 'Password changed; other devices are signed out.');
  };
  return (
    <Card title="Account" actions={<span className="badge"><Icon name="lock" size={13} />{SYNC_LABEL[sync]}</span>}>
      <div className="lockbox">
        <p className="muted">Signed in as <b>{accountName()}</b>. Your plans are encrypted in this browser (AES-256-GCM, a key from your password with PBKDF2-SHA-256 and 600,000 iterations) before they reach the server, which cannot read them. A lost password cannot be recovered; keep an encrypted backup.</p>
        <label className="field"><span>New password</span><div className="input"><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div></label>
        <label className="field"><span>Repeat it</span><div className="input"><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div></label>
        {msg && <p className="muted">{msg}</p>}
        <div className="row">
          <button onClick={change}>Change password</button>
          <button className="ghost" onClick={signOut}>Sign out</button>
          <button className="ghost danger" onClick={async () => { const p = prompt('Delete the account and its plans on the server? Enter your password to confirm.'); if (p) setMsg((await deleteAccount(p)) ?? ''); }}>Delete account</button>
        </div>
      </div>
    </Card>
  );
}

/** Where the plans are saved, and the switch between this device and Horizon's server. */
function StorageCard() {
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [remove, setRemove] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<string | null>) => { setBusy(true); setMsg((await f()) ?? ''); setBusy(false); };
  if (signedIn()) return (
    <Card title="Where your plans are saved" actions={<span className="badge">Horizon's server</span>}>
      <div className="lockbox">
        <p className="muted">Your plans are saved encrypted on Horizon's server, under the account <b>{accountName()}</b>. You can move them to this device alone: they are downloaded into this browser's storage, and this device signs out.</p>
        <Check label="Also delete the account and its copy on the server" value={remove} onChange={setRemove} />
        {remove && <label className="field"><span>Your password, to confirm the deletion</span><div className="input"><input type="password" name="movepw" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div></label>}
        {msg && <p className="error">{msg}</p>}
        <div className="row"><button disabled={busy || (remove && !pw)} onClick={() => run(() => moveToDevice(remove ? pw : null))}>Move my plans to this device only</button></div>
      </div>
    </Card>
  );
  const toServer = () => {
    if (!user) return setMsg('Choose a username.');
    if (pw.length < 10) return setMsg('Use a password of at least 10 characters.');
    if (pw !== pw2) return setMsg('The passwords differ.');
    run(() => moveToServer(user, pw, false, snapshotOfState()));
  };
  return (
    <Card title="Where your plans are saved" actions={<span className="badge">This device only</span>}>
      <div className="lockbox">
        <p className="muted">Your plans are saved in this browser's storage, and nothing is sent anywhere. You can move them to Horizon's server: they are encrypted in this browser with a key made from your password, and you can then sign in from any device. The server cannot read them, and a lost password cannot be recovered.</p>
        <label className="field"><span>Username</span><div className="input"><input name="moveuser" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} /></div></label>
        <label className="field"><span>Password</span><div className="input"><input type="password" name="movepw" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div></label>
        <label className="field"><span>Password again</span><div className="input"><input type="password" name="movepw2" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div></label>
        {msg && <p className="error">{msg}</p>}
        <div className="row">
          <button disabled={busy} onClick={toServer}>Move my plans to Horizon's server</button>
          <button className="ghost" onClick={() => { localStorage.removeItem(MODE_KEY); location.reload(); }}>Sign in to an existing account</button>
        </div>
      </div>
    </Card>
  );
}

/** Installing Horizon as an app on this device. */
function InstallCard() {
  const offer = useInstallOffer();
  if (installed()) return (
    <Card title="Install Horizon" actions={<span className="badge">Installed</span>}>
      <p className="muted">Horizon runs as an installed app on this device, and it opens with no connection. Plans saved on Horizon's server sync when the connection returns.</p>
    </Card>
  );
  return (
    <Card title="Install Horizon">
      <p className="muted">Horizon installs as an app on Windows, macOS, Linux, Android, iPhone, and iPad. The installed app has an icon and a window of its own, and it opens with no connection.</p>
      {offer && <div className="row"><button onClick={install}>Install Horizon on this device</button></div>}
      <ul className="muted small">
        <li>Chrome or Edge on Windows, macOS, and Linux: the install icon at the right end of the address bar, or the browser menu, then "Install Horizon".</li>
        <li>Android (Chrome): the browser menu, then "Add to Home screen" or "Install app".</li>
        <li>iPhone and iPad (Safari): the Share button, then "Add to Home Screen".</li>
        <li>macOS (Safari): the File menu, then "Add to Dock".</li>
      </ul>
    </Card>
  );
}

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
    <Card title="Password protection" actions={<span className={'badge' + (protectedNow ? '' : ' off')}><Icon name="lock" size={13} />{protectedNow ? 'On' : 'Off'}</span>}>
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
  budget: ['Budget', BudgetPage],
  cards: ['Card finder', CardsPage],
  spending: ['Spending log', SpendingPage],
  events: ['Life events', EventsPage],
  milestones: ['Milestones', MilestonesPage],
  strategy: ['Strategy', StrategyPage],
  taxhealth: ['Taxes and health', TaxHealthPage],
  assumptions: ['Assumptions', AssumptionsPage],
  networth: ['Net worth', () => <NetWorthChart />],
  cashflow: ['Cash flow', CashFlowPage],
  taxes: ['Taxes', TaxesPage],
  montecarlo: ['Monte Carlo', MonteCarloPage],
  fire: ['FIRE metrics', FirePage],
  optimize: ['Optimizer', OptimizePage],
  estate: ['Estate', EstatePage],
  plot: ['Plot builder', PlotPage],
  compare: ['Compare plans', ComparePage],
  progress: ['Progress', ProgressPage],
  table: ['Year table', TablePage],
  report: ['Plan report', ReportPage],
  settings: ['Settings and data', SettingsPage],
  terms: ['Terms of Use', TermsPage],
} as const;
type PageKey = keyof typeof PAGES;

/** The app's base path: /horizon/ on GitHub Pages, / when served locally. */
const BASE = (() => {
  const b = import.meta.env.BASE_URL;
  if (b.startsWith('/')) return b.endsWith('/') ? b : b + '/';
  // A relative base (local builds): the folder the app was opened from.
  const keys = Object.keys(PAGES);
  const parts = location.pathname.split('/');
  if (keys.includes(parts[parts.length - 1])) parts.pop(); else parts[parts.length - 1] = '';
  return parts.join('/').replace(/\/index\.html$/, '/') || '/';
})();

function pageFromUrl(): PageKey {
  const hash = location.hash.slice(1);
  if (hash in PAGES) return hash as PageKey;
  const last = location.pathname.replace(/\/$/, '').split('/').pop() ?? '';
  return (last in PAGES ? last : 'dashboard') as PageKey;
}
const GROUPS: [string, PageKey[]][] = [
  ['', ['dashboard']],
  ['Your plan', ['people', 'accounts', 'income', 'expenses', 'budget', 'spending', 'cards', 'events', 'milestones', 'strategy', 'taxhealth', 'assumptions']],
  ['Results', ['networth', 'cashflow', 'taxes', 'montecarlo', 'fire', 'optimize', 'estate', 'compare', 'plot', 'table', 'report']],
  ['Tracking', ['progress', 'settings', 'terms']],
];

export default function App() {
  const [page, setPage] = useState<PageKey>(pageFromUrl);
  const dark = useDark();
  const sync = useSync();
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  // Addresses are paths under the app's base (/horizon/taxes); an old #taxes link is turned into its path.
  useEffect(() => {
    const want = BASE + (page === 'dashboard' ? '' : page);
    if (location.pathname !== want || location.hash) history.replaceState(null, '', want);
  }, []);
  useEffect(() => {
    const back = () => setPage(pageFromUrl());
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const [title, Page] = PAGES[page];
  const undo = useUndo();
  // Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y) outside a text field undo and redo plan edits; inside one, the browser's own undo applies.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); useStore.getState().undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); useStore.getState().redo(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const plan = useActivePlan();
  setShownCurrency(planCurrency(plan));
  setAmountsHidden(!!settings.hideAmounts);
  const [menu, setMenu] = useState(false);
  const go = (k: PageKey) => {
    history.pushState(null, '', BASE + (k === 'dashboard' ? '' : k));
    setPage(k); setMenu(false); window.scrollTo(0, 0);
  };
  if (!settings.setupDone) return <Setup />;
  return (
    <div className={'app' + (menu ? ' menu-open' : '')}>
      <div className="mobilebar">
        <button className="ghost icon" aria-label="Menu" onClick={() => setMenu(!menu)}><Icon name="menu" /></button>
        <div className="brand"><div className="logo"><Icon name="trend" size={15} /></div>Horizon</div>
        <span className="pill" onClick={() => setSettings({ theme: dark ? 'light' : 'dark' })}><Icon name={dark ? 'sun' : 'moon'} size={15} /></span>
      </div>
      <div className="scrim" onClick={() => setMenu(false)} />
      <nav>
        <div className="brand"><div className="logo"><Icon name="trend" size={17} /></div>Horizon</div>
        <PlanMenu />
        {GROUPS.map(([g, keys]) => (
          <div key={g} className="group">
            {g && <div className="glabel">{g}</div>}
            {keys.map((k) => (
              <a key={k} href={BASE + (k === 'dashboard' ? '' : k)} className={k === page ? 'on' : ''}
                onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); go(k); }}>
                <Icon name={k} />{PAGES[k][0]}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <main>
        <div className="topbar">
          <div>
            <h2>{title}</h2>
            <div className="sub">{plan.name} · {plan.people.map((p) => p.name).join(' and ')} · {plan.assumptions.state}</div>
          </div>
          <div className="row">
            <span className={'pill' + (undo.canUndo ? '' : ' off')} title="Undo the last edit (Ctrl+Z)" onClick={() => useStore.getState().undo()}>↶ Undo</span>
            <span className={'pill' + (undo.canRedo ? '' : ' off')} title="Redo (Ctrl+Shift+Z)" onClick={() => useStore.getState().redo()}>↷ Redo</span>
            <span className={'pill' + (settings.realDollars ? ' on' : '')} onClick={() => setSettings({ realDollars: !settings.realDollars })}>
              {planCurrency(plan) === 'USD' ? (settings.realDollars ? "Today's dollars" : 'Future dollars') : (settings.realDollars ? "Today's money" : 'Future money')}
            </span>
            {signedIn() ? <>
              <span className={'pill' + (sync === 'conflict' || sync === 'signedOut' ? ' warn' : '')} title="Sync with your account" onClick={() => go('settings')}>{SYNC_LABEL[sync]}</span>
              <span className="pill" onClick={signOut} title={'Signed in as ' + accountName()}><Icon name="lock" size={15} />Sign out</span>
            </> : <span className="pill" onClick={() => (hasVault() ? lock() : go('settings'))} title={hasVault() ? 'Lock the app now' : 'Protect your plans with a password'}>
              <Icon name="lock" size={15} />{hasVault() ? 'Lock' : 'Set a password'}
            </span>}
            <span className="pill" onClick={() => setSettings({ theme: dark ? 'light' : 'dark' })}>
              <Icon name={dark ? 'sun' : 'moon'} size={15} />
            </span>
          </div>
        </div>
        {sync === 'conflict' && (
          <section className="card tip">
            <Icon name="shield" size={20} />
            <div><b>Your plans changed on another device.</b> Keep the other device's copy, or replace it with this one.</div>
            <div className="row"><button onClick={takeServerCopy}>Use the other copy</button><button className="ghost" onClick={keepThisCopy}>Keep this copy</button></div>
          </section>
        )}
        {page === 'dashboard' && !signedIn() && !hasVault() && !settings.dismissedLockTip && (
          <section className="card tip">
            <Icon name="shield" size={20} />
            <div><b>Your plans are saved in this browser, unencrypted.</b> Set a password to encrypt them and ask for it each time Horizon opens.</div>
            <div className="row"><button onClick={() => go('settings')}>Set a password</button><button className="ghost" onClick={() => setSettings({ dismissedLockTip: true })}>Not now</button></div>
          </section>
        )}
        <ImportReportCard />
        {page === 'dashboard' && <PlanWarnings go={(k) => go(k as PageKey)} />}
        <Page />
      </main>
    </div>
  );
}

function PlanMenu() {
  const plans = useStore((s) => s.plans);
  const plan = useActivePlan();
  const mainId = useStore((s) => s.settings.mainPlanId);
  const { setActive, addPlan, duplicatePlan, deletePlan, setMain } = useStore.getState();
  return (
    <div className="planmenu">
      <select value={plan.id} onChange={(e) => setActive(e.target.value)}>
        {plans.map((p) => <option key={p.id} value={p.id}>{p.id === mainId ? '★ ' : ''}{p.name}</option>)}
      </select>
      <div className="row">
        <button className="ghost" disabled={plan.id === mainId} title="The plan Horizon opens on and compares others against"
          onClick={() => setMain(plan.id)}>{plan.id === mainId ? '★ Main' : '☆ Main'}</button>
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
          <Check label="Hide amounts (dots in place of every figure)" value={!!settings.hideAmounts} onChange={(v) => setSettings({ hideAmounts: v })} />
          <Select label="Theme" value={settings.theme} options={[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(v) => setSettings({ theme: v })} />
        </div>
      </Card>
      <StorageCard />
      {signedIn() && <AccountCard />}
      {!signedIn() && <PasswordCard />}
      <InstallCard />
      <Card title="Your data">
        <p className="muted">{signedIn() ? 'A backup file is your own copy of every plan, apart from the server\'s. Keep one in case the password is lost.' : 'Everything stays in this browser\'s storage; nothing is sent anywhere. To use another device, export an encrypted backup and import it there, or move your plans to Horizon\'s server above.'}</p>
        <div className="row">
          <button onClick={() => exportAll(true)}>Export encrypted backup</button>
          <button className="ghost" onClick={() => exportAll(false)}>Export unencrypted</button>
          <label className="button">Import<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} /></label>
          <ProjectionLabButton ghost />
          <button className="ghost" onClick={() => { if (confirm('Run the setup again? The plan it builds replaces every plan here. Export a backup first to keep them.')) setSettings({ setupDone: false }); }}>Run the setup again</button>
          <button className="danger" onClick={() => { if (confirm('Replace every plan and snapshot with the example plan?')) useStore.getState().importAll({ plans: [examplePlan()], snapshots: [], settings }); }}>Reset</button>
        </div>
      </Card>
    </>
  );
}

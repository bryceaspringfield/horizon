import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { deviceDark, useStore } from './store';
import { erase, hasVault, PLAIN_KEY, setPassword, unlock, unlockRemembered } from './vault';
import { MODE_KEY, resume, signIn, signUp } from './account';
import { Icon } from './icons';
import { Terms, TERMS_DATE, TERMS_KEY } from './pages/Terms';
import './install';
import './styles.css';

/** The sign-in screen (an account on Horizon's server, or this device only), the local vault's lock, then the app. */
function Gate() {
  const [state, setState] = useState<'checking' | 'account' | 'locked' | 'open'>('checking');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  // a new account starts empty unless its owner chooses to bring the plans saved on this device
  const [bring, setBring] = useState(false);
  const [terms, setTerms] = useState(false);
  // Where a new user's plans are saved: Horizon's server (an account) or this device alone.
  const [where, setWhere] = useState<'server' | 'device'>('server');
  const onDevice = mode === 'signup' && where === 'device';
  const enter = async () => {
    await useStore.persist.rehydrate();
    useStore.getState().openMain();
    setState('open');
  };
  const local = async () => {
    localStorage.setItem(MODE_KEY, 'local');
    if (!hasVault() || (await unlockRemembered())) await enter();
    else setState('locked');
  };
  useEffect(() => {
    (async () => {
      if (await resume()) await enter();
      else if (localStorage.getItem(MODE_KEY) === 'local') await local();
      else setState('account');
    })();
  }, []);
  if (state === 'open') return <App />;
  if (state === 'checking') return null;
  const submitLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    if (await unlock(pw, remember)) await enter();
    else setError('Wrong password.');
    setBusy(false);
  };
  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && !agree) return setError('Accept the Terms of Use to create an account.');
    if (onDevice) {
      if (pw && pw.length < 8) return setError('Use a password of at least 8 characters, or leave both fields empty.');
      if (pw !== pw2) return setError('The passwords differ.');
      if (hasVault()) return setError('This device already holds password-protected plans. Under Sign in, choose "Use without an account" to open them.');
      setBusy(true);
      localStorage.setItem(TERMS_KEY, TERMS_DATE);
      localStorage.setItem(MODE_KEY, 'local');
      await useStore.persist.rehydrate();
      if (pw) await setPassword(pw, JSON.stringify({ state: useStore.getState(), version: 3 }));
      setBusy(false);
      return enter();
    }
    if (mode === 'signup' && pw.length < 10) return setError('Use a password of at least 10 characters.');
    if (mode === 'signup' && pw !== pw2) return setError('The passwords differ.');
    setBusy(true);
    const err = mode === 'signin' ? await signIn(user, pw, remember) : await signUp(user, pw, remember, bring ? localStorage.getItem(PLAIN_KEY) : null);
    setBusy(false);
    if (err) return setError(err);
    if (mode === 'signup') localStorage.setItem(TERMS_KEY, TERMS_DATE);
    await enter();
  };
  const termsLink = <button type="button" className="link" onClick={() => setTerms(true)}>Terms of Use</button>;
  if (terms) return (
    <div className="login">
      <div className="card termscard">
        <div className="brand"><div className="logo"><Icon name="lock" size={16} /></div>Horizon: Terms of Use</div>
        <Terms />
        <button type="button" onClick={() => setTerms(false)}>Back</button>
      </div>
    </div>
  );
  if (state === 'account') return (
    <div className="login">
      <form onSubmit={submitAccount} className="card">
        <div className="brand"><div className="logo"><Icon name="lock" size={16} /></div>Horizon</div>
        <div className="tabs">
          <button type="button" className={mode === 'signin' ? 'on' : 'ghost'} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
          <button type="button" className={mode === 'signup' ? 'on' : 'ghost'} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
        </div>
        {mode === 'signup' && <fieldset className="where">
          <legend>Where to save your plans</legend>
          <label className="check"><input type="radio" name="where" value="server" checked={where === 'server'} onChange={() => setWhere('server')} /><span><b>On Horizon's server</b>, encrypted, to sign in from any device</span></label>
          <label className="check"><input type="radio" name="where" value="device" checked={where === 'device'} onChange={() => setWhere('device')} /><span><b>On this device only</b>, with nothing sent anywhere</span></label>
          <p className="muted small">Settings lets you change this choice later.</p>
        </fieldset>}
        <p className="muted">{onDevice
          ? 'Your plans stay in this browser\'s storage. A password is optional: with one, the plans are encrypted on this device and the password is asked each time Horizon opens. A lost password cannot be recovered.'
          : 'Your plans are encrypted in this browser with a key made from your password, then stored on Horizon\'s server, which cannot read them. Without the password they cannot be recovered.'}</p>
        {!onDevice && <label className="field"><span>Username</span><div className="input"><input name="username" autoComplete="username" autoFocus value={user} onChange={(e) => setUser(e.target.value)} /></div></label>}
        <label className="field"><span>{onDevice ? 'Password (optional)' : 'Password'}</span><div className="input"><input name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></div></label>
        {mode === 'signup' && <label className="field"><span>Password again</span><div className="input"><input name="password2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div></label>}
        {!onDevice && <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Stay signed in on this device</label>}
        {mode === 'signup' && !onDevice && !!localStorage.getItem(PLAIN_KEY) && <label className="check"><input type="checkbox" name="bring" checked={bring} onChange={(e) => setBring(e.target.checked)} /><span>Bring the plans saved on this device (otherwise the account starts empty)</span></label>}
        {mode === 'signup' && <label className="check"><input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I have read and accept the {termsLink}. Horizon gives no financial, investment, tax, or legal advice.</span></label>}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || (onDevice ? !agree : !user || !pw || (mode === 'signup' && !agree))}>{busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : onDevice ? 'Start on this device' : 'Create account'}</button>
        {mode === 'signin' && <button type="button" className="ghost" onClick={local}>Use without an account, on this device only</button>}
        <p className="muted small">Horizon is an educational calculator, and it gives no financial advice. Using it, with or without an account, means you accept the {termsLink}.</p>
      </form>
    </div>
  );
  return (
    <div className="login">
      <form onSubmit={submitLocal} className="card">
        <div className="brand"><div className="logo"><Icon name="lock" size={16} /></div>Horizon</div>
        <p className="muted">Your plans are encrypted on this device. Enter your password to open them.</p>
        <label className="field"><span>Password</span><div className="input"><input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></div></label>
        <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember this device</label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !pw}>{busy ? 'Opening…' : 'Open'}</button>
        <button type="button" className="ghost danger" onClick={() => { if (confirm('Forgot the password? The encrypted plans cannot be recovered without it. Erase them and start over?')) erase(); }}>Forgot password</button>
        <button type="button" className="ghost" onClick={() => { localStorage.removeItem(MODE_KEY); setState('account'); }}>Sign in to an account instead</button>
      </form>
    </div>
  );
}

// Before the plans load, the sign-in screen follows the device's light or dark setting.
document.documentElement.dataset.theme = deviceDark() ? 'dark' : 'light';
createRoot(document.getElementById('root')!).render(<StrictMode><Gate /></StrictMode>);

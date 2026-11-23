import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import { erase, hasVault, PLAIN_KEY, unlock, unlockRemembered } from './vault';
import { MODE_KEY, resume, signIn, signUp } from './account';
import { Icon } from './icons';
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
    if (mode === 'signup' && pw.length < 10) return setError('Use a password of at least 10 characters.');
    if (mode === 'signup' && pw !== pw2) return setError('The passwords differ.');
    setBusy(true);
    const err = mode === 'signin' ? await signIn(user, pw, remember) : await signUp(user, pw, remember, localStorage.getItem(PLAIN_KEY));
    setBusy(false);
    if (err) setError(err);
    else await enter();
  };
  if (state === 'account') return (
    <div className="login">
      <form onSubmit={submitAccount} className="card">
        <div className="brand"><div className="logo"><Icon name="lock" size={16} /></div>Horizon</div>
        <div className="tabs">
          <button type="button" className={mode === 'signin' ? 'on' : 'ghost'} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
          <button type="button" className={mode === 'signup' ? 'on' : 'ghost'} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
        </div>
        <p className="muted">Your plans are encrypted in this browser with a key made from your password, then stored on Horizon's server, which cannot read them. Without the password they cannot be recovered.</p>
        <label className="field"><span>Username</span><div className="input"><input name="username" autoComplete="username" autoFocus value={user} onChange={(e) => setUser(e.target.value)} /></div></label>
        <label className="field"><span>Password</span><div className="input"><input name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></div></label>
        {mode === 'signup' && <label className="field"><span>Password again</span><div className="input"><input name="password2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div></label>}
        <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Stay signed in on this device</label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !user || !pw}>{busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="ghost" onClick={local}>Use without an account, on this device only</button>
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

createRoot(document.getElementById('root')!).render(<StrictMode><Gate /></StrictMode>);

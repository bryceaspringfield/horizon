import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import { erase, hasVault, unlock, unlockRemembered } from './vault';
import './styles.css';

/** The login screen while a password-protected vault is locked; the app once it opens. */
function Gate() {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const enter = async () => {
    await useStore.persist.rehydrate();
    setState('open');
  };
  useEffect(() => {
    (async () => {
      if (!hasVault() || (await unlockRemembered())) await enter();
      else setState('locked');
    })();
  }, []);
  if (state === 'open') return <App />;
  if (state === 'checking') return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    if (await unlock(pw, remember)) await enter();
    else setError('Wrong password.');
    setBusy(false);
  };
  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <div className="brand">Horizon</div>
        <p className="muted">Your plans are encrypted on this device. Enter your password to open them.</p>
        <label className="field"><span>Password</span><div className="input"><input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} /></div></label>
        <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember this device</label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !pw}>{busy ? 'Opening…' : 'Open'}</button>
        <button type="button" className="ghost danger" onClick={() => { if (confirm('Forgot the password? The encrypted plans cannot be recovered without it. Erase them and start over?')) erase(); }}>Forgot password</button>
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Gate /></StrictMode>);

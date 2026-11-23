// Installing Horizon as an app (Windows, macOS, Linux, Android, iOS): the browser's own install prompt where one exists
// (Chrome, Edge, and other Chromium browsers), kept here until the Settings page offers it, and the service worker
// (written by vite.config.ts) which keeps the app's files for use with no connection.
import { useSyncExternalStore } from 'react';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let offer: InstallEvent | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); offer = e as InstallEvent; tell(); });
  window.addEventListener('appinstalled', () => { offer = null; tell(); });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => { navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}); });
  }
}

/** Whether Horizon runs as an installed app now. */
export const installed = () => typeof matchMedia === 'function' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
/** Whether the browser offers its install prompt now (followed live). */
export const useInstallOffer = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => offer !== null, () => false);
export async function install(): Promise<boolean> {
  if (!offer) return false;
  await offer.prompt();
  const ok = (await offer.userChoice).outcome === 'accepted';
  offer = null; tell();
  return ok;
}

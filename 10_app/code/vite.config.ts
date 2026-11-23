import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The service worker (dist/sw.js), written after each build with the list of the build's files: installed, Horizon opens
// and works with no connection. Pages load from the network first and from the saved copy when offline; the build's
// hashed files load from the saved copy. A new build has a new list, which replaces the old copy.
function serviceWorker(): Plugin {
  let out = 'dist';
  return {
    name: 'horizon-service-worker',
    apply: 'build',
    configResolved(c) { out = c.build.outDir; },
    closeBundle() {
      const walk = (d: string, rel = ''): string[] => readdirSync(join(d, rel), { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? walk(d, rel + e.name + '/') : [rel + e.name]));
      const files = walk(out).filter((f) => f !== 'sw.js' && f !== '404.html' && f !== 'index.html');
      const version = files.filter((f) => f.startsWith('assets/')).sort().join('|');
      let h = 0;
      for (const c of version) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      writeFileSync(join(out, 'sw.js'), `const CACHE = 'horizon-${h.toString(36)}';
const FILES = ${JSON.stringify(['./', ...files])};
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => (r.ok ? r : caches.match('./', { cacheName: CACHE }).then((m) => m || r))).catch(() => caches.match('./', { cacheName: CACHE })));
    return;
  }
  e.respondWith(caches.match(e.request, { cacheName: CACHE }).then((m) => m || fetch(e.request)));
});
`);
    },
  };
}

// base: the GitHub Pages path the site is served under (https://<user>.github.io/<repo>/).
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react(), serviceWorker()],
  resolve: { preserveSymlinks: false },
  test: { environment: 'node' },
});

#!/usr/bin/env python3
import functools
import http.server
import json
import os
import sys
import threading

from playwright.sync_api import sync_playwright

H = '/home/baspring/projects/independent/horizon'
DIST = os.path.join(H, '10_app', 'code', 'dist')


def main():
    class SPA(http.server.SimpleHTTPRequestHandler):
        def send_head(self):
            if not os.path.exists(self.translate_path(self.path.split('?')[0])):
                self.path = '/index.html'
            return super().send_head()
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SPA, directory=DIST))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/'
    bad = 0
    def step(name, ok, note=''):
        nonlocal bad
        bad += not ok
        print('PASS' if ok else 'FAIL', name, f'({note})' if note else '', flush=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context()
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.add_init_script("localStorage.getItem('horizon-mode') || localStorage.setItem('horizon-mode', 'local')")
        pg.goto(url); pg.click('button:has-text("explore an example plan")'); pg.wait_for_selector('nav')
        href = pg.get_attribute('link[rel=manifest]', 'href')
        man = json.load(open(os.path.join(DIST, href.lstrip('/'))))
        icons = man.get('icons', [])
        have = all(os.path.exists(os.path.join(DIST, i['src'])) for i in icons)
        step('manifest with a name, a start URL, and icons', bool(man.get('name')) and man.get('start_url') == '.' and man.get('display') == 'standalone' and have
             and {'192x192', '512x512'} <= {i['sizes'] for i in icons} and any(i.get('purpose') == 'maskable' for i in icons), f'{len(icons)} icons')
        saved = pg.evaluate("""async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 40; i++) {
            const ks = await caches.keys(); if (ks.length) { const n = (await (await caches.open(ks[0])).keys()).length; if (n > 3) return n; }
            await new Promise(r => setTimeout(r, 250)); } return 0; }""")
        files = sum(len(f) for _, _, f in os.walk(DIST)) - 3
        step('the service worker saves every file of the build', saved == files + 1, f'{saved} saved, {files + 1} expected')
        pg.goto(url + 'people'); pg.wait_for_selector('nav'); pg.wait_for_timeout(500)
        name = pg.locator('label.field:has-text("Plan name") input').input_value()
        ctx.set_offline(True)
        pg.goto(url + 'accounts'); pg.wait_for_selector('nav', timeout=15000); pg.wait_for_timeout(800)
        rows = pg.locator('main input').count()
        pg.goto(url + 'settings'); pg.wait_for_selector('h3:has-text("Install Horizon")', timeout=15000)
        pg.goto(url + 'people'); pg.wait_for_selector('nav')
        same = pg.locator('label.field:has-text("Plan name") input').input_value() == name
        step('with no connection the app reopens, plan and Install card included', rows > 0 and same and not errors, f'{rows} inputs on Accounts; plan kept {same}; errors {errors[:2]}')
        b.close()
    print('ALL_OK' if not bad else f'{bad} FAILED')
    sys.exit(1 if bad else 0)


main()

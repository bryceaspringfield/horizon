#!/usr/bin/env python3
import functools
import http.server
import json
import os
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

H = '/home/baspring/projects/independent/horizon'
DIST = os.path.join(H, '10_app', 'code', 'dist')
SAMPLE = os.path.join(H, '99_overall', 'input', 'projectionlab', 'sample_export.json')


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
        pg = b.new_page(viewport={'width': 1440, 'height': 1000})
        errors, alerts = [], []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('dialog', lambda d: (alerts.append(d.message), d.accept()))
        pg.add_init_script("localStorage.getItem('horizon-mode') || localStorage.setItem('horizon-mode', 'local')")
        pg.goto(url); pg.wait_for_selector('text=Welcome to Horizon')
        pg.set_input_files('input[name=projectionlab]', SAMPLE)
        pg.wait_for_selector('nav'); pg.wait_for_timeout(1200)
        card = pg.locator('section.importreport').inner_text()
        sub = pg.locator('.topbar .sub').inner_text()
        step('the setup imports a ProjectionLab file and shows the report', 'Base case' in sub and 'Sam and Lee' in sub and 'CO' in sub and '2 plans' in card
             and 'Mortgage payment' in card, sub + ' | ' + card.split('\n')[1][:120])
        stats = pg.locator('main').inner_text()
        pg.goto(url + 'accounts'); pg.wait_for_selector('nav'); pg.wait_for_timeout(800)
        names = pg.eval_on_selector_all('main input', 'xs => xs.map(x => x.value)')
        pg.goto(url + 'income'); pg.wait_for_selector('nav'); pg.wait_for_timeout(800)
        inc = pg.eval_on_selector_all('main input', 'xs => xs.map(x => x.value)')
        step('accounts and incomes show, and the dashboard computes', all(n in names for n in ('Emergency fund', 'Work 401k', 'House: loan')) and 'Sam salary' in inc
             and 'Net worth today' in stats and 'NaN' not in stats and not errors, f'{len(names)} account fields; errors {errors[:2]}')
        pg.goto(url + 'settings'); pg.wait_for_selector('nav'); pg.wait_for_timeout(800)
        pg.set_input_files('input[name=projectionlab]', SAMPLE); pg.wait_for_timeout(1200)
        plans = pg.evaluate("JSON.parse(localStorage.getItem('horizon-v1')).state.plans.map(p => p.name)")
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'plans': [{'id': 'x', 'name': 'A Horizon backup'}], 'snapshots': []}, f)
        pg.set_input_files('input[name=projectionlab]', f.name); pg.wait_for_timeout(800)
        os.unlink(f.name)
        step('a second import adds plans, and another kind of file is refused', plans == ['Base case', 'Retire early'] * 2 and any('no ProjectionLab export' in a for a in alerts) and not errors,
             f'{plans}; alerts {alerts[:1]}')
        b.close()
    print('ALL_OK' if not bad else f'{bad} FAILED')
    sys.exit(1 if bad else 0)


main()

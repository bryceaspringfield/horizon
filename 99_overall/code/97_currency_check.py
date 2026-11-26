#!/usr/bin/env python3
import functools
import http.server
import os
import re
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
        pg = b.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.add_init_script("localStorage.getItem('horizon-mode') || localStorage.setItem('horizon-mode', 'local')")
        pg.goto(url); pg.click('button:has-text("explore an example plan")'); pg.wait_for_selector('nav')
        worth = lambda: pg.locator('.stat:has(.label:has-text("Net worth today")) .value').inner_text()
        usd = worth()
        pg.goto(url + 'assumptions'); pg.wait_for_selector('nav'); pg.wait_for_timeout(600)
        pg.locator('.field:has(span:has-text("Plan currency")) .ddbtn').click(); pg.locator('.ddlist [data-value="NOK"]').click(); pg.wait_for_timeout(600)
        pg.goto(url); pg.wait_for_selector('nav'); pg.wait_for_timeout(1000)
        text = ' '.join(pg.locator('main .stat .value, main .stat .sub').all_inner_texts())
        nok = worth()
        step('the plan currency relabels every amount', usd.startswith('$') and 'kr' in nok and '$' not in text and re.sub(r'\D', '', usd) == re.sub(r'\D', '', nok),
             f'{usd} then {nok}; "Today\'s money" pill {"Today" in pg.locator(".topbar").inner_text()}')
        pg.evaluate("""() => { const s = JSON.parse(localStorage.getItem('horizon-v1')); const p = s.state.plans[0];
            p.accounts.find(a => a.id === 'a_roth').currency = 'EUR'; p.assumptions.fx = { EUR: { rate: 1, drift: 0 } }; localStorage.setItem('horizon-v1', JSON.stringify(s)); }""")
        pg.goto(url); pg.wait_for_selector('nav'); pg.wait_for_timeout(800)
        at1 = worth()
        pg.goto(url + 'assumptions'); pg.wait_for_selector('nav'); pg.wait_for_timeout(600)
        field = pg.locator('label.field:has-text("1 EUR in NOK today") input')
        had = field.count() == 1
        field.fill('11.5'); pg.wait_for_timeout(600)
        example = pg.locator('.field:has(> span:text-is("Example"))').inner_text()
        pg.goto(url); pg.wait_for_selector('nav'); pg.wait_for_timeout(800)
        at115 = worth()
        step('a euro account takes an exchange rate, and the rate moves the net worth', had and at1 == nok and at115 != at1 and '€1,000' in example and '11,500' in example,
             f'{at1} at a rate of 1, {at115} at 11.5; example: {example[8:60]!r}')
        pg.goto(url + 'accounts'); pg.wait_for_selector('nav'); pg.wait_for_timeout(600)
        for page in ('networth', 'cashflow', 'taxes', 'fire', 'estate', 'report', 'table'):
            pg.goto(url + page); pg.wait_for_selector('nav'); pg.wait_for_timeout(500)
        step('no page errors with a foreign currency', not errors, '; '.join(errors[:2]))
        b.close()
    print('ALL_OK' if not bad else f'{bad} FAILED')
    sys.exit(1 if bad else 0)


main()

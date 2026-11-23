#!/usr/bin/env python3
"""Checks Horizon's editing fixes in headless Chromium (Bryce, 2026-11-23): the People page adds people past two and opens
each new card, a number field holding 0 can be emptied with Backspace and retyped, and Cost basis has an info icon whose
bubble shows on hover. Prints PASS or FAIL a line and ALL_OK at the end.

  python3 99_overall/code/98_people_inputs_check.py
"""
import functools
import http.server
import os
import sys
import threading

from playwright.sync_api import sync_playwright

H = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(H, '10_app', 'code', 'dist')
fails = 0


def check(name, ok, detail=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({detail})' if detail else ''))
    fails += 0 if ok else 1


def main():
    class SPA(http.server.SimpleHTTPRequestHandler):
        # Unknown paths get index.html, as GitHub Pages serves 404.html (a copy of it).
        def send_head(self):
            path = self.translate_path(self.path.split('?')[0])
            if not os.path.exists(path):
                self.path = '/index.html'
            return super().send_head()
        def log_message(self, *a):
            pass
    handler = functools.partial(SPA, directory=DIST)

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/'
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.add_init_script("localStorage.setItem('horizon-mode', 'local')")  # this device only, not the account screen
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(url); pg.click('button:has-text("explore an example plan")'); pg.wait_for_selector('nav')  # the first-run setup: the example plan
        pg.goto(url + 'people'); pg.wait_for_timeout(1500)
        card = pg.locator('section.card:has(h3:has-text("People"))')
        n0 = card.locator('details.item').count()
        for _ in range(3):
            card.locator('button:has-text("+ Add")').click(); pg.wait_for_timeout(400)
        n1 = card.locator('details.item').count()
        check('the add button adds people past two', n1 == n0 + 3, f'{n0} then {n1}')
        check('a card just added is open', card.locator('details.item').last.evaluate('d => d.open'))
        box = pg.locator('main input[type=number]').first
        box.fill('0'); pg.wait_for_timeout(300)
        box.focus(); pg.keyboard.press('End'); pg.keyboard.press('Backspace'); pg.wait_for_timeout(300)
        check('Backspace empties a 0', box.input_value() == '', repr(box.input_value()))
        pg.keyboard.type('1987'); pg.wait_for_timeout(300)
        check('retyped number stays', box.input_value() == '1987', repr(box.input_value()))
        pg.goto(url + 'accounts'); pg.wait_for_timeout(1500)
        pg.evaluate("document.querySelectorAll('details.item').forEach(d => d.open = true)"); pg.wait_for_timeout(500)
        icon = pg.locator('label.field:has(> span:text-is("Cost basis")) .info').first
        icon.hover(); pg.wait_for_timeout(400)
        tip = icon.locator('.tip')
        check('Cost basis has an info icon whose bubble shows on hover', icon.count() == 1 and tip.evaluate('t => getComputedStyle(t).opacity') == '1',
              tip.inner_text()[:80] if icon.count() else 'no icon')
        pg.goto(url + 'people'); pg.wait_for_timeout(1500)
        box = pg.locator('main input[type=number]').first
        box.fill(''); pg.locator('main h3').first.click(); pg.wait_for_timeout(300)
        check('an emptied box shows 0 after leaving it', box.input_value() == '0', repr(box.input_value()))
        check('no page errors', not errors, '; '.join(errors)[:300])
        b.close()
    srv.shutdown()
    print('ALL_OK' if fails == 0 else f'{fails} FAILED')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

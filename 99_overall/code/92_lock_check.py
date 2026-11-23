#!/usr/bin/env python3
"""Checks the password protection of the built app in headless Chromium: renames the plan, sets a password, checks
that local storage then holds no readable plan text, reloads to the login screen, tries a wrong and then the right
password, checks the renamed plan opened, and checks "Remember this device" skips the login on the next load.
Prints PASS or FAIL a line and ALL_OK at the end.

  python3 99_overall/code/92_lock_check.py
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
        name = pg.locator('main input').first
        name.fill('Secret Plan Zeta'); pg.wait_for_timeout(500)
        pg.goto(url + 'settings'); pg.reload(); pg.wait_for_timeout(1500)
        pw = pg.locator('.lockbox input[type=password]')
        pw.nth(0).fill('correct horse 42'); pw.nth(1).fill('correct horse 42')
        pg.click('text=Protect with a password'); pg.wait_for_timeout(3000)
        store = pg.evaluate('JSON.stringify(Object.assign({}, localStorage))')
        check('storage holds a vault', 'horizon-vault' in store)
        check('no readable plan text in storage', 'Secret Plan Zeta' not in store and 'Living expenses' not in store)
        check('no plain copy left', '"horizon-v1"' not in store)
        pg.reload(); pg.wait_for_timeout(1500)
        check('login screen after reload', pg.locator('text=Enter your password').count() == 1)
        pg.fill('.login input[type=password]', 'wrong password'); pg.click('.login button[type=submit]')
        pg.wait_for_selector('text=Wrong password.', timeout=30000)
        check('wrong password refused', pg.locator('text=Wrong password.').count() == 1)
        pg.fill('.login input[type=password]', 'correct horse 42'); pg.check('.login input[type=checkbox]')
        pg.click('.login button[type=submit]'); pg.wait_for_selector('nav .brand', timeout=30000)
        check('right password opens the app', pg.locator('nav .brand').count() == 1)
        check('the plan survived', 'Secret Plan Zeta' in pg.inner_text('.planmenu select'))
        pg.goto(url); pg.reload(); pg.wait_for_timeout(3000)
        check('remembered device skips the login', pg.locator('nav .brand').count() == 1)
        pg.evaluate("localStorage.removeItem('horizon-key')"); pg.reload(); pg.wait_for_timeout(1500)
        check('without the remembered key, the login returns', pg.locator('text=Enter your password').count() == 1)
        check('no page errors', not errors, '; '.join(errors)[:300])
        b.close()
    srv.shutdown()
    print('ALL_OK' if fails == 0 else f'{fails} FAILED')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

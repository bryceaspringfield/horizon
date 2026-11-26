#!/usr/bin/env python3
import functools
import http.server
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

from playwright.sync_api import sync_playwright

H = '/home/baspring/projects/independent/horizon'
TOOLS = os.path.expanduser('~/.conda/envs/tools/bin')
ENV = {**os.environ, 'PATH': TOOLS + ':' + os.environ['PATH'], 'WRANGLER_SEND_METRICS': 'false'}
API = 'http://127.0.0.1:8787'
APP_PORT = 8765
NAME = 'Zanzibar retirement ' + str(int(time.time()))
results = []


def step(name, ok, note=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({note})' if note else ''), flush=True)


def wait_up(url, seconds=90):
    for _ in range(seconds):
        try:
            urllib.request.urlopen(urllib.request.Request(url + '/salt', data=b'{"username":"probe"}', method='POST',
                                                          headers={'Content-Type': 'application/json'}), timeout=3)
            return True
        except Exception:
            time.sleep(1)
    return False


def main():
    state = tempfile.mkdtemp(prefix='horizon_sync_')
    dist = tempfile.mkdtemp(prefix='horizon_dist_')
    server = subprocess.Popen(['npx', 'wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1', '--persist-to', state],
                              cwd=H + '/40_sync_server/code', env=ENV, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    try:
        build = subprocess.run(['npx', 'vite', 'build', '--outDir', dist, '--emptyOutDir'], cwd=H + '/10_app/code',
                               env={**ENV, 'VITE_SYNC_URL': API}, capture_output=True, text=True)
        if build.returncode != 0:
            print(build.stdout[-2000:], build.stderr[-2000:])
            sys.exit(1)

        class SPA(http.server.SimpleHTTPRequestHandler):
            def send_head(self):
                if not os.path.exists(self.translate_path(self.path)) or self.path.rstrip('/').count('.') == 0 and self.path != '/':
                    self.path = '/index.html'
                return super().send_head()

            def log_message(self, *a):
                pass

        srv = http.server.ThreadingHTTPServer(('127.0.0.1', APP_PORT), functools.partial(SPA, directory=dist))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        app = f'http://127.0.0.1:{APP_PORT}/'
        step('server starts', wait_up(API))

        with sync_playwright() as p:
            b = p.chromium.launch()
            errors = []

            def device():
                ctx = b.new_context()
                pg = ctx.new_page()
                pg.on('pageerror', lambda e: errors.append(str(e)))
                return pg

            def sign_in(pg, user, pw):
                pg.goto(app); pg.wait_for_selector('text=Create account')
                pg.fill('input[name=username]', user); pg.fill('input[name=password]', pw)
                pg.click('form button[type=submit]')
                pg.wait_for_timeout(6000)
                return pg.locator('nav').count() > 0, pg.locator('.login .error').all_inner_texts()

            a = device()
            a.goto(app); a.wait_for_selector('text=Create account')
            a.click('button:has-text("Create account")')
            a.fill('input[name=username]', 'tester'); a.fill('input[name=password]', 'correct horse battery')
            a.fill('input[name=password2]', 'correct horse battery')
            blocked = a.locator('form button[type=submit]').is_disabled()
            a.click('button.link:has-text("Terms of Use") >> nth=0')
            shown = a.locator('h4:has-text("No financial, investment, tax, or legal advice")').count() == 1
            a.click('button:has-text("Back")')
            kept = a.input_value('input[name=username]') == 'tester'
            a.check('input[name=agree]')
            step('the Terms of Use open, and an account needs them accepted', blocked and shown and kept
                 and not a.locator('form button[type=submit]').is_disabled(), f'blocked {blocked}, shown {shown}, form kept {kept}')
            a.click('form button[type=submit]')
            a.wait_for_selector('text=Welcome to Horizon', timeout=30000)
            a.click('button:has-text("explore an example plan")'); a.wait_for_selector('nav')
            a.goto(app + 'people'); a.wait_for_timeout(1500)
            a.locator('label.field:has-text("Plan name") input').fill(NAME)
            a.wait_for_timeout(4000)
            pill = a.locator('.topbar .pill').all_inner_texts()
            step('account created and the edit saved', any('Saved' in t for t in pill), ' | '.join(pill))

            theme = lambda pg: pg.evaluate('document.documentElement.dataset.theme')
            dk = b.new_context(color_scheme='dark').new_page()
            dk.goto(app); dk.wait_for_selector('text=Create account')
            at_gate = theme(dk)
            dk.click('button:has-text("Use without an account")'); dk.wait_for_selector('text=Welcome to Horizon', timeout=30000)
            dk.click('button:has-text("explore an example plan")'); dk.wait_for_selector('nav'); dk.wait_for_timeout(800)
            in_app = theme(dk)
            dk.emulate_media(color_scheme='light'); dk.wait_for_timeout(800)
            step('the Auto theme follows the device', at_gate == 'dark' and in_app == 'dark' and theme(dk) == 'light' and theme(a) == 'light',
                 f'dark device: {at_gate} at sign-in, {in_app} in the app, {theme(dk)} after the device turns light')

            c = device()
            ok, err = sign_in(c, 'tester', 'wrong password!!')
            step('wrong password refused', not ok and any('Wrong' in e for e in err), '; '.join(err))
            ok, err = sign_in(c, 'tester', 'correct horse battery')
            c.goto(app + 'people'); c.wait_for_timeout(2000)
            val = c.locator('label.field:has-text("Plan name") input').input_value() if ok else ''
            step('second device opens the plan', ok and val == NAME, val)

            blob = b''
            for root, _, files in os.walk(state):
                for f in files:
                    blob += open(os.path.join(root, f), 'rb').read()
            step('server stores only ciphertext', len(blob) > 0 and NAME.encode() not in blob and b'Living expenses' not in blob,
                 f'{len(blob)} bytes searched')

            c.locator('label.field:has-text("Plan name") input').fill(NAME + ' C'); c.wait_for_timeout(4000)
            a.locator('label.field:has-text("Plan name") input').fill(NAME + ' A'); a.wait_for_timeout(4000)
            step('a stale save is reported as a conflict', a.locator('text=Your plans changed on another device').count() == 1)
            a.click('button:has-text("Use the other copy")'); a.wait_for_timeout(5000)
            a.goto(app + 'people'); a.wait_for_timeout(2000)
            v = a.locator('label.field:has-text("Plan name") input').input_value()
            step('taking the other copy loads it', v == NAME + ' C', v)

            a.goto(app + 'settings'); a.wait_for_timeout(1500)
            card = a.locator('section.card:has(h3:has-text("Account"))')
            card.locator('input').nth(0).fill('a brand new passphrase'); card.locator('input').nth(1).fill('a brand new passphrase')
            card.locator('button:has-text("Change password")').click(); a.wait_for_timeout(5000)
            d = device()
            ok_old, _ = sign_in(d, 'tester', 'correct horse battery')
            e = device()
            ok_new, _ = sign_in(e, 'tester', 'a brand new passphrase')
            e.goto(app + 'people'); e.wait_for_timeout(2000)
            v = e.locator('label.field:has-text("Plan name") input').input_value() if ok_new else ''
            step('password change: the old fails, the new opens the plan', not ok_old and ok_new and v == NAME + ' C', v)

            e.goto(app + 'settings'); e.wait_for_timeout(1500)
            e.once('dialog', lambda dlg: dlg.accept('a brand new passphrase'))
            e.locator('button:has-text("Delete account")').click(); e.wait_for_timeout(5000)
            f = device()
            ok, err = sign_in(f, 'tester', 'a brand new passphrase')
            step('deleted account cannot sign in', not ok, '; '.join(err))

            ls = lambda pg, k: pg.evaluate("k => localStorage.getItem(k)", k)
            name_of = lambda pg: pg.locator('label.field:has-text("Plan name") input').input_value()
            g = device()
            g.goto(app); g.wait_for_selector('text=Create account')
            g.click('button:has-text("Create account")')
            g.check('input[name=where][value=device]')
            hidden = g.locator('input[name=username]').count() == 0
            g.check('input[name=agree]'); g.click('form button[type=submit]')
            g.wait_for_selector('text=Welcome to Horizon', timeout=30000)
            g.click('button:has-text("explore an example plan")'); g.wait_for_selector('nav')
            g.goto(app + 'people'); g.wait_for_timeout(1500)
            g.locator('label.field:has-text("Plan name") input').fill(NAME + ' G'); g.wait_for_timeout(1000)
            step('sign-up can save on this device only', hidden and ls(g, 'horizon-mode') == 'local' and ls(g, 'horizon-account') is None
                 and NAME in (ls(g, 'horizon-v1') or ''), f"username hidden {hidden}, mode {ls(g, 'horizon-mode')}")
            g.goto(app + 'settings'); g.wait_for_timeout(1500)
            g.fill('input[name=moveuser]', 'mover'); g.fill('input[name=movepw]', 'a long moving password'); g.fill('input[name=movepw2]', 'a long moving password')
            g.click('button:has-text("Move my plans to Horizon")'); g.wait_for_timeout(9000)
            h = device()
            ok, err = sign_in(h, 'mover', 'a long moving password')
            h.goto(app + 'people'); h.wait_for_timeout(2000)
            v = name_of(h) if ok else ''
            step('plans on a device move to the server', ok and v == NAME + ' G' and ls(g, 'horizon-v1') is None and ls(g, 'horizon-mode') == 'account',
                 f"{v}; device copy {ls(g, 'horizon-v1') is not None}; {'; '.join(err)}")
            g.goto(app + 'settings'); g.wait_for_timeout(2500)
            card = g.locator('section.card:has(h3:has-text("Where your plans are saved"))')
            card.locator('input[type=checkbox]').check(); g.fill('input[name=movepw]', 'a long moving password')
            g.click('button:has-text("Move my plans to this device only")'); g.wait_for_timeout(9000)
            g.goto(app + 'people'); g.wait_for_timeout(1500)
            v = name_of(g)
            i = device()
            ok2, _ = sign_in(i, 'mover', 'a long moving password')
            step('plans move back to the device, and the account is deleted', v == NAME + ' G' and ls(g, 'horizon-mode') == 'local' and not ok2,
                 f"{v}; mode {ls(g, 'horizon-mode')}; account still signs in {ok2}")
            step('no page errors', not errors, '; '.join(errors[:3]))
            b.close()
    finally:
        server.terminate()
        try:
            server.wait(10)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(state, ignore_errors=True)
        shutil.rmtree(dist, ignore_errors=True)
    print('ALL_OK' if all(results) else 'SOME_FAILED')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
import functools
import http.server
import os
import sys
import threading

from playwright.sync_api import sync_playwright

H = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(H, '10_app', 'code', 'dist')
OUT = os.path.join(H, '99_overall', 'output', 'pages')
PAGES = ['dashboard', 'people', 'accounts', 'income', 'expenses', 'events', 'milestones', 'strategy', 'taxhealth', 'assumptions', 'networth',
         'cashflow', 'taxes', 'montecarlo', 'fire', 'optimize', 'estate', 'compare', 'plot', 'progress', 'table', 'report', 'settings', 'terms',
         'history', 'budget', 'cards', 'spending', 'timeline', 'rentown', 'taxstrategy', 'flexspend', 'rothconv', 'drawdown', 'harvest']


def main():
    os.makedirs(OUT, exist_ok=True)
    class SPA(http.server.SimpleHTTPRequestHandler):
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
    bad = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1440, 'height': 1000})
        pg.add_init_script("localStorage.setItem('horizon-mode', 'local')")
        errors = []
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(url); pg.click('button:has-text("explore an example plan")'); pg.wait_for_selector('nav')
        for name in PAGES:
            errors.clear()
            pg.goto(f'{url}{name}')
            pg.reload()
            pg.wait_for_timeout(3500)
            if name == 'montecarlo':
                for method in ('normal', 'backtest'):
                    pg.locator('.field:has(span:has-text("Returns")) .ddbtn').click(); pg.locator(f'.ddlist [data-value="{method}"]').click()
                    pg.click('text=Run')
                    pg.wait_for_selector('text=Chance of success', timeout=60000)
                    pg.wait_for_timeout(800)
                    stats = pg.inner_text('.stats')
                    print(f'  monte carlo {method}: ' + ' | '.join(stats.split('\n')[:4]))
                    pg.screenshot(path=os.path.join(OUT, f'{name}_{method}.png'), full_page=True)
            if name == 'optimize':
                pg.click('text=Search'); pg.wait_for_selector('text=Best strategies', timeout=120000); pg.wait_for_timeout(500)
                print('  optimizer best: ' + pg.locator('main tbody tr').first.inner_text().replace(chr(9), ' | ')[:200])
            if name == 'compare':
                for box in pg.query_selector_all('main input[type=checkbox]'):
                    box.check()
                pg.wait_for_timeout(800)
            h3 = [t for t in pg.locator('main h3').all_inner_texts()]
            charts = pg.locator('main canvas').count()
            print(f'{name}: {len(errors)} errors, {charts} charts, cards: {"; ".join(h3)[:160]}')
            for e in errors[:5]:
                print('   ERROR', e[:300])
            bad += len(errors)
            pg.screenshot(path=os.path.join(OUT, f'{name}.png'), full_page=True)
        errors.clear()
        pg.goto(f'{url}people'); pg.wait_for_timeout(1500)
        pg.click('button:has-text("☆ Main")'); pg.wait_for_timeout(300)
        main_ok = pg.locator('button:has-text("★ Main")').count() == 1
        pg.goto(f'{url}strategy'); pg.wait_for_timeout(1500)
        card = pg.locator('section.card:has(h3:has-text("Scheduled transfers"))')
        card.locator('button:has-text("+ Add")').click(); pg.wait_for_timeout(500)
        transfer_ok = card.locator('details.item').count() == 1
        pg.goto(f'{url}assumptions'); pg.wait_for_timeout(1500)
        fld = pg.locator('.field:has(> span:text-is("Tax model"))').first; (fld.locator('.ddbtn').click() if fld.locator('.ddbtn').count() else None); fld.locator('[data-value="flat"]').click(); pg.wait_for_timeout(500)
        flat_ok = pg.locator('text=Flat rate').count() >= 1
        pg.goto(f'{url}report'); pg.wait_for_timeout(2500)
        report_ok = pg.locator('button:has-text("Print or save as PDF")').count() == 1 and pg.locator('text=Lifetime taxes').count() >= 1
        pg.emulate_media(media='print'); pg.screenshot(path=os.path.join(OUT, 'report_print.png'), full_page=True)
        nav_hidden = not pg.locator('nav').is_visible()
        pg.emulate_media(media='screen')
        print(f'features: main plan {main_ok}, transfer {transfer_ok}, flat tax {flat_ok}, report {report_ok}, print hides nav {nav_hidden}, errors {len(errors)}')
        for e in errors[:5]:
            print('   ERROR', e[:300])
        bad += len(errors) + sum(not x for x in (main_ok, transfer_ok, flat_ok, report_ok, nav_hidden))
        pg.goto(url); pg.wait_for_timeout(1500)
        hrefs = pg.eval_on_selector_all('nav a', 'as => as.map(a => a.getAttribute("href"))')
        hashed = [h for h in hrefs if not h or '#' in h]
        lockbtn = pg.locator('.topbar .pill:has-text("Set a password")').count()
        print(f'tab links: {len(hrefs)}, with # or empty: {len(hashed)}; e.g. {hrefs[1:4]}; lock button: {lockbtn}')
        bad += len(hashed) + (0 if lockbtn == 1 else 1)
        su = b.new_page()
        su.add_init_script("localStorage.setItem('horizon-mode', 'local')")
        serr = []
        su.on('pageerror', lambda e: serr.append(str(e)))
        su.goto(url); su.wait_for_selector('text=Welcome to Horizon')
        su.locator('label.field:has-text("first name") input').fill('Avery')
        su.locator('label.field:has-text("Age") input').fill('40')
        st = su.locator('.field:has(> span:text-is("State you live in"))')
        if st.count():
            st.locator('.ddbtn').click(); su.locator('.ddlist [data-value="MA"]').click()
        su.click('button:has-text("Next")')
        su.locator('label.field:has-text("Yearly salary") input').fill('95000')
        su.click('button:has-text("Next")')
        su.locator('label.field:has-text("Checking and savings") input').fill('15000')
        su.locator('label.field:has-text("401(k), 403(b)") input').fill('80000')
        su.click('button:has-text("Next")'); su.click('button:has-text("Back")'); su.click('button:has-text("Next")')
        su.click('button:has-text("Next")')
        su.locator('label.field:has-text("Yearly living expenses") input').fill('50000')
        su.click('button:has-text("Next")')
        summary = su.inner_text('.setupsummary')
        su.click('button:has-text("Create my plan")'); su.wait_for_selector('nav'); su.wait_for_timeout(1500)
        sub_line = su.inner_text('.topbar .sub')
        su.goto(f'{url}accounts'); su.wait_for_timeout(1500)
        acct = su.inner_text('main')
        su.reload(); su.wait_for_timeout(1500)
        kept = su.locator('nav').count() == 1 and su.locator('text=Welcome to Horizon').count() == 0
        ok = ('Age 40, salary $95,000' in summary and 'Avery' in sub_line and '80000' in su.content() and 'Brokerage' not in acct and kept and not serr)
        print(f"setup: summary has the answers: {'Age 40, salary $95,000' in summary}; plan for {sub_line!r}; no example accounts: {'Brokerage' not in acct}; kept after reload: {kept}; errors: {len(serr)}")
        bad += 0 if ok else 1
        ph = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        ph.add_init_script("localStorage.setItem('horizon-mode', 'local')")
        perr = []
        ph.on('pageerror', lambda e: perr.append(str(e)))
        wide = []
        ph.goto(url); ph.wait_for_selector('text=Welcome to Horizon')
        if ph.evaluate('document.documentElement.scrollWidth - window.innerWidth') > 2:
            wide.append('setup')
        ph.click('button:has-text("explore an example plan")'); ph.wait_for_selector('.mobilebar')
        for name in PAGES:
            ph.goto(f'{url}{name}'); ph.reload(); ph.wait_for_timeout(1500)
            over = ph.evaluate('document.documentElement.scrollWidth - window.innerWidth')
            if over > 2:
                wide.append(f'{name} (+{over}px)')
            if name in ('dashboard', 'accounts', 'cashflow', 'montecarlo', 'fire', 'events'):
                ph.screenshot(path=os.path.join(OUT, f'phone_{name}.png'), full_page=True)
        ph.goto(f'{url}'); ph.reload(); ph.wait_for_timeout(1500)
        ph.click('.mobilebar button'); ph.wait_for_timeout(500)
        ph.screenshot(path=os.path.join(OUT, 'phone_menu.png'))
        ph.click('nav a:has-text("Taxes and health")'); ph.wait_for_timeout(800)
        drawer_ok = 'Taxes and health' in ph.inner_text('main h2')
        print(f'phone: {len(perr)} errors; pages wider than the screen: {", ".join(wide) or "none"}; menu drawer leads to a page: {drawer_ok}')
        bad += len(perr) + len(wide) + (0 if drawer_ok else 1)
        print('dashboard stats:', pg.goto(f'{url}') and '', end='')
        pg.reload(); pg.wait_for_timeout(1200)
        print(' | '.join(pg.inner_text('.stats').split('\n')))
        b.close()
    srv.shutdown()
    print('ALL_OK' if bad == 0 else f'{bad} errors')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

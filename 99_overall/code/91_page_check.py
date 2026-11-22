#!/usr/bin/env python3
"""Opens every page of the built app (10_app/code/dist) in headless Chromium, prints each page's console errors and
headings, runs the Monte Carlo (normal and backtest), and saves a screenshot of each page in 99_overall/output/pages/.
Exit 1 when any page logs an error.

  python3 99_overall/code/91_page_check.py
"""
import functools
import http.server
import os
import sys
import threading

from playwright.sync_api import sync_playwright

H = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(H, '10_app', 'code', 'dist')
OUT = os.path.join(H, '99_overall', 'output', 'pages')
PAGES = ['dashboard', 'people', 'accounts', 'income', 'expenses', 'milestones', 'strategy', 'taxhealth', 'assumptions', 'networth',
         'cashflow', 'taxes', 'montecarlo', 'compare', 'progress', 'table', 'settings']


def main():
    os.makedirs(OUT, exist_ok=True)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIST)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/index.html'
    bad = 0
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        for name in PAGES:
            errors.clear()
            pg.goto(f'{url}#{name}')
            pg.reload()
            pg.wait_for_timeout(3500)
            if name == 'montecarlo':
                for method in ('normal', 'backtest'):
                    pg.select_option('main select', method)
                    pg.click('text=Run')
                    pg.wait_for_selector('text=Chance of success', timeout=60000)
                    pg.wait_for_timeout(800)
                    stats = pg.inner_text('.stats')
                    print(f'  monte carlo {method}: ' + ' | '.join(stats.split('\n')[:4]))
                    pg.screenshot(path=os.path.join(OUT, f'{name}_{method}.png'), full_page=True)
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
        print('dashboard stats:', pg.goto(f'{url}#dashboard') and '', end='')
        pg.reload(); pg.wait_for_timeout(1200)
        print(' | '.join(pg.inner_text('.stats').split('\n')))
        b.close()
    srv.shutdown()
    print('ALL_OK' if bad == 0 else f'{bad} errors')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

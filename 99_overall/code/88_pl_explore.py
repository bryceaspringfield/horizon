#!/usr/bin/env python3
"""Opens ProjectionLab in headless Chromium as a guest (Bryce, 2026-11-23: check its features in the app itself, since
not all are documented) and records each screen's visible text, buttons, and a screenshot in output/pl_explore/. With no
argument it records the first screen and any guest or demo entry; with page paths (e.g. /plan /chance) it visits them.

  python3 99_overall/code/88_pl_explore.py [path ...]
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

H = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(H, '99_overall', 'output', 'pl_explore')
os.makedirs(OUT, exist_ok=True)
START = 'https://app.projectionlab.com/'


def record(pg, name):
    pg.screenshot(path=os.path.join(OUT, name + '.png'), full_page=True)
    text = pg.inner_text('body')
    buttons = pg.eval_on_selector_all('button, a, [role=button], [role=tab]', 'els => els.map(e => (e.innerText || e.getAttribute("aria-label") || "").trim()).filter(Boolean)')
    open(os.path.join(OUT, name + '.json'), 'w').write(json.dumps({'url': pg.url, 'text': text, 'buttons': buttons}, indent=1))
    print(f'== {name} {pg.url}\n{text[:1500]}\nbuttons: {buttons[:60]}\n', flush=True)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1400, 'height': 900})
        pg = ctx.new_page()
        pg.goto(START, wait_until='networkidle', timeout=60000)
        pg.wait_for_timeout(3000)
        record(pg, '00_start')
        for word in ('guest', 'Guest', 'demo', 'Demo', 'Try', 'Sandbox', 'without an account'):
            loc = pg.locator(f'text={word}')
            if loc.count():
                try:
                    loc.first.click(timeout=5000)
                    pg.wait_for_timeout(6000)
                    record(pg, '01_after_' + word.replace(' ', '_'))
                    break
                except Exception as e:  # a match which is not clickable
                    print('no click on', word, str(e)[:80])
        for k, path in enumerate(sys.argv[1:]):
            pg.goto(START.rstrip('/') + path, wait_until='networkidle', timeout=60000)
            pg.wait_for_timeout(4000)
            record(pg, f'{k + 2:02d}_' + path.strip('/').replace('/', '_'))
        b.close()


if __name__ == '__main__':
    main()

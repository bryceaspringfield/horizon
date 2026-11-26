#!/usr/bin/env python3
import functools
import http.server
import os
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

H = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(H, '10_app', 'code', 'dist')
STATEMENT = """<html><body style="font: 12px monospace">
<p>Statement period 10/01/2026 to 10/31/2026</p>
<p>10/03 WHOLE FOODS MKT 84.12</p><p>10/07 SHELL OIL 40.00</p><p>10/12 NETFLIX.COM 15.49</p>
<p>10/20 PAYMENT THANK YOU (139.61)</p></body></html>"""


def main():
    class SPA(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript'}

        def send_head(self):
            if not os.path.exists(self.translate_path(self.path.split('?')[0])):
                self.path = '/index.html'
            return super().send_head()

        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SPA, directory=DIST))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/'
    pdf = os.path.join(tempfile.mkdtemp(), 'statement.pdf')
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.set_content(STATEMENT)
        pg.pdf(path=pdf)
        pg = b.new_page()
        pg.add_init_script("localStorage.setItem('horizon-mode', 'local')")
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(url)
        pg.click('button:has-text("explore an example plan")')
        pg.wait_for_selector('nav')
        pg.goto(url + 'spending')
        pg.set_input_files('input[type=file]', pdf)
        pg.wait_for_timeout(5000)
        body = pg.inner_text('main')
        b.close()
    msg = next((l for l in body.split('\n') if 'transactions added' in l or 'No transactions found' in l), '(no message)')
    print('message:', msg)
    print('errors:', errors or 'none')
    ok = msg.startswith('4 new transactions added') and not errors
    print('PDF_OK' if ok else 'PDF_FAIL')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()

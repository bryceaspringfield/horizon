#!/usr/bin/env python3
"""Writes the country order (20_tax_rules/output/country_order.csv, from 22_country_order.py) as one HTML page: a filter, sortable columns, each country's flag (flagcdn.com), the territories counted in
a country, and the order in which state and province taxes are added.

  python3 20_tax_rules/code/23_country_page.py OUT.html
"""
import csv
import html
import sys
import time

rows = list(csv.DictReader(open('/home/baspring/projects/independent/horizon/20_tax_rules/output/country_order.csv')))
ok = rows
by_users = {r['iso2']: i + 1 for i, r in enumerate(sorted([r for r in ok if r['internet_users'] != ''], key=lambda r: -int(r['internet_users'])))}
# a flat flag for a two-letter code from flagcdn.com (its w40 and w80 files; the 20x15 files are the waving style), cropped to 20 by 15; Artsakh's and Transnistria's from Wikimedia Commons (Flag_of_Artsakh.svg,
# Flag_of_Transnistria_(state).svg), as PNG files kept in the page's own folder
LOCAL_FLAG = {'X-ART': 'artsakh', 'X-TRN': 'transnistria'}
flag = lambda c: (f"<img class=f loading=lazy alt='' width=20 height=15 src='https://flagcdn.com/w40/{c.lower()}.png' srcset='https://flagcdn.com/w80/{c.lower()}.png 2x'>"
                  if len(c) == 2 else f"<img class=f loading=lazy alt='' width=20 height=15 style='object-fit:cover' src='{LOCAL_FLAG[c]}_40.png' srcset='{LOCAL_FLAG[c]}_80.png 2x'>")
nth = lambda v: '' if v == '' else v + ('th' if v[-2:] in ('11', '12', '13') else {'1': 'st', '2': 'nd', '3': 'rd'}.get(v[-1], 'th'))
import re, unicodedata
def norm(t):
    """Lower case, accents dropped, punctuation as spaces: the form the filter compares in."""
    t = ''.join(c for c in unicodedata.normalize('NFD', t) if not unicodedata.category(c).startswith('M')).lower()
    return re.sub(r'[\W_]+', ' ', t).strip()
def keys(r):
    """Every spelling of a row for the filter: each as typed with spaces and run together ("u s a" and "usa"), joined by bars."""
    names = [r['country'], r['iso2'] if len(r['iso2']) == 2 else ''] + r['aliases'].split('; ') + r['includes'].split('; ')
    spell = set()
    for x in names:
        v = norm(x)
        if not v: continue
        # Saint and St, with and without "and" and "the": every such form of a name is accepted
        vs = {v, re.sub(r'\bsaint\b', 'st', v), re.sub(r'\bst\b', 'saint', v)}
        vs |= {re.sub(r'\band\b', ' ', w) for w in vs}
        vs |= {re.sub(r'\bthe\b', ' ', w) for w in vs}
        spell |= {' '.join(w.split()) for w in vs}
    forms = dict.fromkeys(f for v in sorted(spell) for f in (v, v.replace(' ', '')))
    return '|' + '|'.join(forms) + '|'
n = lambda v: f'{int(v):,}' if v != '' else ''
TIER_ORDER = lambda b: next((i for i, t in enumerate(['the United States', 'ProjectionLab: full rules', 'ProjectionLab: tax estimates', 'ProjectionLab: preset', "Bryce's personal interest", 'Internet users']) if b.startswith(t)), 9)
TIER = {'the United States': 'a', 'ProjectionLab: full rules': 'b', 'ProjectionLab: tax estimates': 'c', 'ProjectionLab: preset': 'd', "Bryce's personal interest": 'e'}
def why(b):
    k = next((v for t, v in TIER.items() if b.startswith(t)), 'z')
    return f"<span class='tag t{k}'>{html.escape(b)}</span>"
def places(r):
    """The territories counted in the country and its regional choices as chips, and any other note as one short line."""
    chips = [x for x in r['includes'].split('; ') if x]
    rest = []
    for part in r['note'].split('; '):
        m = re.match(r'Regional choices(?: with settings of their own)?: (.*)', part)
        if not m:
            if part: rest.append(part)
            continue
        body = m.group(1)
        extra = re.search(r' \((.*)\)$', body)
        if extra: rest.append(extra.group(1)); body = body[:extra.start()]
        chips += body.split(', ')
    out = ''.join(f'<span class=chip>{html.escape(c)}</span>' for c in chips)
    return out + (f"<div class=note>{html.escape('; '.join(rest))}</div>" if rest else '')
tr = ''.join(
    f"<tr data-s='{keys(r)}'><td class=r>{r['order']}</td><td class='r m' data-v='{by_users.get(r['iso2'], 9999)}'>{by_users.get(r['iso2'], '')}</td>"
    f"<td class=c>{flag(r['iso2'])}{html.escape(r['country'])}</td><td class=m>{r['iso2'] if len(r['iso2']) == 2 else ''}</td>"
    f"<td data-v='{TIER_ORDER(r['basis'])}'>{why(r['basis'])}</td><td class=r data-v='{r['internet_users'] or 0}'>{n(r['internet_users'])}</td><td class='r m' data-v='{r['population'] or 0}'>{n(r['population'])}</td>"
    f"<td class=r data-v='{r['subnational_order'] or 9999}'>{nth(r['subnational_order'])}</td><td class=w>{places(r)}</td></tr>"
    for r in ok)
page = '''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Horizon: country order for tax systems</title>
<style>
:root{--bg:#f4f6fa;--panel:#fff;--line:#e3e8f0;--ink:#162033;--muted:#5d6b82;--accent:#3d5afe;--chip:#eef2f8;--hover:#f7f9fc}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--panel:#111a2c;--line:#1f2c44;--ink:#e8eefb;--muted:#93a7c9;--accent:#7aa2ff;--chip:#1a2740;--hover:#15213a}}
body{font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:var(--bg);color:var(--ink)}
main{max-width:1440px;margin:0 auto;padding:22px 18px 40px}h1{font-size:20px;margin:0 0 12px}
.bar{margin:0 0 12px}
input{font:inherit;padding:9px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink);width:min(380px,100%)}
.wrap{overflow:auto;max-height:calc(100vh - 130px);background:var(--panel);border:1px solid var(--line);border-radius:12px}
table{border-collapse:separate;border-spacing:0;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:9px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle;white-space:nowrap}
th{position:sticky;top:0;z-index:1;background:var(--panel);cursor:pointer;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);white-space:normal;vertical-align:bottom;line-height:1.25;user-select:none}
th:hover{color:var(--accent)}tbody tr:hover td{background:var(--hover)}tr:last-child td{border-bottom:0}
.r{text-align:right}.m{color:var(--muted)}.c{font-weight:600}
.f{vertical-align:-3px;margin-right:10px;border-radius:3px;box-shadow:0 0 0 1px var(--line);object-fit:cover}
.w{white-space:normal;min-width:280px;max-width:560px;padding-top:6px;padding-bottom:6px}
.chip{display:inline-block;margin:2px 5px 2px 0;padding:1px 9px;border-radius:999px;background:var(--chip);font-size:12px;white-space:nowrap}
.note{color:var(--muted);font-size:12px;margin-top:2px}
.tag{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:500;background:var(--chip)}
.ta{background:#3d5afe;color:#fff}.tb{background:#d9f2e3;color:#12683a}.tc{background:#dff0fb;color:#0b5c8a}.td{background:#efe6fb;color:#5a2ea6}.te{background:#fdecd2;color:#8a4b00}.tz{color:var(--muted)}
@media (prefers-color-scheme:dark){.tb{background:#123524;color:#8fe0b0}.tc{background:#10324a;color:#8fd0f5}.td{background:#2a1c4a;color:#c9aef7}.te{background:#3d2a0c;color:#f5c57a}}
</style></head><body><main>
<h1>Horizon: country order for tax systems</h1>
<div class="bar"><input id="q" type="search" placeholder="Find a country, by any name or spelling"></div>
<div class="wrap"><table id="t"><thead><tr><th class=r>Order</th><th class=r title="Rank by Internet users alone, with no country placed ahead">Rank by users</th><th>Country</th><th>Code</th><th>Why here</th><th class=r title="Population times the share using the Internet (World Bank; Taiwan from its own ministries)">Internet users</th><th class=r>Population</th><th class=r title="A place in line for building regional taxes, and no count of regions">Order for subnational tax</th><th title="Territories counted in the country, and its regional choices">Subnational choices</th></tr></thead><tbody>__ROWS__</tbody></table></div>
</main><script>
const tb = document.querySelector('#t tbody'), rows = [...tb.rows];
const norm = t => t.normalize('NFD').replace(/\\p{M}/gu, '').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
const rank = (s, v, c) => s.includes('|' + v + '|') || s.includes('|' + c + '|') ? 0 : s.includes('|' + v) || s.includes('|' + c) ? 1 : s.includes(v) || s.includes(c) ? 2 : 9;
document.getElementById('q').addEventListener('input', e => {
  const v = norm(e.target.value), c = v.replace(/ /g, '');
  for (const r of rows) { r._k = v === '' ? 0 : rank(r.dataset.s, v, c); r.hidden = r._k === 9; }
  [...rows].sort((a, b) => a._k - b._k || +a.cells[0].textContent - +b.cells[0].textContent).forEach(r => tb.appendChild(r));
});
const val = (r, i) => { const c = r.cells[i]; return c.dataset.v !== undefined ? +c.dataset.v : (isNaN(+c.textContent) || c.textContent === '' ? c.textContent : +c.textContent); };
const sortBy = (i, d) => { rows.sort((a, b) => { const x = val(a, i), y = val(b, i); return (x > y ? 1 : x < y ? -1 : 0) * d; }); rows.forEach(r => tb.appendChild(r)); };
let last = -1, dir = 1;
document.querySelectorAll('#t th').forEach((th, i) => th.addEventListener('click', () => { dir = last === i ? -dir : 1; last = i; sortBy(i, dir); }));
</script></body></html>'''
open(sys.argv[1], 'w').write(page.replace('__ROWS__', tr))
print(len(ok), 'rows')

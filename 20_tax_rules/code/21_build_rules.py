#!/usr/bin/env python3
import json
import os
import re
import sys

import openpyxl

STAGE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IN = os.path.join(STAGE, 'input')
OUT = os.path.join(STAGE, 'output')

ABBR = {
    'Ala.': 'AL', 'Alaska': 'AK', 'Ariz.': 'AZ', 'Ark.': 'AR', 'Calif.': 'CA', 'Colo.': 'CO', 'Conn.': 'CT',
    'Del.': 'DE', 'Fla.': 'FL', 'Ga.': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID', 'Ill.': 'IL', 'Ind.': 'IN', 'Iowa': 'IA',
    'Kans.': 'KS', 'Ky.': 'KY', 'La.': 'LA', 'Maine': 'ME', 'Md.': 'MD', 'Mass.': 'MA', 'Mich.': 'MI', 'Minn.': 'MN',
    'Miss.': 'MS', 'Mo.': 'MO', 'Mont.': 'MT', 'Nebr.': 'NE', 'Nev.': 'NV', 'N.H.': 'NH', 'N.J.': 'NJ', 'N.M.': 'NM',
    'N.Y.': 'NY', 'N.C.': 'NC', 'N.D.': 'ND', 'Ohio': 'OH', 'Okla.': 'OK', 'Ore.': 'OR', 'Pa.': 'PA', 'R.I.': 'RI',
    'S.C.': 'SC', 'S.D.': 'SD', 'Tenn.': 'TN', 'Tex.': 'TX', 'Utah': 'UT', 'Vt.': 'VT', 'Va.': 'VA', 'Wash.': 'WA',
    'W.Va.': 'WV', 'Wis.': 'WI', 'Wyo.': 'WY', 'D.C.': 'DC',
}


def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace('$', '').replace(',', '')
        if re.fullmatch(r'-?\d+(\.\d+)?', s):
            return float(s)
    return None


def state_of(label):
    if not isinstance(label, str):
        return None
    head = label.split('(')[0].strip().replace('\xa0', '')
    head = re.sub(r'\s+', ' ', head)
    return ABBR.get(head) or ABBR.get(head.replace(' ', ''))


def states():
    wb = openpyxl.load_workbook(os.path.join(IN, '2026-State-Individual-Income-Tax-Rates-Brackets.xlsx'), data_only=True)
    ws = wb['2026']
    out, cur = {}, None
    for row in ws.iter_rows(min_row=3, values_only=True):
        code = state_of(row[0])
        if code:
            cur = out.setdefault(code, {'brackets': {'single': [], 'mfj': []}, 'standardDeduction': {}, 'exemption': {}})
            sd_s, sd_c, ex_s, ex_c = num(row[7]), num(row[8]), num(row[9]), num(row[10])
            cur['standardDeduction'] = {'single': sd_s or 0, 'mfj': sd_c or 0}
            cur['exemption'] = {'single': ex_s or 0, 'mfj': ex_c or 0}
        if cur is None:
            continue
        for col, key in ((1, 'single'), (4, 'mfj')):
            rate, lo = num(row[col]), num(row[col + 2])
            if rate is not None and lo is not None:
                cur['brackets'][key].append([lo, rate])
        if row[0] is None and all(v in (None, '\xa0', '') for v in row[1:8]):
            continue
    out['WA'] = {'brackets': {'single': [], 'mfj': []}, 'standardDeduction': {}, 'exemption': {}}
    ss = json.load(open(os.path.join(IN, 'state_social_security.json')))
    for code in ABBR.values():
        r = out.setdefault(code, {'brackets': {'single': [], 'mfj': []}, 'standardDeduction': {}, 'exemption': {}})
        r['taxesSocialSecurity'] = code in ss['taxes']
        r['brackets']['hoh'] = r['brackets']['single']
        r['standardDeduction']['hoh'] = r['standardDeduction'].get('single', 0)
        r['exemption']['hoh'] = r['exemption'].get('single', 0)
        for k in ('single', 'mfj'):
            b = r['brackets'][k]
            assert all(b[i][0] < b[i + 1][0] for i in range(len(b) - 1)), (code, k, b)
            assert all(0 <= x[1] < 0.2 for x in b), (code, k, b)
    return out


def credit_table():
    text = open(os.path.join(IN, 'usc26-2011-2012.txt'), encoding='utf-8', errors='ignore').read()
    cells = re.findall(r'<td class="left">(.*?)</td>\s*<td class="right">(.*?)</td>', text, re.S)
    rows = [[0, 0, 0.0]]
    for left, right in cells:
        if '8/10ths of 1%' in right:
            rows.append([40000, 0, 0.008])
            continue
        start = int(re.findall(r'\$([\d,]+)', left)[0].replace(',', ''))
        base = int(re.match(r'\s*\$([\d,]+) plus', right).group(1).replace(',', ''))
        rate = float(re.search(r'plus ([\d.]+)%', right).group(1)) / 100
        rows.append([start, base, rate])
    assert len(rows) == 21 and rows[-1][:2] == [10040000, 1082800] and rows[-1][2] == 0.16, rows[-1]
    check_rows('2011', rows)
    return [[r[0], r[2]] for r in rows]


def check_rows(code, rows):
    for (a, base_a, rate_a), (b, base_b, _) in zip(rows, rows[1:]):
        want = base_a + rate_a * (b - a)
        assert abs(want - base_b) < 1, (code, b, base_b, want)


def main():
    os.makedirs(OUT, exist_ok=True)
    years = {}
    for name in sorted(os.listdir(IN)):
        if name.startswith('federal_') and name.endswith('.json'):
            fed = json.load(open(os.path.join(IN, name)))
            for status, b in fed['brackets'].items():
                assert [x[0] for x in b] == sorted(x[0] for x in b), (name, status)
            years[str(fed['year'])] = fed
    json.dump(years, open(os.path.join(OUT, 'federal.json'), 'w'), indent=1)
    health = json.load(open(os.path.join(IN, 'healthcare.json')))
    json.dump(health, open(os.path.join(OUT, 'healthcare.json'), 'w'), indent=1)
    death = json.load(open(os.path.join(IN, 'state_death_taxes.json')))
    death['credit2011'] = credit_table()
    for code, e in death['estate'].items():
        assert e['exemption'] > 0 and e['method'] in ('excess', 'whole', 'credit', 'ny', 'md', 'il'), code
        rows = e.get('rows')
        if rows:
            check_rows(code, rows)
            e['brackets'] = [[r[0], r[2]] for r in rows]
            del e['rows']
    json.dump(death, open(os.path.join(OUT, 'state_death_taxes.json'), 'w'), indent=1)
    print('federal years:', ' '.join(years))
    st = states()
    json.dump(st, open(os.path.join(OUT, 'states.json'), 'w'), indent=1, sort_keys=True)
    none = sorted(k for k, v in st.items() if not v['brackets']['single'])
    print(f'{len(st)} states; no wage tax: {" ".join(none)}')
    for code in ('CA', 'NY', 'MA', 'IL', 'NC'):
        print(code, st[code]['brackets']['single'][:3], '...', len(st[code]['brackets']['single']), 'brackets')


if __name__ == '__main__':
    sys.exit(main())

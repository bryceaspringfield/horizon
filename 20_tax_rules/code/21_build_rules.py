#!/usr/bin/env python3
"""Builds the tax rules the app reads, from this stage's input/:

  output/federal.json  every federal_YYYY.json as entered by hand (brackets, deductions, limits, RMD table), keyed by year
  output/healthcare.json  Medicare premiums and IRMAA, ACA applicable percentages and poverty lines, and the SALT cap
  output/states.json   2026 state income tax brackets, standard deductions, and personal exemptions from the Tax
                       Foundation's workbook (sheet "2026"), keyed by postal code, plus whether each state taxes
                       Social Security benefits (state_social_security.json)

A personal exemption the workbook states as a credit ("$29 credit") is left out; the error is at most a few hundred
dollars a year. Local income taxes (New York City, Ohio cities) are not modeled.

  python3 code/21_build_rules.py      (run from the stage folder, or by run_all.sh)
"""
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
    """A dollar amount or rate cell as a number, or None for 'n.a.', blanks, and credits."""
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
    # Washington's rates in the workbook (7%, 9% above $1 million) tax capital gains above a large exemption, not
    # wages, which Washington does not tax; the model leaves the capital gains tax out.
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


def main():
    os.makedirs(OUT, exist_ok=True)
    # Every federal_YYYY.json, keyed by year; the app uses the newest year at or before each plan year.
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
    for code, e in death['estate'].items():
        assert 0 <= e['low'] <= e['top'] <= 0.2 and e['exemption'] > 0, code
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

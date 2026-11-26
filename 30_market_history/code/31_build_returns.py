#!/usr/bin/env python3
import json
import os

import xlrd

STAGE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    b = xlrd.open_workbook(os.path.join(STAGE, 'input', 'histretSP.xls'))
    r = b.sheet_by_name('Returns by year')
    infl = b.sheet_by_name('Inflation Rate')
    cpi = {}
    for i in range(infl.nrows):
        y, v = infl.cell_value(i, 0), infl.cell_value(i, 2)
        if isinstance(y, float) and isinstance(v, float):
            cpi[int(y)] = v
    out = []
    for i in range(20, r.nrows):
        y = r.cell_value(i, 0)
        if not isinstance(y, float):
            break
        y = int(y)
        out.append({'year': y, 'stocks': r.cell_value(i, 1), 'bonds': r.cell_value(i, 4), 'cash': r.cell_value(i, 3),
                    'inflation': cpi[y]})
    assert out[0]['year'] == 1928 and all(out[k + 1]['year'] == out[k]['year'] + 1 for k in range(len(out) - 1))
    os.makedirs(os.path.join(STAGE, 'output'), exist_ok=True)
    json.dump(out, open(os.path.join(STAGE, 'output', 'returns.json'), 'w'), indent=0)
    n = len(out)
    for k in ('stocks', 'bonds', 'cash', 'inflation'):
        g = 1.0
        for x in out:
            g *= 1 + x[k]
        print(f'{k}: {out[0]["year"]}-{out[-1]["year"]}, arithmetic {sum(x[k] for x in out) / n:.4f}, '
              f'geometric {g ** (1 / n) - 1:.4f}')


if __name__ == '__main__':
    main()

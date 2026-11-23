#!/usr/bin/env python3
"""Asks Qwen (the farm's qwen3.8-27b, 131,072-token context) at high reasoning effort and a large answer budget, many
requests at once, for:
  1. errors in each engine file of the app (tax law, finance, and code), each with the exact lines and a fix;
  2. errors in each page file (wrong numbers, broken inputs, misleading labels);
  3. ProjectionLab features Horizon still lacks, from ProjectionLab's changelog (99_overall/input/projectionlab/);
  4. features ProjectionLab's users asked for (its archived request board, 637 suggestions and 37 planned items, with
     votes) which Horizon could build.
Writes 99_overall/output/qwen_review/<task>.md, one file a request, and requests.tsv (the parsed request board).

  python3 99_overall/code/93_qwen_review.py [TASK ...]
"""
import concurrent.futures as cf
import html
import os
import re
import sys

sys.path.insert(0, os.path.expanduser('~/.claude/skills/efficiency'))
import qwen_farm  # noqa: E402

H = '/home/baspring/projects/independent/horizon'
SRC = H + '/10_app/code/src'
PL = H + '/99_overall/input/projectionlab'
OUT = H + '/99_overall/output/qwen_review'
EFFORT = 'high'
BUDGET = 40000

SYSTEM = ('You are a senior engineer and a US personal-finance and tax expert (CFP, EA) reviewing Horizon, an open-source '
          'retirement and financial planning web app (React and TypeScript) modeled on ProjectionLab. Think carefully and '
          'at length before answering. Be concrete: quote the exact code you mean, and say what is wrong, why (cite the '
          'tax rule or the financial reasoning), and the exact fix. Report only real problems you are confident of; say '
          'so when a point is uncertain. Rules in force: 2026 and 2027 federal law after the 2025 act (OBBBA): $15M '
          'estate exemption, SALT cap $40,400 in 2026, the $6,000 senior deduction 2025-2028, QBI permanent.')


def read(path):
    return open(path, encoding='utf-8').read()


def board():
    """The request board's items: (list, votes, comments, title)."""
    rows = []
    for name, label in (('changemap_1252-suggestions.html', 'suggested'), ('changemap_1253-planned.html', 'planned')):
        t = read(os.path.join(PL, name))
        for card in re.findall(r'<div class="card card-wide".*?</div>\s*</div>', t, re.S):
            title = re.search(r'<div class="title">\s*(.*?)\s*</div>', card, re.S)
            counts = re.findall(r'fa-(thumbs-up|comment)"></i>\s*(\d+)', card)
            c = dict(counts)
            if title:
                rows.append((label, int(c.get('thumbs-up', 0)), int(c.get('comment', 0)), html.unescape(title.group(1)).strip()))
    rows.sort(key=lambda r: -r[1])
    with open(os.path.join(OUT, 'requests.tsv'), 'w') as f:
        f.write('list\tvotes\tcomments\ttitle\n')
        for r in rows:
            f.write('\t'.join(map(str, r)) + '\n')
    return rows


def code_block(path):
    rel = os.path.relpath(path, SRC)
    lines = read(path).splitlines()
    return f'=== {rel} ===\n' + '\n'.join(f'{i + 1:4d}  {l}' for i, l in enumerate(lines))


def tasks():
    types = code_block(SRC + '/engine/types.ts')
    readme = read(H + '/README.md')
    out = {}
    engine = ['simulate.ts', 'tax.ts', 'stateDeath.ts', 'montecarlo.ts', 'estate.ts', 'fire.ts', 'retirement.ts', 'optimize.ts', 'defaults.ts']
    for f in engine:
        out['engine_' + f.split('.')[0]] = (
            'Find every error in this engine file of Horizon: wrong tax or benefit rules, wrong financial logic (cash flow '
            'counted twice or never, inflation applied wrongly, a balance that can go negative, order-of-operations '
            'mistakes in the yearly loop), and plain code bugs. For each, give the line numbers, the wrong code, why it is '
            'wrong, and the corrected code. Then list the three most important missing behaviors of this file. The types '
            'and the README follow for context.\n\n' + readme + '\n\n' + types + '\n\n' + code_block(SRC + '/engine/' + f))
    for f in ['pages/Editors.tsx', 'pages/Analysis.tsx', 'pages/More.tsx', 'pages/Report.tsx', 'App.tsx', 'store.ts', 'vault.ts', 'useProjection.ts']:
        out['ui_' + os.path.basename(f).split('.')[0]] = (
            'Find every error in this page or app file of Horizon: numbers shown wrong (nominal against today\'s dollars, '
            'wrong totals), inputs which cannot be set or which save the wrong field, misleading labels, state bugs '
            '(stale memo dependencies, edits that do not persist), security mistakes in the vault, and accessibility or '
            'mobile problems. For each, give the line numbers, the wrong code, why, and the fix.\n\n' + types + '\n\n'
            + code_block(SRC + '/' + f))
    changelog = read(os.path.join(PL, 'changelog.txt'))
    out['missing_projectionlab'] = (
        'Below are Horizon\'s README (what it models) and its types, then ProjectionLab\'s full changelog through version '
        '5.0.0 (November 20, 2026). List every ProjectionLab feature Horizon lacks or covers only partly, most important '
        'first. For each: the feature, the changelog version that added it, what Horizon has today, and a concrete design '
        'for Horizon (types, engine steps, and UI). Leave out account linking to banks (Horizon is local-only), mobile apps, '
        'and non-US taxes.\n\n' + readme + '\n\n' + types + '\n\n=== ProjectionLab changelog ===\n' + changelog)
    reqs = board()
    listing = '\n'.join(f'[{l}, {v} votes, {c} comments] {t}' for l, v, c, t in reqs)
    out['user_requests'] = (
        'Below are Horizon\'s README and types, then every request ProjectionLab\'s users posted on its public request '
        'board (archived 2026), with votes. Pick the 25 requests which would help Horizon\'s users most (weigh votes, '
        'value, and effort; skip bank account linking and anything needing a server, since Horizon runs in the browser '
        'only), say for each whether Horizon already has it, and give a concrete design for Horizon (types, engine '
        'steps, and UI).\n\n' + readme + '\n\n' + types + '\n\n=== Requests ===\n' + listing)
    return out


def run(name, prompt):
    reply = qwen_farm.ask(prompt, SYSTEM, effort=EFFORT, max_tokens=BUDGET)
    open(os.path.join(OUT, name + '.md'), 'w').write(f'# {name}\n\n{reply}\n')
    return name, len(reply)


def main():
    os.makedirs(OUT, exist_ok=True)
    todo = tasks()
    want = sys.argv[1:] or list(todo)
    print(len(todo), 'tasks;', len(want), 'asked', flush=True)
    with cf.ThreadPoolExecutor(12) as ex:
        for f in cf.as_completed([ex.submit(run, n, todo[n]) for n in want]):
            name, n = f.result()
            print(name, n, 'chars', flush=True)


if __name__ == '__main__':
    main()

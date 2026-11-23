#!/usr/bin/env python3
"""Drafts the info-icon explanations of Horizon's fields (Bryce, 2026-11-23: "little info icons that show a tooltip ...
which explains it"). Reads output/help/labels.tsv (label, page, component, code line), asks Qwen for 40 labels a call at
medium effort, and writes output/help/drafts.json ({label: explanation}); a chunk already drafted is skipped on a rerun."""
import json, os, sys
sys.path.insert(0, os.path.expanduser('~/.claude/skills/efficiency'))
import qwen_farm
O = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'output', 'help')
rows = [l.rstrip('\n').split('\t') for l in open(os.path.join(O, 'labels.tsv'))]
out_p = os.path.join(O, 'drafts.json')
out = json.load(open(out_p)) if os.path.exists(out_p) else {}
SYSTEM = ('You write the help text of a US retirement and financial planning app (like ProjectionLab). For each field, write '
          '1 or 2 short sentences, under 240 characters, for a person who is not a finance expert: what the field means in this app '
          'and what to enter, with an example where it helps. Plain American English, no jargon left unexplained, no em dashes. '
          'Answer with one JSON object mapping each label exactly as given to its text, and nothing else.')
for k in range(0, len(rows), 40):
    chunk = [r for r in rows[k:k + 40] if r[0] not in out]
    if not chunk:
        continue
    prompt = 'Fields (label | page | code line):\n' + '\n'.join(f'{r[0]} | {r[1]} | {r[3]}' for r in chunk)
    reply = qwen_farm.ask(prompt, SYSTEM, 'medium', 12000)
    s = reply[reply.index('{'):reply.rindex('}') + 1]
    got = json.loads(s)
    out.update({l: t for l, t in got.items() if l in {r[0] for r in chunk}})
    json.dump(out, open(out_p, 'w'), indent=1, ensure_ascii=False)
    print(f'chunk {k // 40 + 1}: {len(got)} drafts, {len(out)} of {len(rows)}', flush=True)

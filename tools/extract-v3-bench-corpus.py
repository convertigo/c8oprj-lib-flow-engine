#!/usr/bin/env python3
"""Extract local FlowScript v3 revisions from the f3 bench traces.

The output stays under _private and is not intended for version control.
"""
import glob
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERN = str(Path.home() / 'Documents/convertigo/Convertigo_CVE/exercice-ace/light-bench/runs/f3*b*/flow-mcp-trace.jsonl')
output = ROOT / '_private/v3-trace-corpus'
output.mkdir(parents=True, exist_ok=True)
found = []
sets = patches = 0
for path in sorted(glob.glob(PATTERN)):
    current = {}
    for line in Path(path).open(encoding='utf-8'):
        try:
            event = json.loads(line)
            if event.get('direction') != 'request' or event.get('tool') not in ('code-set', 'code-patch'):
                continue
            args = event.get('payload', {}).get('params', {}).get('arguments', {})
            if isinstance(args, str):
                args = json.loads(args)
            name = str(args.get('qname') or args.get('name') or args.get('block') or '')
            if not name:
                continue
            if event['tool'] == 'code-set':
                code = args.get('code')
                if not isinstance(code, str):
                    continue
                sets += 1
            else:
                code = current.get(name)
                if code is None:
                    continue
                for edit in args.get('edits', []):
                    old, new = edit.get('oldText'), edit.get('newText')
                    if not isinstance(old, str) or not isinstance(new, str) or old not in code:
                        code = None
                        break
                    code = code.replace(old, new, 1)
                if code is None:
                    continue
                patches += 1
            current[name] = code
            if 'sourceVersion: 3' in code or 'sourceVersion:3' in code:
                found.append({'id': f'{Path(path).parent.name}:{name}:{len(found)+1}', 'source': code})
        except (ValueError, TypeError, KeyError):
            continue
(output / 'trace-cases.json').write_text(json.dumps(found, ensure_ascii=False), encoding='utf-8')
print(f'{len(glob.glob(PATTERN))} traces, {sets} code-set, {patches} reconstructed code-patch, {len(found)} v3 revisions')

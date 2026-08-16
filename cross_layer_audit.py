from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent
if not (ROOT / 'apps/api/src').exists() or not (ROOT / 'apps/web').exists():
    raise SystemExit(f'Invalid UniPortal project root: {ROOT}')
API = ROOT / 'apps/api/src'
WEB = ROOT / 'apps/web'


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def norm(part: str) -> str:
    part = part.strip().strip('`"\'')
    # Route contracts compare paths, not query-string serialization. Removing
    # the query portion avoids false mismatches for equivalent parameterized
    # endpoints such as /items?page=:param and /items?${params.toString()}.
    part = part.split('?', 1)[0]
    part = re.sub(r'\$\{[^}]+\}', ':param', part)
    part = re.sub(r'\[[^]]+\]', ':param', part)
    part = part.replace('//', '/')
    return part.strip('/')

backend: set[tuple[str, str]] = set()
backend_sources: dict[tuple[str, str], str] = {}
for p in sorted(API.rglob('*.controller.ts')):
    text = p.read_text(errors='ignore')
    ctrl = re.search(r'@Controller\(\s*\{\s*path:\s*[\'\"]([^\'\"]+)[\'\"].*?version:\s*[\'\"]([^\'\"]+)[\'\"]', text, re.S)
    if not ctrl:
        ctrl_simple = re.search(r'@Controller\(\s*[\'\"]([^\'\"]+)[\'\"]', text)
        if not ctrl_simple:
            continue
        base, version = ctrl_simple.group(1), '1'
    else:
        base, version = ctrl.group(1), ctrl.group(2)
    for match in re.finditer(r'@(Get|Post|Put|Patch|Delete|Options|Head)\(\s*([^)]*)\)', text):
        method = match.group(1).upper()
        suffix = norm(match.group(2))
        route = '/'.join(x for x in [base, suffix] if x)
        key = (method, f'/api/v{version}/{route}')
        backend.add(key)
        backend_sources[key] = rel(p)

print('BACKEND_ROUTES', len(backend))
for method, route in sorted(backend):
    print('BACKEND', method, route, backend_sources[(method, route)])

frontend = []
for p in sorted(list((WEB / 'app').rglob('*.ts')) + list((WEB / 'app').rglob('*.tsx')) + list((WEB / 'hooks').rglob('*.ts')) + list((WEB / 'hooks').rglob('*.tsx')) + list((WEB / 'lib').rglob('*.ts')) + list((WEB / 'components').rglob('*.tsx'))):
    text = p.read_text(errors='ignore')
    for m in re.finditer(r'apiClient\.(get|post|put|patch|delete|download)\s*(?:<[^>]+>)?\(\s*([`\"\'])(.*?)\2', text, re.S):
        method = 'GET' if m.group(1) == 'download' else m.group(1).upper()
        path = norm(m.group(3))
        frontend.append((method, f'/api/v1/{path}', rel(p), m.group(3).replace('\n', ' ')[:160]))

print('FRONTEND_CALLS', len(frontend))
for method, route, source, raw in frontend:
    # Match exact normalized path or backend dynamic params.
    def matches(bmethod: str, br: str) -> bool:
        if bmethod != method:
            return False
        a = route.strip('/').split('/')
        b = br.strip('/').split('/')
        if len(a) != len(b):
            return False
        return all(x == y or y.startswith(':') or x.startswith(':') for x, y in zip(a, b))
    candidates = [(bm, br) for bm, br in backend if matches(bm, br)]
    if not candidates:
        print('UNMATCHED', method, route, source, raw)
    else:
        print('MATCHED', method, route, source, candidates[0][1])

print('DIRECT_FETCH_SOURCES')
for p in sorted(list((WEB / 'app').rglob('*.ts')) + list((WEB / 'app').rglob('*.tsx')) + list((WEB / 'hooks').rglob('*.ts')) + list((WEB / 'hooks').rglob('*.tsx')) + list((WEB / 'lib').rglob('*.ts')) + list((WEB / 'components').rglob('*.tsx'))):
    text = p.read_text(errors='ignore')
    if re.search(r'(?<!apiClient\.)\bfetch\s*\(', text):
        print(rel(p))

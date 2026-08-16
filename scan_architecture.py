from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent
if not (ROOT / 'apps/api/src').exists() or not (ROOT / 'apps/web').exists():
    raise SystemExit(f'Invalid UniPortal project root: {ROOT}')
API = ROOT / 'apps/api/src'
WEB = ROOT / 'apps/web'


def files(base: Path, suffix: str):
    return sorted(base.rglob(suffix)) if base.exists() else []


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))

print('## backend controllers and route decorators')
route_count = 0
for path in files(API, '*.ts'):
    text = path.read_text(errors='ignore')
    if '@Controller' not in text:
        continue
    controllers = re.findall(r'@Controller\(([^)]*)\)', text)
    routes = re.findall(r'@(Get|Post|Put|Patch|Delete|Options|Head)\(([^)]*)\)', text)
    for controller in controllers:
        print(f'{rel(path)} CONTROLLER {controller}')
    for method, path_arg in routes:
        route_count += 1
        print(f'{rel(path)} {method.upper()} {path_arg}')
print(f'BACKEND_ROUTE_DECORATORS={route_count}')

print('\n## frontend API path literals')
frontend_paths = []
for path in files(WEB / 'hooks', '*.ts') + files(WEB / 'hooks', '*.tsx') + files(WEB / 'app', '*.ts') + files(WEB / 'app', '*.tsx') + files(WEB / 'lib', '*.ts') + files(WEB / 'components', '*.tsx'):
    text = path.read_text(errors='ignore')
    for match in re.finditer(r"(?:apiClient\.(?:get|post|put|patch|delete|download)|fetch)\s*\(\s*([`'\"])(.*?)\1", text, re.S):
        value = match.group(2).replace('\n', ' ')[:180]
        frontend_paths.append((rel(path), value))
for path, value in frontend_paths:
    print(f'{path} {value}')
print(f'FRONTEND_API_CALLS={len(frontend_paths)}')

print('\n## direct backend-origin and native API links')
for path in files(WEB, '*.tsx') + files(WEB, '*.ts'):
    text = path.read_text(errors='ignore')
    for pattern in (r'href=[\"\'`]\(/api/', r'fetch\s*\(', r'axios', r'XMLHttpRequest'):
        if re.search(pattern, text):
            print(rel(path), 'MATCH', pattern)

print('\n## placeholder/mock/TODO markers')
marker_re = re.compile(r'\b(TODO|FIXME|HACK|placeholder|mock|fake|sample data|coming soon|not implemented|return null)\b', re.I)
for base in (API, WEB / 'app', WEB / 'hooks', WEB / 'lib', ROOT / 'scripts'):
    for path in files(base, '*.ts') + files(base, '*.tsx') + files(base, '*.sh'):
        for i, line in enumerate(path.read_text(errors='ignore').splitlines(), 1):
            if marker_re.search(line):
                print(f'{rel(path)}:{i}:{line.strip()[:220]}')

print('\n## Prisma models and enums')
schema = ROOT / 'apps/api/prisma/schema.prisma'
if schema.exists():
    text = schema.read_text(errors='ignore')
    for kind, name in re.findall(r'^(model|enum)\s+(\w+)', text, re.M):
        print(kind.upper(), name)

print('\n## environment variable references')
refs = set()
for path in files(API, '*.ts') + files(ROOT / 'scripts', '*.sh') + files(ROOT / 'infra', '*.tf') + files(ROOT / '.github', '*.yml') + files(ROOT / '.github', '*.yaml'):
    text = path.read_text(errors='ignore')
    refs.update(re.findall(r'\b[A-Z][A-Z0-9_]{2,}\b', text))
for name in sorted(x for x in refs if any(token in x for token in ('DATABASE', 'REDIS', 'JWT', 'COOKIE', 'FRONTEND', 'API_', 'PORT', 'AWS_', 'S3', 'THROTTLE', 'FEATURE', 'MIGRATE'))):
    print(name)

print('\n## deployment entrypoints')
for path in sorted((ROOT / 'scripts').rglob('*')):
    if path.is_file() and path.suffix in {'.sh', '.yml', '.yaml', '.tf', '.json'}:
        text = path.read_text(errors='ignore')
        if any(token in text for token in ('docker compose', 'node dist', 'next start', 'prisma migrate', 'aws ecs', 'codedeploy', 'gunicorn')):
            print(rel(path))

#!/usr/bin/env python3
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCAN = [ROOT / 'apps' / 'api', ROOT / 'apps' / 'web']

def strip_comments(text: str) -> str:
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    text = re.sub(r'(^|\s)//.*$', r'\1', text, flags=re.M)
    return text

patterns = {
    'eval': re.compile(r'(?<![\w.])eval\s*\('),
    'new_function': re.compile(r'\bnew\s+Function\s*\('),
    # Only flag recognizable secret/token formats, avoiding harmless test fixture IDs.
    'hardcoded_secret': re.compile(
        r'(?:password|secret|api[_-]?key)\s*[:=]\s*[\'\"]'
        r'(?:sk[-_]|pk[-_]|rsk[-_]|xox[baprs]-|AIza|gh[pousr]_)[A-Za-z0-9_-]{16,}[\'\"]', re.I
    ),
    'unsafe_innerhtml': re.compile(r'dangerouslySetInnerHTML'),
}
failures = []
for base in SCAN:
    if not base.exists():
        continue
    for p in base.rglob('*'):
        if not p.is_file() or any(x in p.parts for x in ('node_modules', '.next', 'dist', 'coverage')):
            continue
        try:
            text = p.read_text(encoding='utf-8')
        except Exception:
            continue
        source = strip_comments(text)
        for name, pattern in patterns.items():
            if pattern.search(source):
                failures.append((name, str(p.relative_to(ROOT))))

if failures:
    for item in failures:
        print(f'{item[0]}: {item[1]}')
    sys.exit(1)
print('Static P5 security-pattern audit: PASS')

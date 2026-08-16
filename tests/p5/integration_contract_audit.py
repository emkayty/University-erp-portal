#!/usr/bin/env python3
from pathlib import Path
import re, sys

root = Path(__file__).resolve().parents[2]
controller = (root / 'apps/api/src/intelligence/intelligence.controller.ts').read_text()
service = (root / 'apps/api/src/intelligence/intelligence.service.ts').read_text()
layout = (root / 'apps/web/app/dashboard/layout.tsx').read_text()
page = (root / 'apps/web/app/dashboard/smart-operations/page.tsx').read_text()

checks = [
    ('Sparkles import', bool(re.search(r'\bSparkles\b', layout) and 'lucide-react' in layout)),
    ('GET intelligence alerts', "@Get('alerts')" in controller),
    ('GET intelligence tasks', "@Get('tasks')" in controller),
    ('listAlerts service', 'listAlerts(' in service),
    ('listTasks service', 'listTasks(' in service),
    ('smart alerts client', '/intelligence/alerts' in page),
    ('smart tasks client', '/intelligence/tasks' in page),
]
failed = [name for name, ok in checks if not ok]
for name, ok in checks:
    print(('PASS ' if ok else 'FAIL ') + name)
if failed:
    sys.exit(1)

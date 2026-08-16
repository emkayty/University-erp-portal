from pathlib import Path
import sys

root=Path(__file__).resolve().parents[2]
sql=(root/"apps/api/prisma/migrations/0026_normalize_exam_authorities/migration.sql").read_text()

required=[
    "olevel-auth-waec",
    "olevel-auth-neco",
    "olevel-auth-nabteb",
    "olevel-auth-nbais",
    "SAISSCE_INTERNAL",
    "SAISSCE_EXTERNAL",
    "SCIENCE",
    "TAHFEEZ",
    "INTERNAL",
    "EXTERNAL",
]
missing=[x for x in required if x not in sql]
for x in required:
    print(("PASS " if x in sql else "FAIL ")+x)
if missing:
    sys.exit(1)

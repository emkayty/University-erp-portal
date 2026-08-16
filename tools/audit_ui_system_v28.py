from pathlib import Path
import re, json

root=Path(__file__).resolve().parents[1]
scan=[root/"apps"/"web"]
patterns={
 "glass tokens":r"--glass-(?:bg|border|shadow|blur)",
 "legacy ERP tokens":r"--erp-(?:bg|surface|accent|success|warning|danger)",
 "glass classes":r"\.glass-card\b",
 "legacy button":r"\.erp-button\b",
}
hits={}
for base in scan:
 for p in base.rglob("*"):
  if p.suffix not in {".css",".tsx",".ts",".jsx",".js"}: continue
  try: text=p.read_text(encoding="utf-8",errors="ignore")
  except: continue
  for name,pat in patterns.items():
   if re.search(pat,text):
    hits.setdefault(name,[]).append(str(p.relative_to(root)))
print(json.dumps(hits,indent=2))

from pathlib import Path
import sys,re
root=Path(__file__).resolve().parents[2]
bad=[]
for p in root.rglob("*"):
    if not p.is_file() or p.suffix not in {".ts",".tsx",".js",".jsx",".json",".html",".md"}: continue
    try:t=p.read_text(encoding="utf-8",errors="ignore")
    except:continue
    if "169.254.169.254" in t:
        bad.append(str(p.relative_to(root)))
if bad:
    print("FAIL: cloud metadata endpoint reference found:")
    print("\n".join(bad));sys.exit(1)
print("PASS: no cloud metadata endpoint reference")

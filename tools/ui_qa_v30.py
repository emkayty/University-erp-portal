from pathlib import Path
import re,json

root=Path(__file__).resolve().parents[1]
web=root/"apps"/"web"
checks={
 "legacy_glass": r"glass-card|--glass-(?:bg|border|shadow|blur)",
 "legacy_erp_tokens": r"--erp-(?:bg|surface|accent|success|warning|danger)",
 "inline_hardcoded_primary": r"#[0-9a-fA-F]{6}",
}
result={}
for name,pat in checks.items():
    hits=[]
    for p in web.rglob("*"):
        if p.suffix not in {".css",".tsx",".jsx",".ts",".js"}: continue
        try:t=p.read_text(encoding="utf-8",errors="ignore")
        except:continue
        if re.search(pat,t): hits.append(str(p.relative_to(root)))
    result[name]=hits
print(json.dumps(result,indent=2))

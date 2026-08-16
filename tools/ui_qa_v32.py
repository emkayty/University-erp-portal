from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]; web=root/"apps"/"web"
patterns={"browser_alert":r"(?:window\\.)?alert\\s*\\(","browser_confirm":r"(?:window\\.)?confirm\\s*\\(","dangerous_html":r"\\bdangerouslySetInnerHTML\\b","hardcoded_hex":r"#[0-9a-fA-F]{6}\\b"}
result={}
for name,pat in patterns.items():
 hits=[]
 for p in web.rglob("*"):
  if p.suffix not in {".tsx",".jsx",".ts",".js",".css"}: continue
  try:t=p.read_text(encoding="utf-8",errors="ignore")
  except:continue
  for i,line in enumerate(t.splitlines(),1):
   if re.search(pat,line):
    if name in {"browser_alert","browser_confirm"} and re.search(r"\\b\\w+\\.(?:alert|confirm)\\s*\\(",line) and not re.search(r"\\bwindow\\.(?:alert|confirm)\\s*\\(",line): continue
    hits.append({"file":str(p.relative_to(root)),"line":i,"text":line.strip()[:240]})
 result[name]=hits
print(json.dumps(result,indent=2))

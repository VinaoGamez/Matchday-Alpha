import re
import json
import html
import sys
from pathlib import Path

pairs = [
    ("benchmark-career-round-5000-p2.html", "benchmark-career-round-5000-p2.json"),
    ("benchmark-career-mixed-5000-p2.html", "benchmark-career-mixed-5000-p2.json"),
]

for src, dst in pairs:
    p = Path(src)
    if not p.exists():
        print(f"{src} missing")
        continue
    text = p.read_text(encoding="utf-8")
    match = re.search(r'<pre id="benchmark-json">(.*?)</pre>', text, re.S)
    if not match:
        print(f"{src} JSON not found")
        continue
    data = json.loads(html.unescape(match.group(1)))
    Path(dst).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    r = data.get("rates", {})
    print(f"=== {dst} ===")
    for k in ("goalsPerMatch", "homeWinRate", "drawRate", "foulsPerMatch", "xgToGoalsRatio", "over45Rate"):
        print(f"{k}: {r.get(k)}")

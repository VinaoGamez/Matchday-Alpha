import re
import json
import html
from pathlib import Path

text = Path("benchmark-career-round-5000.html").read_text(encoding="utf-8")
match = re.search(r'<pre id="benchmark-json">(.*?)</pre>', text, re.S)
if not match:
    raise SystemExit("JSON not found")
data = json.loads(html.unescape(match.group(1)))
Path("benchmark-career-round-5000.json").write_text(
    json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
)
print(json.dumps(data, indent=2, ensure_ascii=False))

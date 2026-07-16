from pathlib import Path

path = Path(__file__).resolve().parent.parent / 'js/legacy/engine.js'
lines = path.read_text(encoding='utf-8').splitlines(keepends=True)

start = end = None
for i, line in enumerate(lines):
    if line.startswith('  const roundAverage='):
        start = i
    if start is not None and line.startswith('  const cupPenaltyWinner='):
        end = i
        break

if start is None or end is None:
    raise SystemExit(f'Block not found: start={start} end={end}')

del lines[start:end]
path.write_text(''.join(lines), encoding='utf-8')
print(f'Removed lines {start + 1}-{end} ({end - start} lines)')

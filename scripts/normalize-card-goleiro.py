"""Prepara PNGs de goleiro para o layout base (694×1024 · máscara 76.37%)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CARDS = ROOT / 'assets' / 'cards'
TARGET_W, TARGET_H = 694, 1024
FOOT_Y_PCT = 76.37
FOOT_BG = (0, 20, 41)  # #001429 — igual card-layout.js


def prepare(path: Path) -> None:
    y0 = int(round(TARGET_H * FOOT_Y_PCT / 100))
    im = Image.open(path).convert('RGB')
    if im.size != (TARGET_W, TARGET_H):
        im = im.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(im)
    draw.rectangle([0, y0, TARGET_W, TARGET_H], fill=FOOT_BG)
    im.save(path, optimize=True)


def main() -> None:
    paths = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else sorted(CARDS.glob('card-goleiro*.png'))
    base = CARDS / 'card-goleiro.png'
    if base not in paths and base.is_file():
        paths = [base, *paths]
    for path in paths:
        prepare(path)
        print(f'{path.name}: {TARGET_W}x{TARGET_H}, rodapé mock apagado desde {FOOT_Y_PCT}%')


if __name__ == '__main__':
    main()

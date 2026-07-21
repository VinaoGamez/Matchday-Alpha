"""Comprime ilustrações do estádio para WebP (UI ~640px)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
STADIUM_DIR = ROOT / "assets" / "stadium"
TARGET_WIDTH = 960
WEBP_QUALITY = 84


def compress_one(path: Path) -> tuple[int, int]:
    before = path.stat().st_size
    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        if w > TARGET_WIDTH:
            nh = max(1, round(h * TARGET_WIDTH / w))
            im = im.resize((TARGET_WIDTH, nh), Image.Resampling.LANCZOS)
        out = path.with_suffix(".webp")
        im.save(out, format="WEBP", quality=WEBP_QUALITY, method=6)
    after = out.stat().st_size
    path.unlink()
    return before, after


def main() -> None:
    files = sorted(STADIUM_DIR.glob("stadium-tier-*.png"))
    if not files:
        print("Nenhum PNG em assets/stadium/")
        return
    total_before = 0
    total_after = 0
    for path in files:
        before, after = compress_one(path)
        total_before += before
        total_after += after
        print(f"{path.stem}: {before // 1024} KB -> {path.with_suffix('.webp').name} {after // 1024} KB")
    print(f"\nTotal: {total_before // 1024} KB -> {total_after // 1024} KB ({100 * total_after / max(1, total_before):.0f}%)")


if __name__ == "__main__":
    main()

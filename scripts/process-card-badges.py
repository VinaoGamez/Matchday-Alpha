"""Remove magenta backdrop from card badge art and export transparent PNGs."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "cards" / "badges"
CURSOR_ASSETS = Path(
    r"C:\Users\Vinão\.cursor\projects\c-Users-Vin-o-Documents-Matchday-Alpha\assets"
)

SRC = [
    (
        CURSOR_ASSETS
        / "c__Users_Vin_o_AppData_Roaming_Cursor_User_workspaceStorage_d270694926bdfd4a0b308a3b89cea87b_images_call_8Z5WFos8dNk49Yxwq0guqOUE-e0ff232f-0d4d-4ba5-a77c-fabd72429a96.png",
        "card-badge-especialista-falta.png",
    ),
    (
        CURSOR_ASSETS
        / "c__Users_Vin_o_AppData_Roaming_Cursor_User_workspaceStorage_d270694926bdfd4a0b308a3b89cea87b_images_call_NQexv30S4IGfyqztuvcJqzjT-5ab64dd4-4869-4b03-90a3-fa851234916b.png",
        "card-badge-especialista-penalti.png",
    ),
    (
        CURSOR_ASSETS
        / "c__Users_Vin_o_AppData_Roaming_Cursor_User_workspaceStorage_d270694926bdfd4a0b308a3b89cea87b_images_call_PeKSXoaoHVqbFsqWsnAE5Xwf-d528a78b-2d54-42a7-b5b2-bf6295f3e7d8.png",
        "card-badge-estrela-prata.png",
    ),
    (
        CURSOR_ASSETS
        / "c__Users_Vin_o_AppData_Roaming_Cursor_User_workspaceStorage_d270694926bdfd4a0b308a3b89cea87b_images_call_t9pwpQPIUM76vc0cXB3yvfdB-4ac36ac3-3fec-44f2-8072-23470bbf6ae9.png",
        "card-badge-estrela-dourada.png",
    ),
]

LEGACY_ALIASES = {
    "card-badge-especialista-falta.png": "card-badge-falta.png",
    "card-badge-especialista-penalti.png": "card-badge-penalti.png",
}


def is_backdrop(r: int, g: int, b: int) -> bool:
    if r > 240 and g < 40 and b > 240:
        return True
    if r > 180 and b > 180 and g < 120 and (r + b - g) > 200:
        return True
    return False


def key_and_trim(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = px[x, y]
            if is_backdrop(r, g, b):
                px[x, y] = (r, g, b, 0)
    bbox = im.getbbox()
    if not bbox:
        return im
    pad = max(8, int(min(im.size) * 0.02))
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(w, r + pad)
    b = min(h, b + pad)
    return im.crop((l, t, r, b))


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for src, name in SRC:
        if not src.exists():
            raise FileNotFoundError(src)
        out = key_and_trim(Image.open(src))
        path = ASSETS / name
        out.save(path, "PNG", optimize=True)
        print(f"{name}: {out.size} ({path.stat().st_size // 1024} KB)")

    for new, old in LEGACY_ALIASES.items():
        Image.open(ASSETS / new).save(ASSETS / old, "PNG", optimize=True)
        print(f"alias -> {old}")


if __name__ == "__main__":
    main()

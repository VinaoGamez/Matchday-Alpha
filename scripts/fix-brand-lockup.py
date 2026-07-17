"""Re-crop brand lockup without the stray corner mark."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

SRC = Path(
    r"C:\Users\Vinão\.cursor\projects\c-Users-Vin-o-Documents-Matchday-Alpha"
    r"\assets\c__Users_Vin_o_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"d270694926bdfd4a0b308a3b89cea87b_images_Imagem_1_gerada__2_-2a687883-789c-4a90-942b-54deb60ba605.png"
)
OUT_DIRS = [
    Path(__file__).resolve().parents[1] / "assets" / "brand",
    Path(__file__).resolve().parents[1] / "public" / "brand",
]


def is_dark_bg(r: int, g: int, b: int, a: int = 255) -> bool:
    if a < 10:
        return True
    return max(r, g, b) <= 42 and abs(r - g) < 18 and abs(g - b) < 22


def remove_dark_bg(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not visited[x][y]:
            r, g, b, a = px[x, y]
            if is_dark_bg(r, g, b, a):
                visited[x][y] = True
                q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                r, g, b, a = px[nx, ny]
                if is_dark_bg(r, g, b, a):
                    visited[nx][ny] = True
                    q.append((nx, ny))
    return im


def trim(im: Image.Image, pad: int = 8) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop(
        (max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad))
    )


def main() -> None:
    sheet = remove_dark_bg(Image.open(SRC))
    w, h = sheet.size
    # Wipe bottom-right corner mark zone before computing lockup bounds.
    px = sheet.load()
    for y in range(int(h * 0.62), h):
        for x in range(int(w * 0.72), w):
            px[x, y] = (0, 0, 0, 0)

    # Also wipe anything below the main lockup band.
    for y in range(int(h * 0.78), h):
        for x in range(w):
            px[x, y] = (0, 0, 0, 0)

    lockup = trim(sheet, pad=10)
    lockup_h = 160
    lockup_w = max(1, int(lockup.width * (lockup_h / lockup.height)))
    lockup_sm = lockup.resize((lockup_w, lockup_h), Image.Resampling.LANCZOS)
    lockup_lg = lockup.resize(
        (max(1, int(lockup.width * (220 / lockup.height))), 220),
        Image.Resampling.LANCZOS,
    )

    for folder in OUT_DIRS:
        folder.mkdir(parents=True, exist_ok=True)
        lockup_sm.save(folder / "lockup.png")
        lockup_lg.save(folder / "lockup-lg.png")
        print("saved", folder)

    print("lockup size", lockup.size)


if __name__ == "__main__":
    main()

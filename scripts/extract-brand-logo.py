"""Extract Matchday brand mark + lockup; sample palette colors."""
from __future__ import annotations

from collections import Counter, deque
from pathlib import Path

from PIL import Image

SRC = Path(
    r"C:\Users\Vinão\.cursor\projects\c-Users-Vin-o-Documents-Matchday-Alpha"
    r"\assets\c__Users_Vin_o_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"d270694926bdfd4a0b308a3b89cea87b_images_Imagem_1_gerada__2_-2a687883-789c-4a90-942b-54deb60ba605.png"
)
OUT = Path(__file__).resolve().parents[1] / "assets" / "brand"
PUBLIC = Path(__file__).resolve().parents[1] / "public" / "brand"


def is_dark_bg(r: int, g: int, b: int, a: int = 255) -> bool:
    if a < 10:
        return True
    # Near-black / deep navy sheet
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


def trim(im: Image.Image, pad: int = 6) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    return im.crop(
        (max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad))
    )


def connected_components(im: Image.Image, min_pixels: int = 80) -> list[tuple[int, int, int, int, int]]:
    """Return list of (area, l, t, r, b) for opaque clusters."""
    w, h = im.size
    px = im.load()
    seen = [[False] * h for _ in range(w)]
    comps = []
    for y in range(h):
        for x in range(w):
            if seen[x][y] or px[x, y][3] < 20:
                continue
            q = deque([(x, y)])
            seen[x][y] = True
            area = 0
            l = r = x
            t = b = y
            while q:
                cx, cy = q.popleft()
                area += 1
                l, r = min(l, cx), max(r, cx)
                t, b = min(t, cy), max(b, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and px[nx, ny][3] >= 20:
                        seen[nx][ny] = True
                        q.append((nx, ny))
            if area >= min_pixels:
                comps.append((area, l, t, r + 1, b + 1))
    comps.sort(reverse=True)
    return comps


def sample_accents(im: Image.Image) -> tuple[str, str]:
    px = im.load()
    cyan_votes = []
    lime_votes = []
    for y in range(0, im.height, 2):
        for x in range(0, im.width, 2):
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            # Skip near-white text
            if min(r, g, b) > 220:
                continue
            if b > 150 and b >= g and b > r + 20:
                cyan_votes.append((r, g, b))
            elif g > 160 and g >= r and g > b + 30:
                lime_votes.append((r, g, b))

    def avg(votes: list[tuple[int, int, int]], fallback: tuple[int, int, int]) -> str:
        if not votes:
            r, g, b = fallback
        else:
            n = len(votes)
            r = sum(v[0] for v in votes) // n
            g = sum(v[1] for v in votes) // n
            b = sum(v[2] for v in votes) // n
        return f"#{r:02x}{g:02x}{b:02x}"

    return avg(cyan_votes, (0, 173, 239)), avg(lime_votes, (179, 212, 31))


def to_square(im: Image.Image, side: int = 256) -> Image.Image:
    trimmed = trim(im, pad=4)
    canvas = Image.new("RGBA", (max(trimmed.size), max(trimmed.size)), (0, 0, 0, 0))
    canvas.paste(trimmed, ((canvas.width - trimmed.width) // 2, (canvas.height - trimmed.height) // 2), trimmed)
    return canvas.resize((side, side), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(SRC).convert("RGBA")
    cut = remove_dark_bg(sheet)
    comps = connected_components(cut, min_pixels=120)
    print("sheet", sheet.size, "components", len(comps))
    for i, c in enumerate(comps[:5]):
        print(" ", i, c)

    if not comps:
        raise SystemExit("no logo components found")

    # Corner emblem = compact cluster near bottom-right.
    mark_comp = None
    for area, cl, ct, cr, cb in comps:
        w, h = cr - cl, cb - ct
        ratio = w / max(h, 1)
        if 0.75 <= ratio <= 1.3 and area > 800 and cl > cut.width * 0.65 and ct > cut.height * 0.55:
            mark_comp = (area, cl, ct, cr, cb)
            break

    # Lockup = union of opaque pixels excluding the corner emblem.
    px = cut.load()
    lock_l, lock_t, lock_r, lock_b = cut.width, cut.height, 0, 0
    found = False
    for y in range(cut.height):
        for x in range(cut.width):
            if px[x, y][3] < 20:
                continue
            if mark_comp:
                _, ml, mt, mr, mb = mark_comp
                if ml - 4 <= x <= mr + 4 and mt - 4 <= y <= mb + 4:
                    continue
            found = True
            lock_l, lock_r = min(lock_l, x), max(lock_r, x)
            lock_t, lock_b = min(lock_t, y), max(lock_b, y)
    if not found:
        raise SystemExit("lockup bounds not found")
    lockup = trim(cut.crop((lock_l, lock_t, lock_r + 1, lock_b + 1)), pad=10)

    if mark_comp:
        _, ml, mt, mr, mb = mark_comp
        mark_src = trim(cut.crop((ml, mt, mr, mb)), pad=4)
    else:
        # Fallback: largest near-square component, else left shield of lockup.
        mark_src = None
        for area, cl, ct, cr, cb in comps:
            w, h = cr - cl, cb - ct
            ratio = w / max(h, 1)
            if 0.7 <= ratio <= 1.35 and area > 400:
                mark_src = trim(cut.crop((cl, ct, cr, cb)), pad=4)
                break
        if mark_src is None:
            mark_src = trim(lockup.crop((0, 0, int(lockup.width * 0.28), lockup.height)), pad=2)

    mark = to_square(mark_src, 256)
    lockup_h = 160
    lockup_w = max(1, int(lockup.width * (lockup_h / lockup.height)))
    lockup_out = lockup.resize((lockup_w, lockup_h), Image.Resampling.LANCZOS)

    cyan, lime = sample_accents(lockup)
    print("palette cyan", cyan, "lime", lime)

    for folder in (OUT, PUBLIC):
        mark.save(folder / "mark.png")
        lockup_out.save(folder / "lockup.png")
        # Also keep a larger lockup for home hero
        lockup.resize(
            (max(1, int(lockup.width * (220 / lockup.height))), 220),
            Image.Resampling.LANCZOS,
        ).save(folder / "lockup-lg.png")
        (folder / "palette.txt").write_text(f"cyan={cyan}\nlime={lime}\nnight=#050c17\n", encoding="utf-8")

    print("saved ->", OUT)
    print("saved ->", PUBLIC)


if __name__ == "__main__":
    main()

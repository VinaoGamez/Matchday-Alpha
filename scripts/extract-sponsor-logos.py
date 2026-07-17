"""
Crop sponsor marks from the sheet.

Keeps a solid navy background in the final tiles. Internally isolates the mark
so each icon is centered with even padding (fixes uneven cell framing).
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

SRC = Path(
    r"C:\Users\Vinão\.cursor\projects\c-Users-Vin-o-Documents-Matchday-Alpha"
    r"\assets\c__Users_Vin_o_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"d270694926bdfd4a0b308a3b89cea87b_images_Imagem_1_gerada__6_-9b6c589c-3c4c-4162-ad15-e6b3264febfc.png"
)
OUT_DIR = Path(__file__).resolve().parents[1] / "assets" / "sponsors"

NAMES = [
    "nubanco",
    "petrobraz",
    "magazine-luizao",
    "ifome",
    "betregional",
    "picpaga",
    "sheinpee",
    "amazonia-com",
    "googol",
    "metagol",
    "starbox-coffee",
    "havaianinhas",
    "naike",
    "pumba-sport",
    "perdigol",
    "poweraid",
    "playstacao",
    "fedexpressao",
]

ROWS, COLS = 3, 6
SIDE = 512
CELL_INSET_X = 0.035
CELL_INSET_Y = 0.045
ICON_MARGIN = 0.34
FULL_MARGIN = 0.18
PLATE = (5, 12, 22)


def cell_boxes(width: int, height: int) -> list[tuple[int, int, int, int]]:
    cw, ch = width / COLS, height / ROWS
    ix, iy = cw * CELL_INSET_X, ch * CELL_INSET_Y
    boxes = []
    for row in range(ROWS):
        for col in range(COLS):
            boxes.append(
                (
                    int(col * cw + ix),
                    int(row * ch + iy),
                    int((col + 1) * cw - ix),
                    int((row + 1) * ch - iy),
                )
            )
    return boxes


def is_plate(r: int, g: int, b: int, a: int = 255) -> bool:
    """Navy sheet / neon streak — safe to clear. Keep pure-black logo fills."""
    if a < 8:
        return True
    # Neon corner streaks
    if g >= 145 and b <= 120 and g >= r + 15 and g >= b + 30:
        return True
    # Blue-dominant dark navy
    if b >= r + 5 and b >= g and r < 55 and (r + g + b) < 160:
        return True
    if max(r, g, b) <= 48 and b >= g and b >= r and (b - min(r, g)) >= 3:
        return True
    return False


def is_neon(r: int, g: int, b: int) -> bool:
    return g >= 120 and b <= 130 and g >= r + 10 and g >= b + 20


def knock_out_plate(im: Image.Image) -> Image.Image:
    """Flood-fill plate from edges → alpha 0 (keeps black logo bodies)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = [[False] * h for _ in range(w)]
    q: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not visited[x][y]:
            r, g, b, a = px[x, y]
            if is_plate(r, g, b, a):
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
                if is_plate(r, g, b, a):
                    visited[nx][ny] = True
                    q.append((nx, ny))

    # Neon streaks can be islands not connected to the edge flood.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and is_neon(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    return im


def keep_main_cluster(im: Image.Image, nearby: int = 28) -> Image.Image:
    """Keep the largest opaque cluster and accents near it; drop distant debris."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = [[False] * h for _ in range(w)]
    components: list[tuple[int, list[tuple[int, int]], tuple[int, int, int, int]]] = []

    for sy in range(h):
        for sx in range(w):
            if visited[sx][sy] or px[sx, sy][3] < 20:
                continue
            q: deque[tuple[int, int]] = deque([(sx, sy)])
            visited[sx][sy] = True
            cells: list[tuple[int, int]] = []
            while q:
                x, y = q.popleft()
                cells.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny] and px[nx, ny][3] >= 20:
                        visited[nx][ny] = True
                        q.append((nx, ny))
            xs = [c[0] for c in cells]
            ys = [c[1] for c in cells]
            components.append((len(cells), cells, (min(xs), min(ys), max(xs), max(ys))))

    if not components:
        return im

    components.sort(key=lambda item: item[0], reverse=True)
    _, main_cells, main_box = components[0]
    ml, mt, mr, mb = main_box
    keep = {id(main_cells)}
    for _, cells, (l, t, r, b) in components[1:]:
        # Keep if bounding boxes are near the main mark (floating pixels, etc.).
        near = not (r < ml - nearby or l > mr + nearby or b < mt - nearby or t > mb + nearby)
        if near:
            keep.add(id(cells))

    for _, cells, _ in components:
        if id(cells) not in keep:
            for x, y in cells:
                px[x, y] = (0, 0, 0, 0)
    return im


def alpha_bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    return im.getbbox()


def mark_from_alpha(im: Image.Image) -> Image.Image:
    """Keep only the upper mark band (drop wordmark under the gap)."""
    w, h = im.size
    px = im.load()
    rows = [sum(1 for x in range(w) if px[x, y][3] > 20) for y in range(h)]
    if not any(rows):
        return im

    peak = max(rows)
    thr = max(3, int(peak * 0.08))
    bands: list[tuple[int, int]] = []
    start = None
    for y, count in enumerate(rows):
        if count >= thr and start is None:
            start = y
        elif count < thr and start is not None:
            bands.append((start, y))
            start = None
    if start is not None:
        bands.append((start, h))

    full_top = next(i for i, c in enumerate(rows) if c >= thr)
    full_bot = h - next(i for i, c in enumerate(reversed(rows)) if c >= thr)
    full_h = full_bot - full_top
    min_h = max(20, int(full_h * 0.22))

    candidates = [b for b in bands if b[1] - b[0] >= 8]
    substantial = [b for b in candidates if b[1] - b[0] >= min_h]

    if substantial:
        top, bottom = substantial[0]
        # Pull in small accent bands just above the mark (e.g. Googol pixels).
        for band in candidates:
            if band[1] <= top and top - band[1] <= 14:
                top = band[0]
        # Merge nearby chunky graphic bands (Starbox star + cup). Skip thin text.
        for band in substantial[1:]:
            gap = band[0] - bottom
            if gap <= 14:
                bottom = band[1]
            else:
                break
    elif candidates:
        top, bottom = candidates[0]
    else:
        top, bottom = full_top, full_top + max(min_h, int(full_h * 0.64))

    # Single tall stack = mark glued to wordmark → keep upper portion only.
    if bottom - top >= int(full_h * 0.78):
        bottom = top + max(min_h, int(full_h * 0.62))

    cropped = im.crop((0, top, w, bottom))
    bbox = alpha_bbox(cropped)
    return cropped.crop(bbox) if bbox else cropped


def compose_on_plate(sprite: Image.Image, margin_ratio: float, side: int) -> Image.Image:
    """Center transparent sprite on solid navy square."""
    sprite = sprite.convert("RGBA")
    bbox = alpha_bbox(sprite)
    if bbox:
        sprite = sprite.crop(bbox)
    sw, sh = sprite.size
    art = max(sw, sh, 1)
    margin = max(14, int(art * margin_ratio))
    canvas_side = art + margin * 2
    canvas = Image.new("RGBA", (canvas_side, canvas_side), (*PLATE, 255))
    canvas.alpha_composite(
        sprite,
        ((canvas_side - sw) // 2, (canvas_side - sh) // 2),
    )
    return canvas.convert("RGB").resize((side, side), Image.Resampling.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "icons").mkdir(exist_ok=True)
    (OUT_DIR / "full").mkdir(exist_ok=True)

    sheet = Image.open(SRC).convert("RGBA")
    print("sheet", sheet.size)

    for name, box in zip(NAMES, cell_boxes(*sheet.size)):
        cell = keep_main_cluster(knock_out_plate(sheet.crop(box)))
        full_bbox = alpha_bbox(cell)
        full_sprite = cell.crop(full_bbox) if full_bbox else cell
        mark_sprite = mark_from_alpha(cell)

        icon = compose_on_plate(mark_sprite, ICON_MARGIN, SIDE)
        full = compose_on_plate(full_sprite, FULL_MARGIN, SIDE)

        icon.save(OUT_DIR / "icons" / f"{name}.png")
        full.save(OUT_DIR / "full" / f"{name}.png")
        print(f"ok {name}: mark={mark_sprite.size} full={full_sprite.size}")

    print(f"done -> {OUT_DIR}")


if __name__ == "__main__":
    main()

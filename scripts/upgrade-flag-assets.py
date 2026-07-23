#!/usr/bin/env python3
"""Baixa bandeiras HD para public/flags/ (640px PNG, com fallback w320)."""
from __future__ import annotations

import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLAGS = ROOT / 'public' / 'flags'

CDN_MAP = {
    'eng': 'gb-eng',
    'sc': 'gb-sct',
}


def fetch(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={'User-Agent': 'Matchday-Alpha/1.0'})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=45, context=ctx) as resp:
            if resp.status != 200:
                return None
            data = resp.read()
            return data if len(data) >= 800 else None
    except (urllib.error.URLError, TimeoutError, OSError):
        return None


def download_iso(iso: str) -> bool:
    slug = CDN_MAP.get(iso, iso)
    for width in (640, 320, 160):
        url = f'https://flagcdn.com/w{width}/{slug}.png'
        for attempt in range(3):
            data = fetch(url)
            if data:
                (FLAGS / f'{iso}.png').write_bytes(data)
                return True
            time.sleep(0.35 * (attempt + 1))
    return False


def main() -> None:
    ok = fail = 0
    for path in sorted(FLAGS.glob('*.png')):
        iso = path.stem.lower()
        if download_iso(iso):
            size = path.stat().st_size
            print(f'OK   {iso} ({size // 1024} KB)')
            ok += 1
        else:
            print(f'FAIL {iso}')
            fail += 1
        time.sleep(0.15)
    print(f'Done: {ok} updated, {fail} failed')


if __name__ == '__main__':
    main()

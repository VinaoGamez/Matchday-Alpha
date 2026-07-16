#!/usr/bin/env python3
"""
Servidor hardened para link externo de testers (porta 5081).

- Preferencia: pasta dist/ (bundle minificado via npm run build)
- Fallback: raiz do projeto com deny-list agressiva
"""
from __future__ import annotations

import argparse
import mimetypes
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
PORT_DEFAULT = 5081

BLOCKED_EXACT = {
    'inspect-save.html',
    'validate-game.html',
    'benchmark.html',
    'benchmark-runner.html',
    'benchmark-cup-divisions.html',
    'benchmark-output.html',
    'package.json',
    'vite.config.js',
    'CHANGELOG.md',
    'LEIA-ME.txt',
    'LINK-COMPARTILHAMENTO.txt',
    'LINK-EXTERNO.txt',
}

BLOCKED_PREFIXES = (
    'docs/',
    'scripts/',
    '.cursor/',
    'tools/',
    '.git/',
    'node_modules/',
    'benchmark-',
    'agent-transcripts/',
)

# Com bundle dist/, bloqueia pastas de fonte mesmo se alguém adivinhar o caminho.
SOURCE_PREFIXES_WHEN_DIST = (
    'js/legacy/',
    'js/core/',
    'js/features/',
    'js/modules/',
    'js/ui/',
)

BLOCKED_SUFFIXES = (
    '.md', '.py', '.bat', '.ps1', '.log', '.jsonl', '.map',
    '.gitignore', '.env', '.example',
)

BLOCKED_QUERY_KEYS = re.compile(
    r'(^|&)(engineTest|cupAudit|autoBenchmark|benchmark)(=|&|$)',
    re.I,
)

SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': (
        "default-src 'self'; "
        "script-src 'self' https://fonts.googleapis.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob:; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "frame-ancestors 'none'; "
        "form-action 'self'"
    ),
}


def use_dist() -> bool:
    return DIST.is_dir() and (DIST / 'index.html').is_file()


def normalize_path(path: str) -> str:
    path = unquote(path.split('?', 1)[0])
    if path.startswith('/'):
        path = path[1:]
    if not path:
        return 'home.html'
    return path.replace('\\', '/')


class TesterHandler(SimpleHTTPRequestHandler):
    serve_root: Path = ROOT
    dist_mode: bool = False

    def log_message(self, format: str, *args) -> None:
        if args and str(args[0]).startswith('4'):
            super().log_message(format, *args)

    def end_headers(self) -> None:
        for key, value in SECURITY_HEADERS.items():
            self.send_header(key, value)
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.query and BLOCKED_QUERY_KEYS.search(parsed.query):
            self.send_error(403, 'Modo de depuração bloqueado no link de testers.')
            return

        rel = normalize_path(parsed.path)
        if self.is_blocked(rel):
            self.send_error(403, 'Recurso indisponível no ambiente de testers.')
            return

        target = self.resolve_target(rel)
        if target is None or not target.is_file():
            self.send_error(404, 'Arquivo não encontrado.')
            return

        content = target.read_bytes()
        ctype = mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def is_blocked(self, rel: str) -> bool:
        lower = rel.lower()
        if lower in BLOCKED_EXACT:
            return True
        if any(lower.startswith(prefix) for prefix in BLOCKED_PREFIXES):
            return True
        if self.dist_mode and any(lower.startswith(prefix) for prefix in SOURCE_PREFIXES_WHEN_DIST):
            return True
        if any(lower.endswith(suffix) for suffix in BLOCKED_SUFFIXES):
            return True
        if lower.endswith('.json') and not lower.startswith('assets/'):
            return True
        if '/../' in f'/{lower}/' or lower.startswith('../'):
            return True
        return False

    def resolve_target(self, rel: str) -> Path | None:
        root = self.serve_root.resolve()
        candidate = (root / rel).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return None
        return candidate


def main() -> None:
    parser = argparse.ArgumentParser(description='Matchday tester server (hardened)')
    parser.add_argument('--port', type=int, default=PORT_DEFAULT)
    parser.add_argument('--bind', default='127.0.0.1')
    args = parser.parse_args()

    serve_from = DIST if use_dist() else ROOT
    TesterHandler.serve_root = serve_from
    TesterHandler.dist_mode = serve_from == DIST

    httpd = ThreadingHTTPServer((args.bind, args.port), TesterHandler)
    mode = 'dist (bundle minificado)' if serve_from == DIST else 'fallback (instale Node e rode npm run build para ocultar fontes)'
    print(f'Matchday tester server em http://{args.bind}:{args.port}/home.html')
    print(f'Modo: {mode}')
    print('Bloqueios: docs, scripts, benchmarks, inspect-save, JSON/MD/logs, query debug')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor encerrado.')


if __name__ == '__main__':
    main()

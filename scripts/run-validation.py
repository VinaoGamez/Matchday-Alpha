#!/usr/bin/env python3
"""Executa validate-game.html e benchmark do motor via Chrome headless."""
import json
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

ROOT = Path(__file__).resolve().parent.parent
BASE = 'http://127.0.0.1:5080'


def make_driver():
    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--window-size=1280,900')
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=opts)


def wait_status(driver, expected, timeout=120):
    WebDriverWait(driver, timeout).until(
        lambda d: d.find_element(By.ID, 'status').text in expected
    )
    return driver.find_element(By.ID, 'status').text


def run_validate_game():
    driver = make_driver()
    try:
        driver.get(f'{BASE}/validate-game.html')
        status = wait_status(driver, {'VALIDATION_OK', 'VALIDATION_FAIL', 'VALIDATION_ERROR'})
        raw = driver.find_element(By.ID, 'out').text
        data = json.loads(raw) if raw.strip() else {}
        return status, data
    finally:
        driver.quit()


def run_engine_benchmark(sample=200):
    driver = make_driver()
    try:
        url = f'{BASE}/benchmark-runner.html?n={sample}&mode=career'
        driver.get(url)
        WebDriverWait(driver, 180).until(
            lambda d: d.title in ('BENCHMARK_DONE', 'BENCHMARK_ERROR')
            or d.find_element(By.ID, 'status').text.startswith('Erro')
            or d.find_element(By.ID, 'status').text == 'Concluído'
        )
        status = driver.title
        if status not in ('BENCHMARK_DONE', 'BENCHMARK_ERROR'):
            status = 'BENCHMARK_DONE' if driver.find_element(By.ID, 'status').text == 'Concluído' else 'BENCHMARK_ERROR'
        raw = driver.find_element(By.ID, 'output').text
        try:
            data = json.loads(raw) if raw.strip() else {'raw': raw}
        except json.JSONDecodeError:
            data = {'raw': raw}
        return status, data
    finally:
        driver.quit()


def check_modules_http():
    import urllib.request

    modules = [
        '/js/main.js',
        '/js/legacy/engine.js',
        '/js/engine/injury.js',
        '/js/engine/match-tuning.js',
    '/js/engine/match-core.js',
    '/js/engine/match-sim.js',
    '/js/engine/match-live.js',
        '/js/feature/messages/index.js',
    ]
    ok = True
    details = []
    for path in modules:
        try:
            with urllib.request.urlopen(BASE + path, timeout=10) as resp:
                passed = resp.status == 200
        except Exception as exc:
            passed = False
            details.append({'path': path, 'ok': False, 'error': str(exc)})
            ok = False
            continue
        details.append({'path': path, 'ok': passed, 'status': 200 if passed else 'fail'})
        if not passed:
            ok = False
    return ok, details


def main():
    print('=== Matchday Fase B — Validação ===\n')

    mod_ok, mod_details = check_modules_http()
    print('Módulos HTTP:')
    for item in mod_details:
        mark = 'OK' if item['ok'] else 'FAIL'
        print(f"  [{mark}] {item['path']}")
    if not mod_ok:
        print('\nFalha: módulos não carregam via HTTP.')
        return 1

    print('\nSuite validate-game.html (35 checks)…')
    t0 = time.time()
    try:
        v_status, v_data = run_validate_game()
    except Exception as exc:
        print(f'ERRO ao executar validate-game: {exc}')
        return 1
    elapsed = time.time() - t0

    checks = v_data.get('checks', [])
    passed = sum(1 for c in checks if c.get('pass'))
    total = len(checks)
    print(f'Status: {v_status} ({passed}/{total} em {elapsed:.1f}s)')

    failed = [c for c in checks if not c.get('pass')]
    if failed:
        print('\nChecks falhos:')
        for c in failed:
            print(f"  - {c.get('name')}: {c.get('detail', '')}")

    if v_data.get('error'):
        print(f"\nErro: {v_data['error']}")

    print('\nBenchmark motor (200 partidas simuladas)…')
    t0 = time.time()
    try:
        b_status, b_data = run_engine_benchmark(200)
    except Exception as exc:
        print(f'ERRO no benchmark: {exc}')
        b_status, b_data = 'BENCHMARK_ERROR', {'error': str(exc)}
    elapsed = time.time() - t0
    print(f'Status: {b_status} ({elapsed:.1f}s)')

    if isinstance(b_data, dict):
        if 'error' in b_data:
            print(f"  Erro: {b_data['error']}")
        summary = b_data.get('summary') or b_data.get('totals') or b_data
        if isinstance(summary, dict):
            for key in ('matches', 'goalsPerMatch', 'drawRate', 'injuries', 'homeWinRate'):
                if key in summary:
                    print(f'  {key}: {summary[key]}')
        exports_ok = b_data.get('exportsOk')
        if exports_ok is not None:
            print(f'  exportsOk: {exports_ok}')

    all_ok = mod_ok and v_status == 'VALIDATION_OK' and b_status == 'BENCHMARK_DONE'
    print('\n' + ('RESULTADO: APROVADO' if all_ok else 'RESULTADO: REPROVADO'))
    return 0 if all_ok else 1


if __name__ == '__main__':
    sys.exit(main())

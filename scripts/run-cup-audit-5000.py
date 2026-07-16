#!/usr/bin/env python3
"""Executa benchmark-cup-divisions.html via Chrome headless.

SEGURANÇA: o padrão é apenas 20 simulações. Valores altos recarregam o motor
completo milhares de vezes e podem travar o Windows. Use --force para >200.
"""
import argparse
import json
import sys
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

ROOT = Path(__file__).resolve().parent.parent
BASE = 'http://127.0.0.1:5080'
SAFE_DEFAULT = 20
HARD_MAX = 200


def make_driver():
    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--window-size=1280,900')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--js-flags=--max-old-space-size=512')
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=opts)


def main():
    parser = argparse.ArgumentParser(description='Auditoria Copa do Brasil por divisão')
    parser.add_argument('sample', nargs='?', type=int, default=SAFE_DEFAULT, help=f'Amostras (padrão {SAFE_DEFAULT})')
    parser.add_argument('--force', action='store_true', help='Permite amostras >200 (risco de travamento)')
    args = parser.parse_args()
    sample = args.sample
    if sample > HARD_MAX and not args.force:
        print(f'AVISO: limite seguro é {HARD_MAX}. Use --force para {sample}. Rodando {HARD_MAX}.')
        sample = HARD_MAX
    confirm = '&confirm=1' if sample > HARD_MAX else ''

    driver = make_driver()
    out_path = ROOT / f'benchmark-cup-divisions-{sample}.json'
    try:
        url = f'{BASE}/benchmark-cup-divisions.html?n={sample}{confirm}'
        print(f'Abrindo {url} …')
        print('O benchmark só inicia após clicar no botão — acionando via script…')
        driver.get(url)
        driver.find_element(By.ID, 'startBtn').click()
        timeout = min(3600, max(120, sample * 8))
        WebDriverWait(driver, timeout).until(
            lambda d: d.title in ('CUP_BENCHMARK_OK', 'CUP_BENCHMARK_FAIL')
        )
        raw = driver.find_element(By.ID, 'output').text
        data = json.loads(raw) if raw.strip() else {}
        out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f'Título: {driver.title}')
        print(f'Salvo: {out_path}')
        totals = data.get('totals', {})
        print(f"OK: {totals.get('ok', 0)} | Falhas: {totals.get('fail', 0)} | Taxa: {data.get('passRate', 0)}%")
        for key, count in sorted(totals.get('anomalies', {}).items(), key=lambda x: -x[1]):
            print(f'  {count}x  {key}')
        for div, block in data.get('divisions', {}).items():
            print(f"Série {div}: {block.get('ok', 0)} OK / {block.get('fail', 0)} fail · Copa: {block.get('everInCup', 0)}/{block.get('runs', 0)}")
        return 0 if driver.title == 'CUP_BENCHMARK_OK' else 1
    except Exception as exc:
        print(f'ERRO: {exc}')
        return 1
    finally:
        driver.quit()


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""40 auditorias Copa — um boot por simulação, timeout generoso."""
import json
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

BASE = 'http://127.0.0.1:5080'
ROOT = Path(__file__).resolve().parent.parent
SAMPLE = 40
DIVISIONS = ['A', 'B', 'C', 'D']
CLUB_NAMES = {'A': 'Atlético Fênix', 'B': 'Vinas FC B', 'C': 'Vinas FC C', 'D': 'Vinas FC'}


def make_driver():
    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--js-flags=--max-old-space-size=512')
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=opts)


def audit_one(division, seed):
    driver = make_driver()
    try:
        career = {
            'seed': seed,
            'clubName': CLUB_NAMES[division],
            'managerName': 'Auditor',
            'division': division,
            'clubStatus': {'environment': 70, 'support': 70, 'board': 70, 'finances': 70},
            'season': 2026,
            'version': 4,
            'createdAt': '2026-01-01T00:00:00Z',
        }
        driver.get(BASE + '/index.html')
        driver.execute_script(
            'localStorage.setItem("matchday-new-game", arguments[0]);'
            'localStorage.removeItem("matchday-season");'
            'localStorage.removeItem("matchday-live-match");',
            json.dumps(career),
        )
        t0 = time.time()
        driver.get(f'{BASE}/index.html?cupAudit=1&engineTest&_={seed}')
        for _ in range(200):
            title = driver.title
            if title in ('CUP_AUDIT_OK', 'CUP_AUDIT_FAIL'):
                raw = driver.find_element(By.ID, 'cup-audit-json').text
                data = json.loads(raw)
                data['_elapsedSec'] = round(time.time() - t0, 2)
                return data
            time.sleep(0.15)
        err = driver.execute_script('return document.documentElement.dataset.bootError || ""')
        raise RuntimeError(f'timeout bootError={err[:120]}')
    finally:
        driver.quit()


def main():
    per_div = SAMPLE // len(DIVISIONS)
    summary = {
        'sampleSize': SAMPLE,
        'perDivision': per_div,
        'divisions': {d: {'runs': 0, 'ok': 0, 'fail': 0, 'everInCup': 0, 'entryPath': {}, 'anomalies': {}} for d in DIVISIONS},
        'totals': {'ok': 0, 'fail': 0, 'anomalies': {}},
        'samples': [],
    }
    started = time.time()
    for i in range(SAMPLE):
        division = DIVISIONS[i % len(DIVISIONS)]
        if i // len(DIVISIONS) >= per_div:
            continue
        seed = 900000 + i
        print(f'[{i + 1}/{SAMPLE}] Série {division} seed {seed}…', flush=True)
        try:
            audit = audit_one(division, seed)
            block = summary['divisions'][division]
            block['runs'] += 1
            if audit.get('everInCup'):
                block['everInCup'] += 1
            path = audit.get('entryPath')
            if path:
                block['entryPath'][path] = block['entryPath'].get(path, 0) + 1
            if audit.get('anomalies'):
                summary['totals']['fail'] += 1
                block['fail'] += 1
                for a in audit['anomalies']:
                    summary['totals']['anomalies'][a] = summary['totals']['anomalies'].get(a, 0) + 1
                    block['anomalies'][a] = block['anomalies'].get(a, 0) + 1
                if len(summary['samples']) < 15:
                    summary['samples'].append(audit)
            else:
                summary['totals']['ok'] += 1
                block['ok'] += 1
            print(f"  -> {path or '-'} | Copa: {audit.get('everInCup')} | {audit.get('anomalies') or 'OK'}", flush=True)
        except Exception as exc:
            summary['totals']['fail'] += 1
            summary['divisions'][division]['fail'] += 1
            summary['divisions'][division]['runs'] += 1
            key = f'boot_error:{str(exc)[:80]}'
            summary['totals']['anomalies'][key] = summary['totals']['anomalies'].get(key, 0) + 1
            print(f'  -> ERRO: {exc}', flush=True)
        time.sleep(0.3)

    summary['elapsedMs'] = round((time.time() - started) * 1000)
    summary['passRate'] = round(summary['totals']['ok'] / SAMPLE * 100, 2)
    out = ROOT / 'benchmark-cup-divisions-40.json'
    out.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'\nSalvo: {out}')
    print(f"OK: {summary['totals']['ok']} | Falhas: {summary['totals']['fail']} | {summary['passRate']}%")
    for d, b in summary['divisions'].items():
        print(f"  Série {d}: {b['ok']}/{b['runs']} OK · entrou Copa {b['everInCup']}/{b['runs']} · vias {b['entryPath']}")
    if summary['totals']['anomalies']:
        print('Anomalias:')
        for k, v in sorted(summary['totals']['anomalies'].items(), key=lambda x: -x[1]):
            print(f'  {v}x {k}')


if __name__ == '__main__':
    main()

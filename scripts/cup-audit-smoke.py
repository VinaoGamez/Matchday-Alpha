#!/usr/bin/env python3
import json
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

BASE = 'http://127.0.0.1:5080'


def run_one(division='D', seed=900001):
    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--no-sandbox')
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
    try:
        names = {'A': 'Atlético Fênix', 'B': 'Vinas FC B', 'C': 'Vinas FC C', 'D': 'Vinas FC'}
        career = {
            'seed': seed,
            'clubName': names[division],
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
        driver.get(f'{BASE}/index.html?cupAudit=1&engineTest')
        for _ in range(200):
            title = driver.title
            if title in ('CUP_AUDIT_OK', 'CUP_AUDIT_FAIL'):
                raw = driver.find_element(By.ID, 'cup-audit-json').text
                return json.loads(raw), round(time.time() - t0, 2)
            time.sleep(0.15)
        err = driver.execute_script('return document.documentElement.dataset.bootError || ""')
        raise RuntimeError(f'timeout title={driver.title} bootError={err[:200]}')
    finally:
        driver.quit()


if __name__ == '__main__':
    for div in 'ABCD':
        audit, elapsed = run_one(div, 900000 + ord(div))
        print(div, elapsed, 's', audit.get('entryPath'), audit.get('anomalies'), 'everInCup', audit.get('everInCup'))

import json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

opts = Options()
opts.add_argument('--headless=new')
opts.add_argument('--disable-gpu')
opts.add_argument('--no-sandbox')
driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
try:
    driver.get('http://127.0.0.1:5080/benchmark-runner.html?n=50&mode=career')
    WebDriverWait(driver, 120).until(
        lambda d: d.title in ('BENCHMARK_DONE', 'BENCHMARK_ERROR')
        or 'Erro' in d.find_element(By.ID, 'status').text
        or d.find_element(By.ID, 'status').text == 'Concluído'
    )
    print('title:', driver.title)
    print('status:', driver.find_element(By.ID, 'status').text)
    print('output:', driver.find_element(By.ID, 'output').text[:3000])
    # check iframe boot error
    driver.switch_to.frame(driver.find_element(By.ID, 'game'))
    err = driver.execute_script('return document.documentElement.dataset.bootError || null')
    exports = driver.execute_script('return !!window.__matchdayEngineExports?.simulateRoundMatch')
    print('bootError:', err)
    print('simulateRoundMatch:', exports)
finally:
    driver.quit()

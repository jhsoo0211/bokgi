/* 시안 화면(보충자료/mockups.html)의 .screen 요소를 하나씩 PNG로 저장한다(읽기 전용, 서버 필요 없음).
   루트에서: node contest/hana-2026/scripts/mockups.mjs
   결과: contest/hana-2026/보충자료/mock/S1.png ~ S8.png (360×760, 3배 해상도) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(path.join(ROOT, 'web', 'package.json'));
const { chromium } = require('@playwright/test');
const SRC = path.resolve(HERE, '..', '보충자료', 'mockups.html');
const OUT = path.resolve(HERE, '..', '보충자료', 'mock');
fs.mkdirSync(OUT, { recursive: true });

let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
try {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1800 }, deviceScaleFactor: 3 });
  await page.goto(pathToFileURL(SRC).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const ids = await page.$$eval('.screen', (els) => els.map((e) => e.id));
  for (const id of ids) {
    // 화면 안에서 넘친 요소(본문 영역 밖으로 나간 것)를 알려 준다
    const over = await page.$eval(`#${id}`, (s) => {
      const r = s.getBoundingClientRect();
      return [...s.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.bottom > r.bottom - 9 || b.right > r.right - 9) && !e.closest('.dim,.mark,.sheet'); })
        .map((e) => (e.className || e.tagName).toString().slice(0, 20) + ':' + (e.innerText || '').slice(0, 16)).slice(0, 4);
    });
    await page.locator(`#${id}`).screenshot({ path: path.join(OUT, `${id}.png`), omitBackground: true });
    console.log('saved', id, over.length ? `넘침 ${JSON.stringify(over)}` : '');
  }
} finally {
  await browser.close();
}

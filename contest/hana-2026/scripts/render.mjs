/* 보충자료 HTML → 제출용 PDF(A4 가로) + 쪽별 미리보기 PNG.
   루트에서: node contest/hana-2026/scripts/render.mjs [--src 보충자료/파일.html] [--out 파일.pdf] [미리보기 폴더]
   기본: 보충자료/보충자료.html → 지원자명_투자형듀오링고복기_보충자료.pdf(기획 3쪽)
   UI 시안: --src 보충자료/ui-board.html --out 지원자명_투자형듀오링고복기_UI시안.pdf
   '지원자명'은 제출 전에 바꾼다. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(path.join(ROOT, 'web', 'package.json'));
const { chromium } = require('@playwright/test');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); if (i === -1) return fallback; const v = args[i + 1]; args.splice(i, 2); return v; };
const SRC = path.resolve(HERE, '..', opt('--src', path.join('보충자료', '보충자료.html')));
const PDF = path.resolve(HERE, '..', opt('--out', '지원자명_투자형듀오링고복기_보충자료.pdf'));
const PREVIEW = args[0];

let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
try {
  const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(SRC).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  // 넘침 검사: 각 쪽 안의 요소가 쪽 밖으로 나가지 않는지
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => {
    const pr = p.getBoundingClientRect();
    const foot = p.querySelector('.foot');
    const limit = foot ? foot.getBoundingClientRect().top - 1 : pr.bottom - 2;
    const out = [...p.querySelectorAll('*')].filter((e) => { if (foot && foot.contains(e)) return false; const r = e.getBoundingClientRect(); return r.width && (r.bottom > limit || r.right > pr.right - 30); })
      .map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]} "${(e.innerText || '').slice(0, 24).replace(/\s+/g, ' ')}"`);
    const clipped = [...p.querySelectorAll(':scope > *:not(.foot), .page > .grid > *, .box, .mock, .sheet')].filter((e) => e.scrollHeight > e.clientHeight + 1)
      .map((e) => `${e.className.split(' ')[0]} "${(e.innerText || '').slice(0, 24).replace(/\s+/g, ' ')}" +${e.scrollHeight - e.clientHeight}px`);
    return { page: i + 1, out: out.slice(0, 8), clipped: clipped.slice(0, 8) };
  }));
  console.log(JSON.stringify(overflow, null, 1));
  if (PREVIEW) {
    fs.mkdirSync(PREVIEW, { recursive: true });
    const pages = await page.$$('.page');
    for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(PREVIEW, `page${i + 1}.png`) });
  }
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: PDF, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
  console.log('pdf', PDF, fs.statSync(PDF).size, 'bytes');
} finally {
  await browser.close();
}

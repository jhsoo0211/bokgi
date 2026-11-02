/* 공모전 보충자료용 화면 캡처(읽기 전용). 복기 웹앱을 목 모드로 띄운 뒤 실행한다.
   web/에서:  NEXT_PUBLIC_USE_MOCK=1 npx next dev -p 3310
   루트에서:  BASE=http://localhost:3310 node contest/hana-2026/scripts/capture.mjs
   결과: contest/hana-2026/보충자료/screens/*.jpg (380×760, 2배 해상도). 화면의 카드 자료는 예시 데이터다.
   상태 주입·선택자는 web/tests/e2e/helpers.ts·ux-audit.mjs와 같다. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const require = createRequire(path.join(ROOT, 'web', 'package.json'));
const { chromium } = require('@playwright/test');
const BASE = process.env.BASE || 'http://localhost:3310';
const OUT = path.resolve(HERE, '..', '보충자료', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const MOCK_KEY = 'bokgi.mock.v1';
const CASE = { c1: '9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a01', c2: '9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a02', c3: '9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a03' };
const GROUPS = ['marketLine', 'volume', 'growthDetail', 'healthBasic', 'valuationDetail', 'healthDetail', 'allNotes', 'fxCommodity', 'riskChips'];
const PRESET = {
  basic: Object.fromEntries(GROUPS.map((g) => [g, false])),
  standard: { marketLine: true, volume: true, growthDetail: true, healthBasic: true, valuationDetail: false, healthDetail: false, allNotes: true, fxCommodity: false, riskChips: true },
  advanced: Object.fromEntries(GROUPS.map((g) => [g, true])),
};
const prefsOf = (lv) => ({ infoLevel: lv, panelPrefs: PRESET[lv], undoSeconds: 2.5 });

const dk = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(12, 0, 0, 0); return x; };
let jn = 0;
const mkJ = (caseId, at, ev, conf, state, hit, opts = {}) => ({
  id: `00000000-0000-4000-8000-${String(++jn).padStart(12, '0')}`, caseId, caseVersion: 1, keyEvidenceId: 'ev1', keyEvidence: ev,
  riskId: null, risk: null, direction: 'outperform', confidence: conf, recognized: !!opts.recognized, panelsViewed: ['numbers'], gesture: { via: 'button' }, isExtra: false,
  createdAt: at.toISOString(), localDate: dk(at), revealedAt: at.toISOString(), selfCheck: opts.self || null,
  result: { relativePp: state === 'even' ? 0.5 : hit ? 3 : -3, state, hit },
});
const baseState = (judgments, extra = {}) => ({ v: 1, onboarded: true, judgments, progress: {}, attempts: [], sessions: {}, reports: [], events: [], ...extra });
function journal24() {
  const cases = [CASE.c1, CASE.c2, CASE.c3];
  const out = [mkJ(CASE.c1, daysAgo(4), '매출 +23%', 3, 'behind', false), mkJ(CASE.c2, daysAgo(2), '부채비율 88%', 4, 'ahead', true, { self: 'o' }), mkJ(CASE.c3, daysAgo(1), 'PER 24 vs 21', 2, 'even', null, { self: 'tri' })];
  const evs = ['매출 +23%', 'PER 38 vs 27', '부채비율 88%', '가이던스 하향'];
  for (let i = 0; i < 21; i++) {
    const state = i % 6 === 0 ? 'even' : i % 2 ? 'ahead' : 'behind';
    out.push(mkJ(cases[i % 3], daysAgo(30 - i), evs[i % 4], 5, state, state === 'even' ? null : i % 3 === 1, { recognized: i % 5 === 0 }));
  }
  return out;
}

async function launch() {
  try { return await chromium.launch(); } catch { return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
}
async function newPage(browser, { onboarded = true, state = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 380, height: 760 }, deviceScaleFactor: 2, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
  await ctx.addInitScript(({ onboarded, state, MOCK_KEY }) => {
    const hide = () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.documentElement.appendChild(s); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hide); else hide();
    try {
      if (sessionStorage.getItem('__inited')) return;
      sessionStorage.setItem('__inited', '1');
      localStorage.clear();
      if (onboarded) localStorage.setItem('bokgi.onboarded', '1');
      if (state) localStorage.setItem(MOCK_KEY, JSON.stringify(state));
    } catch { /* 무시 */ }
  }, { onboarded, state, MOCK_KEY });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  return { ctx, page };
}
const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86, ...opts });
  console.log('saved', name);
};
const tab = async (page, panel) => { await page.click(`#stage .sc:last-child .panel-tabs button[data-panel="${panel}"]`); await page.waitForTimeout(150); };
const openGate = async (page, ev = 0, conf = 3) => { await page.locator('#ev .ds-chip').nth(ev).click(); await page.locator('#conf button').nth(conf - 1).click(); };

const browser = await launch();
try {
  // 1. 온보딩 넷째 장 — 정보 수준 고르기
  {
    const { ctx, page } = await newPage(browser, { onboarded: false });
    await page.goto(BASE); await page.waitForSelector('#onb-next');
    for (let i = 0; i < 3; i++) await page.click('#onb-next');
    await page.waitForSelector('.onb-opt');
    await shot(page, '01-onboarding-level');
    await ctx.close();
  }
  // 2. 중급: 세 판(흐름·숫자·그때), 정보 수준 시트, 근거 게이트 → 공개 → 오늘 끝 → 개념 길
  {
    const { ctx, page } = await newPage(browser, { state: baseState([], { prefs: prefsOf('standard') }) });
    await page.goto(BASE); await page.waitForSelector('#stage .sc');
    await tab(page, 'flow'); await shot(page, '02-card-flow');
    await tab(page, 'numbers'); await shot(page, '03-card-numbers');
    await tab(page, 'then'); await shot(page, '04-card-then');
    await tab(page, 'numbers');
    await page.click('#info-level'); await page.waitForSelector('.sheet--lv');
    await shot(page, '05-info-level-sheet');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await openGate(page, 0, 3);
    const risk = page.locator('#risk .ds-chip');
    if (await risk.count()) await risk.first().click();
    await page.locator('#gate, #ev').first().scrollIntoViewIfNeeded();
    await page.evaluate(() => { const g = document.querySelector('#ev'); if (g) window.scrollTo(0, g.getBoundingClientRect().top + scrollY - 120); });
    await shot(page, '06-gate');
    await page.click('#btnR'); await page.mouse.move(2, 2);
    await page.waitForSelector('#toast #now'); await page.click('#toast #now');
    await page.waitForSelector('#explain .ex-line'); await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '07-reveal-top');
    await shot(page, '07-reveal-full', { fullPage: true });
    await page.locator('#explain').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    await page.locator('#explain').screenshot({ path: path.join(OUT, '07-explain.jpg'), type: 'jpeg', quality: 88 });
    console.log('saved', '07-explain');
    await page.click('#next'); await page.waitForSelector('#stage .sc');
    await openGate(page, 2, 4); await page.click('#btnL'); await page.mouse.move(2, 2); await page.click('#toast #now');
    await page.waitForSelector('#explain .ex-line'); await page.click('#next'); await page.waitForSelector('#stage .sc');
    await openGate(page, 0, 2); await page.click('#btnR'); await page.mouse.move(2, 2); await page.click('#toast #now');
    await page.waitForSelector('#explain .ex-line'); await page.click('#next');
    await page.waitForSelector('.done-title');
    await shot(page, '08-done');
    await page.click('#nav button[data-v="concepts"]'); await page.waitForSelector('#cpath');
    await shot(page, '09-concepts-path');
    await ctx.close();
  }
  // 3. 숫자 판 깊이 비교 — 초급 「핵심만」 vs 고급 「전부」
  for (const lv of ['basic', 'advanced']) {
    const { ctx, page } = await newPage(browser, { state: baseState([], { prefs: prefsOf(lv) }) });
    await page.goto(BASE); await page.waitForSelector('#stage .sc');
    await tab(page, 'numbers');
    await shot(page, `10-numbers-${lv}`);
    await page.locator('#stage .sc:last-child').screenshot({ path: path.join(OUT, `10-numbers-${lv}-card.jpg`), type: 'jpeg', quality: 88 });
    console.log('saved', `10-numbers-${lv}-card`);
    await ctx.close();
  }
  // 4. 일지 24장 — 연습 달력·인사이트(통계 펼침)
  {
    const { ctx, page } = await newPage(browser, { state: baseState(journal24(), { prefs: prefsOf('standard') }) });
    await page.goto(BASE); await page.waitForSelector('.done-title, #stage .sc');
    await page.click('#nav button[data-v="journal"]'); await page.waitForSelector('details.stats');
    await shot(page, '11-journal');
    await page.click('details.stats summary');
    await page.evaluate(() => { const s = document.querySelector('details.stats'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 16); });
    await shot(page, '12-journal-insights');
    await ctx.close();
  }
} finally {
  await browser.close();
}

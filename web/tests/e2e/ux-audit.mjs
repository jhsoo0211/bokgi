/* 복기 웹앱 UX 감사 하네스(읽기 전용). 목 모드 dev 서버를 대상으로 화면 16가지 상태를 돌며 잰다:
   누르는 자리(가상 요소 포함, 0.25px 단위), Tab 이동 중 초점 링·가림(고정·sticky 요소), axe(WCAG 2.x A·AA + best-practice),
   제목 구조, 화면당 주 버튼 수, 첫 화면에서 눈이 먼저 가는 글자, 320·380·430 너비 넘침, 긴 글자, 글자 200%, 느린 네트워크,
   모션 감소, 터치 스와이프, 되돌리기 뒤 초점, 붙는 주 행동 막대.
   실행(web/에서, 목 모드 dev 서버가 떠 있을 때):
     NEXT_PUBLIC_USE_MOCK=1 npx next dev -p 3310   # 한 폴더에 하나만
     BASE=http://localhost:3310 node tests/e2e/ux-audit.mjs <label>
   결과: .next/ux-audit/<label>.json + 화면 사진(png) + 요약 stdout. Playwright 시험(*.spec.ts)이 아니라 e2e 실행에는 끼지 않는다.
   2026-10-04 감사 보고서: ../docs/reviews/2026-10-04_ecc_ux_review_webapp.md (prototype/tests/audit.cjs를 React 앱·주입 상태에 맞게 옮김)
   2026-10-04 2차(D16·D17): 온보딩 넷째 장(정보 수준)·정보 수준 설정 시트·개념 길(기본 보기)·목록 전환도 같은 측정을 거친다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AXE = fs.readFileSync(path.join(WEB, 'node_modules/axe-core/axe.min.js'), 'utf8');
const BASE = process.env.BASE || 'http://localhost:3310';
if (/:(3000|3100|3120|3210)\b/.test(BASE)) { console.error('이 포트는 다른 서비스(운영·시험 서버) 자리라 쓰지 않는다 — 목 모드 dev 서버(예: 3310)를 지정하세요'); process.exit(2); }
const LABEL = process.argv[2] || 'before';
const OUT = path.join(WEB, '.next', 'ux-audit'); fs.mkdirSync(OUT, { recursive: true });
const MOCK_KEY = 'bokgi.mock.v1';
const CASE = { c1: '9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a01', c2: '9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a02', c3: '9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a03', c4: '9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a04' };
const R = { label: LABEL, screens: {}, motion: {}, viewports: {}, long: {}, text200: {}, slow: {}, ptr: {}, flows: {}, errors: [] };
const errs = [];

/* ---------- 브라우저 쪽 측정 함수 ---------- */
const INTERACTIVE = 'button, a[href], input:not([type=hidden]), textarea, select, summary, [role=button], [tabindex]:not([tabindex="-1"])';
const HIT_FN = `(sel) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert],[aria-hidden="true"],.sr-only'); };
  const targets = [...new Set([...document.querySelectorAll(sel)].map(e => (e.matches('input') && e.closest('label')) ? e.closest('label') : e))].filter(vis);
  return targets.map(el => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const inEl = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t) || (t.closest && t.closest('label') === el)); };
    const scan = (dx, dy, max) => { let d = 0; while (d < max && inEl(cx + dx * (d + 0.25), cy + dy * (d + 0.25))) d += 0.25; return d; };
    const lim = 60;
    const hitH = scan(0, -1, r.height / 2 + lim) + scan(0, 1, r.height / 2 + lim), hitW = scan(-1, 0, r.width / 2 + lim) + scan(1, 0, r.width / 2 + lim);
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 18);
    const id = el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase());
    return { id, name, w: +r.width.toFixed(1), h: +r.height.toFixed(1), hitW: +hitW.toFixed(1), hitH: +hitH.toFixed(1) };
  });
}`;
const FOCUS_DESC = `() => {
  const e = document.activeElement; if (!e || e === document.body) return { d: 'BODY' };
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  let covered = 0, by = '';
  for (const o of document.querySelectorAll('body *')) {
    if (o === e || o.contains(e) || e.contains(o)) continue;
    const p = getComputedStyle(o).position; if (p !== 'fixed' && p !== 'sticky') continue;
    if (!o.textContent.trim() && !o.querySelector('button')) continue;
    const b = o.getBoundingClientRect();
    if (b.bottom > r.top + 0.5 && b.top < r.bottom - 0.5 && b.right > r.left && b.left < r.right) {
      const ov = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (ov > covered) { covered = ov; by = o.id || o.className || o.tagName; }
    }
  }
  const tag = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '');
  return { d: tag + ' "' + (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 16) + '"', fv: e.matches(':focus-visible'), outline: cs.outlineStyle + ' ' + cs.outlineWidth, h: +r.height.toFixed(1), covered: +covered.toFixed(1), coveredBy: String(by).slice(0, 20), fullyCovered: covered >= r.height - 0.5 };
}`;
const HEADINGS = () => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => !h.closest('[hidden],[aria-hidden="true"],[inert]')).map(h => `${h.tagName}:${(h.textContent || '').trim().slice(0, 14)}`);
const FIRST_INFO = () => {
  // 첫 화면(아래 탭 위)에서 눈이 먼저 가는 곳: 보이는 글자 요소를 크기·굵기로 줄 세운 상위 4개 + 머리줄 아래 첫 글자 블록
  const nav = document.querySelector('#nav'), bottom = nav && !nav.hidden ? nav.getBoundingClientRect().top : innerHeight;
  const out = [];
  for (const e of document.querySelectorAll('#view *')) {
    if (e.closest('.sr-only,[aria-hidden="true"]') || e.closest('#stage .sc:not(:last-child)')) continue;
    const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
    if (!own) continue;
    const r = e.getBoundingClientRect(); if (!r.width || r.top >= bottom || r.bottom <= 0) continue;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fs = parseFloat(cs.fontSize), fw = +cs.fontWeight;
    out.push({ t: own.slice(0, 22), top: Math.round(r.top), fs, fw, score: fs * (fw >= 600 ? 1.25 : 1) });
  }
  const top = [...out].sort((a, b) => b.score - a.score || a.top - b.top).slice(0, 4);
  const topBar = document.querySelector('#view .ds-bar, #view .top');
  const below = topBar ? topBar.getBoundingClientRect().bottom : 0;
  const firstBlock = out.filter(x => x.top >= below - 1).sort((a, b) => a.top - b.top)[0] || null;
  return { biggest: top.map(x => `${x.t}(${x.fs}/${x.fw}@${x.top})`), firstBelowHeader: firstBlock && `${firstBlock.t}@${firstBlock.top}` };
};
const PRIMARIES = () => [...document.querySelectorAll('.ds-btn--primary')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('[inert],[aria-hidden="true"]')).map(e => (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 14));
const OVERFLOW = () => {
  const phone = document.querySelector('.phone').getBoundingClientRect(), out = [];
  document.querySelectorAll('.phone *, .sheet *').forEach(e => {
    if (e.closest('#stage .sc:not(:last-child)') || e.closest('.sc-stamp') || e.closest('.sr-only')) return;
    const r = e.getBoundingClientRect(); if (!r.width) return;
    if (r.right > phone.right + 0.5 || r.left < phone.left - 0.5) out.push(`${e.tagName.toLowerCase()}.${(e.className && typeof e.className === 'string' ? e.className : '').split(' ')[0]} ${Math.round(r.right - phone.right)}px`);
  });
  const clipped = [];
  document.querySelectorAll('.phone *').forEach(e => {
    const cs = getComputedStyle(e);
    if (!/(hidden|clip)/.test(cs.overflowX + cs.overflowY) || e.closest('.sr-only') || e.closest('#stage .sc:not(:last-child)')) return;
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) clipped.push(`${e.tagName.toLowerCase()}.${(e.className && typeof e.className === 'string' ? e.className : '').split(' ')[0]} ${e.scrollWidth}x${e.scrollHeight}>${e.clientWidth}x${e.clientHeight}`);
  });
  const panel = document.querySelector('#stage .sc:last-child .panel');
  return { docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, offenders: [...new Set(out)].slice(0, 10), clipped: [...new Set(clipped)].slice(0, 8), panelClient: panel ? panel.clientHeight : null, panelScroll: panel ? panel.scrollHeight : null, panelXScroll: panel ? panel.scrollWidth - panel.clientWidth : null };
};
const TEXT200 = () => {
  const els = [...document.querySelectorAll('body *')];
  const vals = els.map(e => { const cs = getComputedStyle(e); return [e, parseFloat(cs.fontSize), cs.lineHeight]; });
  vals.forEach(([e, fs, lh]) => { e.style.fontSize = (fs * 2) + 'px'; if (/px$/.test(lh)) e.style.lineHeight = (parseFloat(lh) * 2) + 'px'; });
};

function watch(page) {
  page.on('console', m => { if (m.type() === 'error') errs.push(`console.${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
}
async function hideOverlay(ctx) {
  await ctx.addInitScript(() => {
    const hide = () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal{display:none!important}'; document.documentElement.appendChild(s); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hide); else hide();
  });
}
async function newPage(browser, { vw = 380, vh = 760, onboarded = true, state = null, kv = {}, reduced = false, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: reduced ? 'reduce' : 'no-preference', hasTouch: touch, isMobile: touch });
  await hideOverlay(ctx);
  await ctx.addInitScript(({ onboarded, state, kv, MOCK_KEY }) => {
    try {
      if (sessionStorage.getItem('__inited')) return;
      sessionStorage.setItem('__inited', '1');
      localStorage.clear();
      if (onboarded) localStorage.setItem('bokgi.onboarded', '1');
      if (state) localStorage.setItem(MOCK_KEY, JSON.stringify(state));
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    } catch { /* 저장소를 못 쓰면 주입 없이 */ }
  }, { onboarded, state, kv, MOCK_KEY });
  const page = await ctx.newPage(); watch(page);
  return { ctx, page };
}
async function hits(page, sel = INTERACTIVE) {
  const r = await page.evaluate(`(${HIT_FN})(${JSON.stringify(sel)})`);
  await page.evaluate(() => window.scrollTo(0, 0));
  return r;
}
async function tabWalk(page, n) {
  await page.evaluate(() => { const v = document.getElementById('view'); window.scrollTo(0, 0); if (v) v.focus({ preventScroll: true }); else if (document.activeElement) document.activeElement.blur(); });
  const out = [];
  for (let i = 0; i < n; i++) { await page.keyboard.press('Tab'); out.push(await page.evaluate(`(${FOCUS_DESC})()`)); }
  await page.evaluate(() => window.scrollTo(0, 0));
  return out;
}
async function axe(page) {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const un = document.createElement('style'); un.textContent = '#nav{position:static!important}'; document.head.appendChild(un);
    const r = await window.axe.run({ exclude: [['nextjs-portal']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    un.remove();
    return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, t: v.nodes.slice(0, 3).map(x => x.target.join(' ')) }));
  });
}
async function axTree(page, words) {
  const c = await page.context().newCDPSession(page);
  const { nodes } = await c.send('Accessibility.getFullAXTree');
  await c.detach();
  const vis = nodes.filter(n => !n.ignored);
  return {
    leaks: vis.filter(n => n.name && words.includes(String(n.name.value).trim())).map(n => `${n.role && n.role.value}:${n.name.value}`),
    roles: vis.filter(n => ['radiogroup', 'radio', 'progressbar', 'status', 'alert', 'dialog', 'region', 'navigation', 'main', 'group'].includes(n.role && n.role.value)).map(n => `${n.role.value}:${(n.name && n.name.value || '').slice(0, 20)}`),
  };
}
async function screen(page, key, extra = {}) {
  const s = { headings: await page.evaluate(HEADINGS), primaries: await page.evaluate(PRIMARIES), first: await page.evaluate(FIRST_INFO), hits: await hits(page), axe: await axe(page), ...extra };
  await page.screenshot({ path: `${OUT}/${LABEL}-${key}.png` });
  R.screens[key] = Object.assign(R.screens[key] || {}, s);
  return R.screens[key];
}

/* ---------- 주입 상태 ---------- */
const dk = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(12, 0, 0, 0); return x; };
let jn = 0;
const mkJ = (caseId, at, ev, conf, state, hit, opts = {}) => ({
  id: `00000000-0000-4000-8000-${String(++jn).padStart(12, '0')}`, caseId, caseVersion: 1, keyEvidenceId: 'ev1', keyEvidence: ev,
  riskId: null, risk: null, direction: 'outperform', confidence: conf, recognized: !!opts.recognized, panelsViewed: ['numbers'], gesture: { via: 'button' }, isExtra: false,
  createdAt: at.toISOString(), localDate: dk(at), revealedAt: opts.pending ? null : at.toISOString(), selfCheck: opts.self || null,
  result: opts.pending ? null : { relativePp: state === 'even' ? 0.5 : hit ? 3 : -3, state, hit },
});
const baseState = (judgments, extra = {}) => ({ v: 1, onboarded: true, judgments, progress: {}, attempts: [], sessions: {}, reports: [], events: [], ...extra });
function injected24() {
  const cases = [CASE.c1, CASE.c2, CASE.c3];
  const out = [mkJ(CASE.c1, daysAgo(4), '매출 +23%', 3, 'behind', false), mkJ(CASE.c2, daysAgo(2), '부채비율 88%', 4, 'ahead', true, { self: 'o' }), mkJ(CASE.c3, daysAgo(1), 'PER 24 vs 21', 2, 'even', null, { self: 'tri' })];
  const evs = ['매출 +23%', 'PER 38 vs 27', '부채비율 88%', '가이던스 하향'];
  for (let i = 0; i < 21; i++) {
    const state = i % 6 === 0 ? 'even' : i % 2 ? 'ahead' : 'behind';
    out.push(mkJ(cases[i % 3], daysAgo(30 - i), evs[i % 4], 5, state, state === 'even' ? null : i % 3 === 1, { recognized: i % 5 === 0 }));
  }
  return out;
}
const todayKey = dk(new Date());
const yesterdayKey = dk(daysAgo(1));
/** 오늘 세트 3장을 모두 판단·공개한 상태(+ 선택: 복습 기한) */
function setDoneState(progress = {}) {
  const now = new Date();
  const js = [mkJ(CASE.c1, now, '매출 +23%', 3, 'behind', false), mkJ(CASE.c2, now, '부채비율 88%', 4, 'ahead', true), mkJ(CASE.c3, now, 'PER 24 vs 21', 2, 'even', null)];
  return baseState(js, { progress, sessions: { [todayKey]: { cards: [CASE.c1, CASE.c2, CASE.c3] } } });
}

const openGate = async (page, ev = 0, conf = 3) => { await page.click(`#ev .ds-chip >> nth=${ev}`); await page.click(`#conf button >> nth=${conf - 1}`); };

(async () => {
  const browser = await chromium.launch();
  try {
    /* ===== 1. 온보딩 ===== */
    {
      const { ctx, page } = await newPage(browser, { onboarded: false });
      await page.goto(BASE); await page.waitForSelector('#onb-next');
      await screen(page, 'onboarding1');
      R.screens.onboarding1.tab = await tabWalk(page, 3);
      await page.click('#onb-next'); await page.click('#onb-next');
      await screen(page, 'onboarding3');
      await page.click('#onb-next');
      await page.waitForSelector('.onb-opt'); await page.waitForTimeout(100);
      await screen(page, 'onboarding4-level', { tab: await tabWalk(page, 3) });
      await page.click('.onb-opt[data-level="standard"]');
      await page.waitForSelector('#stage .sc');
      await ctx.close();
    }

    /* ===== 2. 카드(판단 전) → 게이트 → 알림 → 공개 → 신고 시트 ===== */
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE); await page.waitForSelector('#stage .sc');
      await page.waitForTimeout(150);
      const s = await screen(page, 'card', { tab: await tabWalk(page, 26) });
      s.ax = await axTree(page, ['잘했다', '못했다', '앞섰다', '뒤졌다']);
      s.layout = await page.evaluate(() => {
        const y = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
        return { stageTop: y('#stage'), gateTop: y('#gate'), evTop: y('#ev'), confTop: y('#conf'), btnTop: y('#btnR'), docH: document.documentElement.scrollHeight, vh: innerHeight, primaryBtnL: document.querySelector('#btnL').className, primaryBtnR: document.querySelector('#btnR').className, streak: document.querySelector('.ds-streak')?.innerText, top: document.querySelector('.top')?.innerText.replace(/\s+/g, ' ') };
      });
      s.ptr = await page.evaluate(() => {
        const st = document.querySelector('#stage'), cs = (e) => getComputedStyle(e);
        const isScroller = (e) => /(auto|scroll)/.test(cs(e).overflowY);
        return { html: cs(document.documentElement).overscrollBehaviorY, body: cs(document.body).overscrollBehaviorY, stage: cs(st).overscrollBehaviorY, stageIsScroller: isScroller(st), panel: cs(document.querySelector('#stage .sc:last-child .panel')).overscrollBehaviorY, scrollingElement: document.scrollingElement.tagName };
      });
      // 정보 수준 설정 시트(공용 Sheet)
      await page.click('#info-level'); await page.waitForSelector('.sheet--lv'); await page.waitForTimeout(150);
      await screen(page, 'info-level-sheet');
      await page.keyboard.press('Escape');
      // 게이트 막힘(버튼)
      await page.locator('#btnR').click({ force: true });
      s.blocked = await page.evaluate(() => ({ hint: document.querySelector('#hint').innerText, shake: document.querySelector('#ev').className, focus: document.activeElement.id }));
      // 판단 → 알림
      await openGate(page, 0, 3);
      await page.click('#btnR');
      await page.mouse.move(2, 2);
      await page.waitForSelector('#toast #now');
      const t = await screen(page, 'toast');
      t.toast = await page.evaluate(() => {
        const to = document.querySelector('#toast').getBoundingClientRect(), nav = document.querySelector('#nav').getBoundingClientRect();
        // 알림이 덮는 컨트롤(아래 탭 위 영역)
        const covered = [...document.querySelectorAll('#view button, #view input, #view summary')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.bottom > to.top && r.top < to.bottom && !document.querySelector('#toast').contains(e); }).map(e => e.id || e.innerText.trim().slice(0, 10));
        return { text: document.querySelector('#toast').innerText.replace(/\s+/g, ' '), top: Math.round(to.top), bottom: Math.round(to.bottom), navTop: Math.round(nav.top), gap: Math.round(nav.top - to.bottom), covered, role: document.querySelector('#toast').getAttribute('role') };
      });
      t.toastHits = await hits(page, '#toast button');
      await page.click('#toast #now');
      await page.waitForSelector('#explain .ex-line');
      await page.waitForTimeout(200);
      const rv = await screen(page, 'reveal-behind', { tab: await tabWalk(page, 16) });
      rv.order = await page.evaluate(() => {
        const y = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
        return { name: y('.reveal .name'), nums: y('.ds-nums'), verdict: y('.verdict'), path: y('#path'), mine: y('.mine'), after: y('#after-row'), selfcheck: y('#selfcheck'), explain: y('#explain'), concept: y('.concept'), next: y('#next'), docH: document.documentElement.scrollHeight, vh: innerHeight, nextPos: getComputedStyle(document.querySelector('#next')).position, hl: [...document.querySelectorAll('.ds-hl')].length };
      });
      await page.screenshot({ path: `${OUT}/${LABEL}-reveal-behind-full.png`, fullPage: true });
      rv.sticky = await page.evaluate(async () => {
        const nx = document.querySelector('#next'), nav = document.querySelector('#nav').getBoundingClientRect();
        const vis = () => { const r = nx.getBoundingClientRect(); return r.top >= 0 && r.bottom <= nav.top + 0.5; };
        window.scrollTo(0, 0); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const atTop = vis();
        const c = document.querySelector('.concept'); window.scrollTo(0, c.getBoundingClientRect().top + scrollY - innerHeight / 2);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const atConcept = vis(), gapToNav = Math.round(nav.top - nx.getBoundingClientRect().bottom);
        window.scrollTo(0, 0);
        return { atTop, atConcept, gapToNav, meta: document.querySelector('meta[name="color-scheme"]')?.content ?? null, progress: document.querySelector('[role=progressbar]')?.getAttribute('aria-valuetext') ?? null };
      });
      // 신고 시트
      await page.click('#flag'); await page.waitForSelector('.sheet');
      const sh = await screen(page, 'sheet');
      sh.sheetHits = await hits(page, '.sheet label.radio, #rp-cancel, #rp-send');
      await page.keyboard.press('Escape');
      // 퀴즈 오답 피드백
      await page.click('.concept .opt[data-i="0"]');
      await page.waitForTimeout(150);
      rv.quizWrong = await page.evaluate(() => ({ fb: document.querySelector('.concept .quiz-fb').innerText, marks: [...document.querySelectorAll('.concept .opt')].map(o => o.className) }));
      // 카드 2(앞섬·적중) → 카드 3(난이도 1)
      await page.click('#next'); await page.waitForSelector('#stage .sc');
      await openGate(page, 2, 4); await page.keyboard.press('ArrowLeft'); await page.click('#toast #now');
      await page.waitForSelector('#explain .ex-line'); await page.waitForTimeout(150);
      await screen(page, 'reveal-ahead');
      await page.click('#next'); await page.waitForSelector('#stage .sc');
      await openGate(page, 0, 2); await page.click('#btnL'); await page.click('#toast #now');
      await page.waitForSelector('#explain .ex-line'); await page.waitForTimeout(150);
      await page.click('#next');
      await page.waitForSelector('.done-title'); await page.waitForTimeout(150);
      const dn = await screen(page, 'done');
      dn.text = await page.evaluate(() => document.querySelector('#view').innerText.replace(/\n+/g, ' / '));
      await page.screenshot({ path: `${OUT}/${LABEL}-done-full.png`, fullPage: true });
      // 일지(3장)
      await page.click('#nav button[data-v="journal"]'); await page.waitForSelector('.jlist'); await page.waitForTimeout(150);
      await screen(page, 'journal3', { tab: await tabWalk(page, 8) });
      // 개념
      await page.click('#nav button[data-v="concepts"]'); await page.waitForSelector('#cpath'); await page.waitForTimeout(100);
      await screen(page, 'concepts-path', { tab: await tabWalk(page, 8) });
      await page.click('#cv-list'); await page.waitForSelector('.clist'); await page.waitForTimeout(100);
      await screen(page, 'concepts', { tab: await tabWalk(page, 6) });
      await page.click('.crow >> nth=0'); await page.waitForSelector('.concept .opt'); await page.waitForTimeout(100);
      await screen(page, 'concept-detail');
      await ctx.close();
    }

    /* ===== 3. 비슷함 + 한 장 더 (deck4) ===== */
    {
      const now = new Date();
      const st = baseState([mkJ(CASE.c1, now, '매출 +23%', 3, 'behind', false), mkJ(CASE.c2, now, '부채비율 88%', 4, 'ahead', true), mkJ(CASE.c3, now, 'PER 24 vs 21', 2, 'even', null)], { sessions: { [todayKey]: { cards: [CASE.c1, CASE.c2, CASE.c3] } } });
      const { ctx, page } = await newPage(browser, { state: st, kv: { 'bokgi.mock.deck4': '1' } });
      await page.goto(BASE); await page.waitForSelector('.done-title'); await page.waitForTimeout(150);
      await screen(page, 'done-extra');
      R.screens['done-extra'].text = await page.evaluate(() => document.querySelector('#view').innerText.replace(/\n+/g, ' / '));
      await page.click('#more'); await page.waitForSelector('#stage .sc');
      await screen(page, 'card-extra');
      await openGate(page, 1, 3); await page.click('#btnR'); await page.click('#toast #now');
      await page.waitForSelector('#explain .ex-line'); await page.waitForTimeout(150);
      await screen(page, 'reveal-even');
      await page.click('#next'); await page.waitForSelector('.done-title'); await page.waitForTimeout(100);
      R.screens['done-after-extra'] = { text: await page.evaluate(() => document.querySelector('#view').innerText.replace(/\n+/g, ' / ')) };
      await ctx.close();
    }

    /* ===== 4. 복습 ===== */
    {
      const st = setDoneState({ 'abs-vs-relative': { state: 'learning', level: 0, dueOn: yesterdayKey, correct: 1, total: 1 }, 'debt-and-cycle': { state: 'review', level: 0, dueOn: yesterdayKey, correct: 0, total: 1 } });
      const { ctx, page } = await newPage(browser, { state: st });
      await page.goto(BASE); await page.waitForSelector('.peek'); await page.waitForTimeout(150);
      const rs = await screen(page, 'review', { tab: await tabWalk(page, 6) });
      rs.top = await page.evaluate(() => document.querySelector('.top').innerText.replace(/\s+/g, ' '));
      await page.click('.concept .opt >> nth=1'); await page.waitForTimeout(150);
      await page.click('#next'); await page.waitForTimeout(150);
      await page.click('.concept .opt >> nth=0'); await page.waitForTimeout(150);
      await page.click('#next'); await page.waitForSelector('.done-title'); await page.waitForTimeout(100);
      R.screens['done-after-review'] = { text: await page.evaluate(() => document.querySelector('#view').innerText.replace(/\n+/g, ' / ')) };
      await ctx.close();
    }

    /* ===== 5. 빈 상태: 처음(판단 0) 일지·개념·스트릭 끊김 ===== */
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE); await page.waitForSelector('#stage .sc');
      await page.click('#nav button[data-v="journal"]'); await page.waitForSelector('#cal'); await page.waitForTimeout(150);
      const je = await screen(page, 'journal-empty');
      je.text = await page.evaluate(() => document.querySelector('#view').innerText.replace(/\n+/g, ' / '));
      await ctx.close();
    }
    {
      // 스트릭 끊김: 사흘 전까지 판단, 어제·오늘 없음
      const st = baseState([mkJ(CASE.c1, daysAgo(3), '매출 +23%', 3, 'behind', false), mkJ(CASE.c2, daysAgo(4), '부채비율 88%', 4, 'ahead', true)]);
      const { ctx, page } = await newPage(browser, { state: st });
      await page.goto(BASE); await page.waitForSelector('#stage .sc'); await page.waitForTimeout(150);
      R.screens['streak-broken'] = { entry: await page.evaluate(() => document.querySelector('.ds-entry').innerText.replace(/\s+/g, ' ')) };
      await page.screenshot({ path: `${OUT}/${LABEL}-streak-broken.png` });
      await ctx.close();
    }

    /* ===== 6. 일지 24장(통계 열림) ===== */
    {
      const { ctx, page } = await newPage(browser, { state: baseState(injected24()) });
      await page.goto(BASE); await page.waitForSelector('.done-title, #stage .sc');
      await page.click('#nav button[data-v="journal"]'); await page.waitForSelector('details.stats');
      await page.click('details.stats summary'); await page.waitForTimeout(150);
      await screen(page, 'journal24');
      await page.screenshot({ path: `${OUT}/${LABEL}-journal24-full.png`, fullPage: true });
      await ctx.close();
    }

    /* ===== 6b. 스와이프 판단 → 되돌리기: 첫 근거 칩으로 간 초점이 보이는가 ===== */
    {
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE); await page.waitForSelector('#stage .sc');
      await openGate(page, 0, 3);
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = await page.locator('#stage .sc:last-child').boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height * 0.5;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 230, y, { steps: 10 }); await page.mouse.up();
      await page.waitForSelector('#toast #undo');
      await page.click('#toast #undo');
      await page.waitForTimeout(250);
      R.flows.undoFocus = await page.evaluate(() => {
        const e = document.activeElement, r = e.getBoundingClientRect(), nav = document.querySelector('#nav').getBoundingClientRect();
        const t = document.querySelector('#toast'), tr = t && t.textContent.trim() ? t.getBoundingClientRect() : null;
        const under = (b) => b ? Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)) : 0;
        return { el: (e.innerText || e.id).split('\n')[0], top: Math.round(r.top), bottom: Math.round(r.bottom), navTop: Math.round(nav.top), underNav: Math.round(under(nav)), underToast: Math.round(under(tr)), vh: innerHeight };
      });
      await ctx.close();
    }
    /* ===== 6c. 복습 화면 320×480(짧은 화면): 계속 단추가 첫 화면에 보이는가(붙는 막대) ===== */
    {
      const st = setDoneState({ 'abs-vs-relative': { state: 'learning', level: 0, dueOn: yesterdayKey, correct: 1, total: 1 } });
      const { ctx, page } = await newPage(browser, { state: st, vw: 320, vh: 480 });
      await page.goto(BASE); await page.waitForSelector('.peek'); await page.waitForTimeout(150);
      await page.click('.peek summary');
      const m320 = () => page.evaluate(() => { const r = document.querySelector('#next').getBoundingClientRect(), nav = document.querySelector('#nav').getBoundingClientRect(); return { nextTop: Math.round(r.top), nextBottom: Math.round(r.bottom), navTop: Math.round(nav.top), visible: r.top >= 0 && r.bottom <= nav.top + 0.5, docH: document.documentElement.scrollHeight }; });
      R.flows.review320 = await m320();
      if (await page.locator('.act-bar').count()) {   // 막대가 없던 때의 배치(단추가 카드 바로 아래, 안내 글은 그 뒤)를 흉내 낸 값
        await page.addStyleTag({ content: '#view{display:flex;flex-direction:column}#view>.hint{order:1}.act-bar{position:static!important;margin:0!important;padding:0!important;border:0!important}.act-bar .ds-btn.wide{margin-top:4px!important}' });
        R.flows.review320beforeEmu = await m320();
      }
      await page.screenshot({ path: `${OUT}/${LABEL}-review-320x480.png` });
      await ctx.close();
    }

    /* ===== 7. 모션 감소 ===== */
    {
      const { ctx, page } = await newPage(browser, { reduced: true });
      await page.goto(BASE); await page.waitForSelector('#stage .sc');
      R.motion.reduce = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#stage .sc:last-child')); return { mq: matchMedia('(prefers-reduced-motion: reduce)').matches, sc: `${cs.transitionProperty} ${cs.transitionDuration}` }; });
      await page.locator('#btnR').click({ force: true });
      R.motion.reduce.shake = await page.evaluate(() => { const e = document.querySelector('.shake'); return e ? `${getComputedStyle(e).animationName} ${getComputedStyle(e).animationDuration}` : 'no .shake'; });
      await openGate(page);
      const t0 = Date.now(); await page.click('#btnR'); await page.waitForSelector('#toast #now'); R.motion.reduce.clickToToastMs = Date.now() - t0;
      R.motion.reduce.anims = await page.evaluate(() => document.getAnimations().map(a => a.animationName || a.transitionProperty || 'anim'));
      await ctx.close();
      const n = await newPage(browser);
      await n.page.goto(BASE); await n.page.waitForSelector('#stage .sc');
      R.motion.normal = await n.page.evaluate(() => { const cs = getComputedStyle(document.querySelector('#stage .sc:last-child')); return `${cs.transitionProperty} ${cs.transitionDuration}`; });
      await openGate(n.page);
      const t1 = Date.now(); await n.page.click('#btnR'); await n.page.waitForSelector('#toast #now'); R.motion.normalClickToToastMs = Date.now() - t1;
      await n.ctx.close();
    }

    /* ===== 8. 화면 크기 320×568 · 430×932 (가로 넘침, 첫 화면) ===== */
    for (const [vw, vh] of [[320, 568], [430, 932]]) {
      const key = `${vw}x${vh}`;
      const { ctx, page } = await newPage(browser, { vw, vh });
      await page.goto(BASE); await page.waitForSelector('#stage .sc'); await page.waitForTimeout(150);
      const v = { card: await page.evaluate(OVERFLOW), cardHits: (await hits(page)).filter(x => x.hitW < 43.5 || x.hitH < 43.5).map(x => `${x.id} ${x.hitW}x${x.hitH}`) };
      await page.screenshot({ path: `${OUT}/${LABEL}-card-${key}.png` });
      await openGate(page, 1, 3); await page.click('#btnR'); await page.mouse.move(2, 2); await page.waitForSelector('#toast #now');
      v.toast = await page.evaluate(OVERFLOW);
      await page.click('#toast #now'); await page.waitForSelector('#explain .ex-line'); await page.waitForTimeout(150);
      v.reveal = await page.evaluate(OVERFLOW);
      v.revealFirst = await page.evaluate(FIRST_INFO);
      await page.screenshot({ path: `${OUT}/${LABEL}-reveal-${key}.png` });
      await page.click('#nav button[data-v="journal"]'); await page.waitForSelector('.jlist'); await page.waitForTimeout(100);
      v.journal = await page.evaluate(OVERFLOW);
      R.viewports[key] = v;
      await ctx.close();
    }

    /* ===== 9. 긴 글자(DOM에 긴 문자열을 넣어 넘침 확인) ===== */
    {
      const LONG = 'Supercalifragilisticexpialidocious';
      const { ctx, page } = await newPage(browser);
      await page.goto(BASE); await page.waitForSelector('#stage .sc');
      await page.evaluate((L) => {
        const set = (sel, t) => document.querySelectorAll(sel).forEach(e => { e.textContent = t; });
        set('#stage .sc:last-child .meta b:first-child', '반도체 장비 및 소재 부품 제조업');
        document.querySelectorAll('#ev .ds-chip-label')[1].textContent = `${L}Ratio`;
        document.querySelectorAll('#ev .ds-chip-label')[0].textContent = '영업이익률 31% → 34%로 개선 추세가 이어짐';
        document.querySelectorAll('#risk .ds-chip')[0].textContent = '밸류에이션 프리미엄이 과도하게 높아 조정 가능성이 큼';
        set('.ds-entry-lead b:first-of-type', '12/20');
      }, LONG);
      R.long.card = await page.evaluate(OVERFLOW);
      await page.screenshot({ path: `${OUT}/${LABEL}-long-card.png`, fullPage: true });
      await openGate(page, 0, 3); await page.click('#btnR'); await page.click('#toast #now');
      await page.waitForSelector('#explain .ex-line'); await page.waitForTimeout(150);
      await page.evaluate((L) => {
        document.querySelector('.reveal .name').textContent = `${L} International Holdings (ABCDEFGHIJ)`;
        document.querySelectorAll('.ds-nums small')[1].textContent = 'MSCI All Country World Index';
        document.querySelectorAll('.ds-nums b')[0].lastChild.textContent = '−1234.5%';
        document.querySelectorAll('.mine .row b')[2].textContent = `${L}Ratio 개선 추세`;
        document.querySelectorAll('.ds-hl').forEach(e => { e.textContent = e.textContent + '의 관계와 시장 대비 초과수익을 함께 읽는 법'; });
      }, LONG);
      R.long.reveal = await page.evaluate(OVERFLOW);
      await page.screenshot({ path: `${OUT}/${LABEL}-long-reveal.png`, fullPage: true });
      await ctx.close();
    }

    /* ===== 10. 글자 200%(글자만 키움 — 안드로이드 글꼴 크기·텍스트 확대 흉내) ===== */
    for (const vw of [380, 320]) {
      const { ctx, page } = await newPage(browser, { vw, vh: vw === 380 ? 760 : 568 });
      await page.goto(BASE); await page.waitForSelector('#stage .sc'); await page.waitForTimeout(150);
      await page.evaluate(TEXT200);
      await page.waitForTimeout(100);
      const v = { card: await page.evaluate(OVERFLOW) };
      v.entry = await page.evaluate(() => { const e = document.querySelector('.ds-entry'), s = document.querySelector('.ds-streak'); return { entryW: Math.round(e.getBoundingClientRect().width), streakRight: Math.round(s.getBoundingClientRect().right), phoneRight: Math.round(document.querySelector('.phone').getBoundingClientRect().right) }; });
      await page.screenshot({ path: `${OUT}/${LABEL}-text200-card-${vw}.png` });
      await page.screenshot({ path: `${OUT}/${LABEL}-text200-card-${vw}-full.png`, fullPage: true });
      // 판단 버튼 글자 잘림
      v.judge = await page.evaluate(() => [...document.querySelectorAll('#btnL, #btnR')].map(b => ({ sw: b.scrollWidth, cw: b.clientWidth, sh: b.scrollHeight, ch: b.clientHeight })));
      await openGate(page, 0, 3); await page.click('#btnR'); await page.mouse.move(2, 2); await page.waitForSelector('#toast #now');
      v.toast = await page.evaluate(() => { const t = document.querySelector('#toast').getBoundingClientRect(); return { h: Math.round(t.height), top: Math.round(t.top), vh: innerHeight }; });
      await page.screenshot({ path: `${OUT}/${LABEL}-text200-toast-${vw}.png` });
      await page.click('#toast #now'); await page.waitForSelector('#explain .ex-line'); await page.waitForTimeout(150);
      await page.evaluate(TEXT200);
      v.reveal = await page.evaluate(OVERFLOW);
      await page.screenshot({ path: `${OUT}/${LABEL}-text200-reveal-${vw}.png` });
      R.text200[vw] = v;
      await ctx.close();
    }

    /* ===== 11. 느린 네트워크(목 청크를 2초 늦춤): 불러오는 동안 보이는 것 ===== */
    {
      const ctx = await browser.newContext({ viewport: { width: 380, height: 760 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
      await hideOverlay(ctx);
      await ctx.addInitScript(() => { try { localStorage.setItem('bokgi.onboarded', '1'); } catch { /* 무시 */ } });
      const page = await ctx.newPage(); watch(page);
      const delayed = [];
      await page.route('**/*', async (route) => {
        const u = route.request().url();
        if (/_next\/static\/chunks\/.*\.js/.test(u) && !/(main|webpack|polyfill|framework|turbopack|react|next)/i.test(u.split('/').pop())) { delayed.push(u.split('/').pop()); await new Promise(r => setTimeout(r, 1800)); }
        await route.continue();
      });
      const t0 = Date.now();
      await page.goto(BASE, { waitUntil: 'commit' });
      const snaps = [];
      for (const ms of [200, 600, 1200]) {
        await page.waitForTimeout(ms - (Date.now() - t0) > 0 ? ms - (Date.now() - t0) : 0);
        snaps.push({ at: ms, text: await page.evaluate(() => (document.querySelector('#view') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 60)).catch(() => 'n/a'), loadingVisible: await page.evaluate(() => { const l = document.querySelector('.loading'); return l ? getComputedStyle(l).visibility : 'none'; }).catch(() => 'n/a') });
      }
      await page.screenshot({ path: `${OUT}/${LABEL}-slow.png` });
      await page.waitForSelector('#stage .sc', { timeout: 30000 }).catch(() => {});
      R.slow = { delayedChunks: delayed.length, snaps, readyMs: Date.now() - t0 };
      await ctx.close();
    }

    /* ===== 12. 터치 스와이프: 판 본문에서 시작한 가로 끌기 ===== */
    for (const where of ['panel', 'meta']) {
      const { ctx, page } = await newPage(browser, { touch: true });
      await page.goto(BASE); await page.waitForSelector('#stage .sc');
      await page.tap('#ev .ds-chip >> nth=0'); await page.tap('#conf button >> nth=2');
      await page.evaluate(() => window.scrollTo(0, 0));
      const box = await page.evaluate(w => { const el = document.querySelector(w === 'panel' ? '#stage .sc:last-child .panel' : '#stage .sc:last-child .meta'); const r = el.getBoundingClientRect(); return { x: r.left + 40, y: r.top + Math.min(r.height / 2, 60) }; }, where);
      const c = await ctx.newCDPSession(page);
      await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
      for (let i = 1; i <= 14; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + i * 18, y: box.y + i * 0.6 }] }); await page.waitForTimeout(16); }
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(500);
      R.flows['touch-' + where] = { judged: (await page.locator('#toast #now').count()) === 1 };
      await ctx.close();
    }
  } catch (e) { R.errors.push('CRASH ' + (e.stack || e.message).slice(0, 600)); }
  await browser.close();
  R.errors.push(...errs);
  fs.writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify(R, null, 2));
  summary(R);
})();

function summary(R) {
  console.log(`== ${R.label}`);
  let small40 = 0, small44 = 0, axeN = 0, axeIds = {}, obscured = 0, fullyObscured = 0, noRing = 0;
  for (const [k, s] of Object.entries(R.screens)) {
    if (!s.hits) { console.log(`-- ${k}: ${JSON.stringify(s).slice(0, 300)}`); continue; }
    const lt44 = s.hits.filter(x => x.hitW < 43.5 || x.hitH < 43.5), lt40 = s.hits.filter(x => x.hitW < 40 || x.hitH < 40);   // 0.25px 단위 측정이라 44px 칸은 43.5~43.75로 잡힌다
    small40 += lt40.length; small44 += lt44.length; axeN += s.axe.length; s.axe.forEach(v => { axeIds[v.id] = (axeIds[v.id] || 0) + v.n; });
    const tab = s.tab || [];
    const ob = tab.filter(t => t.covered > 0), fob = tab.filter(t => t.fullyCovered), nr = tab.filter(t => t.d !== 'BODY' && (t.outline.startsWith('none') || !t.fv));
    obscured += ob.length; fullyObscured += fob.length; noRing += nr.length;
    console.log(`-- ${k}: h=[${s.headings.join(', ')}] primary=${JSON.stringify(s.primaries)} hits<44=${lt44.length} (${lt44.map(x => `${x.id}:${x.name} ${x.hitW}x${x.hitH}`).join('; ')}) hits<40=${lt40.length} axe=${s.axe.map(v => `${v.id}(${v.impact},${v.n})`).join(',') || 0} tabObscured=${ob.map(t => `${t.d} ${t.covered}px by ${t.coveredBy}`).join('; ') || 0}`);
    console.log(`   first: ${JSON.stringify(s.first)}`);
    for (const extra of ['layout', 'ptr', 'blocked', 'toast', 'order', 'sticky', 'quizWrong', 'text', 'top', 'ax']) if (s[extra]) console.log(`   ${extra}: ${JSON.stringify(s[extra])}`);
  }
  console.log(`TOTAL hits<40=${small40} hits<44=${small44} axe violations(rules·screens)=${axeN} ${JSON.stringify(axeIds)} tabObscured=${obscured} fullyObscured=${fullyObscured} noRing=${noRing}`);
  console.log('MOTION', JSON.stringify(R.motion));
  console.log('VIEWPORTS', JSON.stringify(R.viewports));
  console.log('LONG', JSON.stringify(R.long));
  console.log('TEXT200', JSON.stringify(R.text200));
  console.log('SLOW', JSON.stringify(R.slow));
  console.log('FLOWS', JSON.stringify(R.flows));
  console.log('ERRORS', R.errors.length ? R.errors.join('\n  ') : 'none');
}

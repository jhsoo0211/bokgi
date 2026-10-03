/* 복기 프로토타입 UX 감사 하네스 (읽기 전용). node audit.cjs <label>
   결과: prototype/tests/audit-out/<label>.json + 요약 stdout (git 제외) */
const { chromium } = require(require.resolve('playwright', { paths: ['/Users/jeonghyeonsu/projects/IfSave/frontend'] }));
const fs = require('fs');
const AXE = fs.readFileSync('/Users/jeonghyeonsu/projects/IfSave/frontend/node_modules/axe-core/axe.min.js', 'utf8');
const URL = 'file:///Users/jeonghyeonsu/projects/bokgi/prototype/app/index.html';
const DIR = require('path').join(__dirname, 'audit-out'); fs.mkdirSync(DIR, { recursive: true });
const LABEL = process.argv[2] || 'before';
const KEY = 'bokgi.proto.v1';
const R = { label: LABEL, hits: {}, tab: {}, trap: {}, motion: {}, overflow: {}, touch: {}, ax: {}, axe: {}, errors: [] };
const errs = [];

/* 효과적 히트 영역: 중심을 지나는 가로·세로 선에서 elementFromPoint가 그 요소(또는 자식)를 돌려주는 길이 (가상 요소 확장 포함) */
const HIT_FN = `(sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(el => {
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const inEl = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
  const scan = (dx, dy, max) => { let d = 0; while (d < max && inEl(cx + dx * (d + 0.25), cy + dy * (d + 0.25))) d += 0.25; return d; };
  const lim = 60;
  const hitH = scan(0, -1, r.height / 2 + lim) + scan(0, 1, r.height / 2 + lim), hitW = scan(-1, 0, r.width / 2 + lim) + scan(1, 0, r.width / 2 + lim);
  const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 18);
  return { name, w: +r.width.toFixed(1), h: +r.height.toFixed(1), hitW: +hitW.toFixed(1), hitH: +hitH.toFixed(1) };
})`;
async function hits(page, key, sel) {
  try { R.hits[key] = await page.evaluate(`(${HIT_FN})(${JSON.stringify(sel)})`); }
  catch (e) { R.errors.push(`hits ${key}: ${e.message}`); }
  await page.evaluate(() => window.scrollTo(0, 0));
}
const desc = () => {
  const e = document.activeElement; if (!e || e === document.body) return { d: 'BODY' };
  const r = e.getBoundingClientRect(), nav = document.querySelector('#nav'), nr = nav && !nav.hidden ? nav.getBoundingClientRect() : null;
  const toast = document.querySelector('#toast'), tr = toast && toast.textContent.trim() && !toast.contains(e) ? toast.getBoundingClientRect() : null;
  const inNav = nav && nav.contains(e);
  const overlap = (a, b) => b && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5 && a.right > b.left && a.left < b.right ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : 0;
  const cs = getComputedStyle(e);
  return {
    d: `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''} "${(e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 16)}"`,
    fv: e.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
    underNav: inNav ? 0 : +overlap(r, nr).toFixed(1), underToast: +overlap(r, tr).toFixed(1)
  };
};
async function tabWalk(page, n, startFromTop = true) {
  if (startFromTop) await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  const out = [];
  for (let i = 0; i < n; i++) { await page.keyboard.press('Tab'); out.push(await page.evaluate(desc)); }
  return out;
}
async function runAxe(page, key) {
  try {
    await page.addScriptTag({ content: AXE });
    const res = await page.evaluate(async () => {
      const r = await axe.run(document, { preload: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, t: v.nodes.slice(0, 3).map(x => x.target.join(' ')) }));
    });
    R.axe[key] = res;
  } catch (e) { R.errors.push(`axe ${key}: ${e.message}`); }
}
/* 크롬 접근성 트리: 이름이 정확히 이 낱말인 보이는 노드 (스와이프 도장 글자 누출 확인) */
async function axLeak(page, words) {
  const c = await page.context().newCDPSession(page);
  const { nodes } = await c.send('Accessibility.getFullAXTree');
  await c.detach();
  return nodes.filter(n => !n.ignored && n.name && words.includes(String(n.name.value).trim())).map(n => `${n.role && n.role.value}:${n.name.value}`);
}
async function axNameOf(page, sel) {
  const c = await page.context().newCDPSession(page);
  const { root } = await c.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
  if (!nodeId) { await c.detach(); return null; }
  const { nodes } = await c.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  await c.detach();
  const n = nodes[0]; return n ? { role: n.role && n.role.value, name: n.name && n.name.value, props: (n.properties || []).filter(p => ['pressed', 'expanded', 'keyshortcuts', 'describedby'].includes(p.name)).map(p => `${p.name}=${JSON.stringify(p.value.value ?? (p.value.relatedNodes || []).map(x => x.text))}`) } : null;
}
function watch(page) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
}
const openGate = async page => { await page.click('#ev .ds-chip >> nth=0'); await page.click('#conf button >> nth=2'); };

if (require.main === module && process.argv[3] !== 'summary') (async () => {
  const browser = await chromium.launch();

  /* ===== 1. 첫 실행 → 카드 → (키보드) 판단 → 공개 → 신고 시트 ===== */
  const ctx = await browser.newContext({ viewport: { width: 380, height: 760 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  const page = await ctx.newPage(); watch(page);
  await page.goto(URL);
  try {
    await hits(page, 'onboarding', '#onb-next');
    // 키보드로만 안내 3장 넘기기: Enter 뒤 초점이 이어지는가
    await page.keyboard.press('Tab');
    const onb = [];
    for (let i = 0; i < 3; i++) {
      const before = await page.evaluate(() => document.activeElement && document.activeElement.id);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(60);
      const after = await page.evaluate(() => document.activeElement === document.body ? 'BODY' : document.activeElement.id || document.activeElement.tagName);
      onb.push(`${before}→Enter→${after}`);
      if (after === 'BODY' && i < 2) await page.keyboard.press('Tab');
    }
    R.tab.onboardingEnter = onb;
  } catch (e) { R.errors.push('onboarding: ' + e.message); }
  for (let i = 0; i < 3 && await page.locator('#onb-next').count(); i++) { R.errors.push('onboarding needed click ' + i + ' ' + JSON.stringify(R.tab.onboardingEnter)); await page.click('#onb-next'); }
  await page.waitForSelector('#stage .sc');
  await page.screenshot({ path: `${DIR}/${LABEL}-01-card.png` });

  // 카드 화면 히트 영역
  await hits(page, 'nav', '#nav button');
  await hits(page, 'panelTabs', '#stage .sc:last-child .panel-tabs button');
  await hits(page, 'recognizedLabel', 'label.check');
  await hits(page, 'evidenceChips', '#ev .ds-chip');
  await hits(page, 'riskChips', '#risk .ds-chip');
  await hits(page, 'confidence', '#conf button');
  await hits(page, 'judgeButtons', '#btnL, #btnR');
  // 카드 화면 탭 순서 + 포커스 링
  R.tab.card = await tabWalk(page, 22);
  R.ax.stampLeakCard = await axLeak(page, ['잘했다', '못했다', '앞섰다', '뒤졌다']);
  R.ax.btnR = await axNameOf(page, '#btnR');
  R.ax.conf = await axNameOf(page, '#conf');
  R.ax.conf3 = await axNameOf(page, '#conf button:nth-child(3)');
  await runAxe(page, 'card');
  // 키보드로 게이트 채우기: Space(칩)·Enter(확신도) → → 판단
  try {
    await page.focus('#ev .ds-chip >> nth=1'); await page.keyboard.press('Space');
    await page.focus('#conf button >> nth=3'); await page.keyboard.press('Enter');
    R.tab.gateByKeyboard = { evPressed: await page.locator('#ev .ds-chip[aria-pressed="true"]').count(), confPressed: await page.locator('#conf button[aria-pressed="true"]').innerText(), btnEnabled: await page.locator('#btnR').isEnabled() };
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector('#toast #now');
    R.tab.afterArrow = await page.evaluate(desc);
    R.ax.toastRole = await page.locator('#toast').getAttribute('role');
    await hits(page, 'toastButtons', '#toast button');
    await page.screenshot({ path: `${DIR}/${LABEL}-02-toast.png` });
    await page.keyboard.press('Enter');   // 바로 공개
    await page.waitForSelector('.reveal .name');
    await page.waitForSelector('#explain .ex-line');
    R.tab.afterReveal = await page.evaluate(desc);
  } catch (e) { R.errors.push('keyboard judge: ' + e.message); }
  await hits(page, 'selfCheck', '.ds-selfcheck button');
  await hits(page, 'quizReveal', '.concept .opt');
  await hits(page, 'flag', '#flag');
  await hits(page, 'nextReveal', '#next');
  R.tab.reveal = await tabWalk(page, 12);
  R.ax.stampLeakReveal = await axLeak(page, ['잘했다', '못했다']);
  await runAxe(page, 'reveal');

  // 신고 시트: 초점 가두기 (라디오 5번 선택 뒤 Shift+Tab), 바깥 클릭 영역, Esc 복귀
  try {
    await page.focus('#flag'); await page.keyboard.press('Enter');
    await page.waitForSelector('.sheet');
    const first = await page.evaluate(() => document.activeElement.value);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    const checked = await page.evaluate(() => document.querySelector('.sheet input:checked').value);
    await page.keyboard.press('Shift+Tab');
    const shiftTab = await page.evaluate(() => ({ inSheet: !!document.activeElement.closest('.sheet'), el: document.activeElement.id || document.activeElement.getAttribute('data-v') || document.activeElement.className || document.activeElement.tagName }));
    // 다시 시트 안으로(빠졌다면) → 끝까지 Tab 돌려 보기
    await page.evaluate(() => document.querySelector('.sheet input:checked').focus());
    const cyc = [];
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); cyc.push(await page.evaluate(() => (document.activeElement.closest('.sheet') ? '' : 'OUT:') + (document.activeElement.id || document.activeElement.value || document.activeElement.tagName))); }
    // 시트 머리글을 누른 뒤 Shift+Tab (초점이 body로 빠진 경우)
    await page.click('#rp-title');
    await page.keyboard.press('Shift+Tab');
    const afterTitle = await page.evaluate(() => (document.activeElement.closest('.sheet') ? 'in:' : 'OUT:') + (document.activeElement.id || document.activeElement.textContent.trim().slice(0, 10) || document.activeElement.tagName));
    const bgInert = await page.evaluate(() => !!document.querySelector('.phone').inert);
    await hits(page, 'sheetRadios', '.sheet label.radio');
    await hits(page, 'sheetButtons', '#rp-cancel, #rp-send');
    await runAxe(page, 'sheet');
    await page.keyboard.press('Escape');
    const afterEsc = await page.evaluate(() => ({ open: !!document.querySelector('.sheet'), focus: document.activeElement.id }));
    R.trap = { initial: first, checked, shiftTabFromChecked: shiftTab, tabCycle: cyc, shiftTabAfterTitleClick: afterTitle, backgroundInert: bgInert, afterEsc };
  } catch (e) { R.errors.push('sheet: ' + e.message); }

  /* ===== 2. 일지·개념·복습 (주입 데이터) ===== */
  await page.evaluate(k => {
    const at = n => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(12, 0, 0, 0); return x.toISOString(); };
    const s = JSON.parse(localStorage.getItem(k));
    for (let i = 0; i < 24; i++) s.judgments.push({ id: 'jx' + i, case_id: 'c00' + (1 + (i % 3)), case_version: 1, direction: 'outperform', key_evidence: ['매출 +23%', 'PER 38 vs 27', '부채비율 88%'][i % 3], risk_factor: null, confidence: 1 + (i % 5), recognized: i % 4 === 0, self_check: ['o', 'tri', 'x', undefined][i % 4], created_at: at(40 - i), result: { relative_pp: 2, state: ['ahead', 'behind', 'even'][i % 3], hit: i % 3 === 2 ? null : i % 2 === 0, return_pct: 1, bench_return_pct: 1, bench: 'S&P 500', company: '주입사', ticker: 'INJ', period: 'P' } });
    s.review['base-rate'] = { level: 1, due_at: new Date(Date.now() + 5 * 864e5).toISOString(), last_at: at(1), last_correct: true };
    localStorage.setItem(k, JSON.stringify(s));
  }, KEY);
  await page.reload();
  await page.click('#nav button[data-v="journal"]');
  await page.waitForSelector('#cal');
  await hits(page, 'calNav', '#cal-prev, #cal-next');
  await hits(page, 'calDays(non-interactive)', '.cal-grid td:not(:empty)');
  await hits(page, 'statsSummary', 'details.stats summary');
  await hits(page, 'journalButtons', '#export, #reset');
  R.ax.summary = await axNameOf(page, 'details.stats summary');
  R.ax.calPrev = await axNameOf(page, '#cal-prev');
  R.ax.jstate = await axNameOf(page, '.jstate');
  R.tab.journal = await tabWalk(page, 7);
  await page.click('details.stats summary');
  await page.waitForTimeout(80);
  await runAxe(page, 'journal');
  await page.screenshot({ path: `${DIR}/${LABEL}-03-journal.png` });
  // 달력 넘기기 뒤 초점·읽기
  try {
    await page.focus('#cal-prev'); await page.keyboard.press('Enter'); await page.waitForTimeout(50);
    R.tab.calAfterPrev = await page.evaluate(() => ({ focus: document.activeElement.id, title: document.querySelector('#cal-title').innerText }));
    R.ax.calPrevAfter = await axNameOf(page, '#cal-prev');
  } catch (e) { R.errors.push('cal: ' + e.message); }
  await page.click('#nav button[data-v="concepts"]');
  await page.waitForSelector('.clist');
  await hits(page, 'conceptRows', '.crow');
  await page.click('.crow >> nth=0');
  await page.waitForSelector('#back');
  await hits(page, 'back', '#back');
  await hits(page, 'quizConcept', '.concept .opt');
  await runAxe(page, 'concept');
  // 복습 화면: 오늘 판단 3장 + 복습일 지난 개념
  await page.evaluate(k => {
    const s = JSON.parse(localStorage.getItem(k));
    ['c001', 'c002', 'c003'].forEach((c, i) => s.judgments.push({ id: 'jt' + i, case_id: c, case_version: 1, direction: 'outperform', key_evidence: 'x', confidence: 3, created_at: new Date().toISOString(), result: { relative_pp: 2, state: 'ahead', hit: true, return_pct: 1, bench_return_pct: 1, bench: 'S&P 500', company: '주입사', ticker: 'INJ', period: 'P' } }));
    s.review['abs-vs-relative'] = { level: 0, due_at: new Date(Date.now() - 3600e3).toISOString(), last_at: new Date().toISOString(), last_correct: true };
    localStorage.setItem(k, JSON.stringify(s));
  }, KEY);
  await page.reload();
  await page.waitForSelector('.peek');
  await hits(page, 'peekSummary', '.peek summary');
  await hits(page, 'quizReview', '.concept .opt');
  await runAxe(page, 'review');
  await ctx.close();

  /* ===== 3. 움직임 줄이기 ===== */
  const ctxM = await browser.newContext({ viewport: { width: 380, height: 760 }, locale: 'ko-KR', reducedMotion: 'reduce' });
  await ctxM.addInitScript(() => { try { localStorage.setItem('bokgi.onboarded', '1'); } catch (e) {} });
  const pm = await ctxM.newPage(); watch(pm);
  await pm.goto(URL); await pm.waitForSelector('#stage .sc');
  try {
    R.motion.reduce = await pm.evaluate(() => {
      const sc = document.querySelector('#stage .sc:last-child'), cs = getComputedStyle(sc);
      return { mq: matchMedia('(prefers-reduced-motion: reduce)').matches, scTransition: `${cs.transitionProperty} ${cs.transitionDuration}` };
    });
    await pm.click('#btnR', { force: true }).catch(() => {});
    await pm.keyboard.press('ArrowRight');   // 게이트 막힘 → shake
    R.motion.reduce.shake = await pm.evaluate(() => { const e = document.querySelector('.shake'); return e ? `${getComputedStyle(e).animationName} ${getComputedStyle(e).animationDuration}` : 'no .shake'; });
    await openGate(pm);
    const t0 = Date.now(); await pm.click('#btnR'); await pm.waitForSelector('#toast #now');
    R.motion.reduce.clickToToastMs = Date.now() - t0;
  } catch (e) { R.errors.push('motion: ' + e.message); }
  await ctxM.close();
  const ctxN = await browser.newContext({ viewport: { width: 380, height: 760 }, locale: 'ko-KR' });
  await ctxN.addInitScript(() => { try { localStorage.setItem('bokgi.onboarded', '1'); } catch (e) {} });
  const pn = await ctxN.newPage(); watch(pn);
  await pn.goto(URL); await pn.waitForSelector('#stage .sc');
  await openGate(pn);
  { const t0 = Date.now(); await pn.click('#btnR'); await pn.waitForSelector('#toast #now'); R.motion.normalClickToToastMs = Date.now() - t0; }
  R.motion.normal = await pn.evaluate(() => { const cs = getComputedStyle(document.querySelector('#stage .sc:last-child')); return `${cs.transitionProperty} ${cs.transitionDuration}`; });
  await ctxN.close();

  /* ===== 4. 긴 글자 (가로 넘침) ===== */
  const ctxL = await browser.newContext({ viewport: { width: 380, height: 760 }, locale: 'ko-KR' });
  await ctxL.addInitScript(() => {
    const LONG_LATIN = 'Supercalifragilisticexpialidocious', o = {}; let cases, outs, concepts;
    Object.defineProperty(o, 'CASES', { configurable: true, get: () => cases, set: v => { cases = v.map(c => Object.assign({}, c, {
      sector_public: '반도체 장비 및 소재 부품 제조업', size_bucket: '초대형',
      evidence_options: ['영업이익률 31% → 34%로 개선 추세가 이어짐', `${LONG_LATIN}Ratio`, ...c.evidence_options.slice(2)],
      risk_options: ['밸류에이션 프리미엄이 과도하게 높아 조정 가능성이 큼', ...c.risk_options.slice(1)] })); } });
    Object.defineProperty(o, 'OUTCOMES', { configurable: true, get: () => outs, set: v => { outs = {}; Object.keys(v).forEach(k => { outs[k] = Object.assign({}, v[k], { company: `${LONG_LATIN} International Holdings`, ticker: 'ABCDEFGHIJ', bench: 'MSCI All Country World Index', return_pct: -1234.5 }); }); } });
    Object.defineProperty(o, 'CONCEPTS', { configurable: true, get: () => concepts, set: v => { concepts = {}; Object.keys(v).forEach(k => { concepts[k] = Object.assign({}, v[k], { title: v[k].title + '의 관계와 시장 대비 초과수익을 함께 읽는 법' }); }); } });
    window.IFSAVE = o;
    try { localStorage.setItem('bokgi.onboarded', '1'); } catch (e) {}
  });
  const pl = await ctxL.newPage(); watch(pl);
  const overflowCheck = () => {
    const phone = document.querySelector('.phone').getBoundingClientRect(), out = [];
    document.querySelectorAll('.phone *, .sheet *').forEach(e => {
      if (e.closest('#stage .sc:not(:last-child)') || e.closest('.sc-stamp')) return;
      const r = e.getBoundingClientRect(); if (!r.width) return;
      if (r.right > phone.right + 0.5 || r.left < phone.left - 0.5) out.push(`${e.tagName.toLowerCase()}.${(e.className && typeof e.className === 'string' ? e.className : '').split(' ')[0]} → ${Math.round(r.right - phone.right)}px`);
    });
    return { docScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, offenders: [...new Set(out)].slice(0, 8) };
  };
  try {
    await pl.goto(URL); await pl.waitForSelector('#stage .sc');
    R.overflow.card = await pl.evaluate(overflowCheck);
    await pl.click('#ev .ds-chip >> nth=1'); await pl.click('#risk .ds-chip >> nth=0'); await pl.click('#conf button >> nth=2');
    await pl.click('#btnR'); await pl.waitForSelector('#toast #now');
    R.overflow.toast = await pl.evaluate(overflowCheck);
    await pl.click('#toast #now'); await pl.waitForSelector('#explain .ex-line');
    R.overflow.reveal = await pl.evaluate(overflowCheck);
    await pl.screenshot({ path: `${DIR}/${LABEL}-04-long-reveal.png`, fullPage: true });
    await pl.click('#nav button[data-v="journal"]'); await pl.waitForSelector('.jlist');
    R.overflow.journal = await pl.evaluate(overflowCheck);
    await pl.click('#nav button[data-v="concepts"]'); await pl.waitForSelector('.clist');
    R.overflow.concepts = await pl.evaluate(overflowCheck);
  } catch (e) { R.errors.push('long: ' + e.message); }
  await ctxL.close();

  /* ===== 5. 터치 스와이프 (CDP 터치, hasTouch) — 판 본문에서 시작한 가로 끌기가 판단으로 이어지는가 ===== */
  for (const where of ['panel', 'meta']) {
    const ctxT = await browser.newContext({ viewport: { width: 380, height: 760 }, locale: 'ko-KR', hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await ctxT.addInitScript(() => { try { localStorage.setItem('bokgi.onboarded', '1'); } catch (e) {} });
    const pt = await ctxT.newPage(); watch(pt);
    try {
      await pt.goto(URL); await pt.waitForSelector('#stage .sc');
      await pt.tap('#ev .ds-chip >> nth=0'); await pt.tap('#conf button >> nth=2');
      await pt.evaluate(() => window.scrollTo(0, 0));
      const box = await pt.evaluate(w => { const el = document.querySelector(w === 'panel' ? '#stage .sc:last-child .panel' : '#stage .sc:last-child .meta'); const r = el.getBoundingClientRect(); return { x: r.left + 40, y: r.top + Math.min(r.height / 2, 60) }; }, where);
      await pt.evaluate(() => { window.__pe = []; ['pointerdown', 'pointercancel', 'pointerup'].forEach(t => document.addEventListener(t, e => window.__pe.push(e.type), true)); });
      const c = await ctxT.newCDPSession(pt);
      await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
      for (let i = 1; i <= 14; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + i * 18, y: box.y + i * 0.6 }] }); await pt.waitForTimeout(16); }
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await pt.waitForTimeout(500);
      R.touch[where] = { judged: (await pt.locator('#toast #now').count()) === 1, pointerEvents: await pt.evaluate(() => window.__pe.join(',')), touchAction: await pt.evaluate(w => getComputedStyle(document.querySelector(w === 'panel' ? '#stage .sc:last-child .panel' : '#stage .sc:last-child')).touchAction, where) };
    } catch (e) { R.errors.push(`touch ${where}: ` + e.message); }
    await ctxT.close();
  }

  await browser.close();
  R.errors.push(...errs);
  fs.writeFileSync(`${DIR}/${LABEL}.json`, JSON.stringify(R, null, 2));

  summary(R);
})().catch(e => { console.error('AUDIT CRASH', e); process.exit(1); });

function summary(R) {
  /* ---------- 요약 ---------- */
  const small = [];
  Object.entries(R.hits).forEach(([k, arr]) => (arr || []).forEach(x => { if (!k.includes('non-interactive') && (x.hitW < 40 || x.hitH < 40)) small.push(`${k}:${x.name} ${x.hitW}×${x.hitH}`); }));
  console.log(`== ${R.label}`);
  console.log('HIT (visible w×h → effective hitW×hitH):');
  Object.entries(R.hits).forEach(([k, arr]) => {
    const xs = arr || []; if (!xs.length) return console.log(`  ${k}: (none)`);
    const minW = Math.min(...xs.map(x => x.hitW)), minH = Math.min(...xs.map(x => x.hitH)), vw = Math.min(...xs.map(x => x.w)), vh = Math.min(...xs.map(x => x.h));
    console.log(`  ${k.padEnd(26)} n=${String(xs.length).padEnd(3)} visible min ${vw}×${vh} → hit min ${minW}×${minH}${minW < 40 || minH < 40 ? '  <40' : ''}`);
  });
  console.log('  controls with hit < 40px:', small.length);
  const tabSum = arr => (arr || []).map(t => t.d === 'BODY' ? 'BODY' : `${t.d}${t.fv ? '' : ' [no :focus-visible]'}${t.outline.startsWith('none') ? ' [NO OUTLINE]' : ''}${t.underNav ? ` [under nav ${t.underNav}px]` : ''}${t.underToast ? ` [under toast ${t.underToast}px]` : ''}`);
  console.log('TAB card:\n   ' + tabSum(R.tab.card).join('\n   '));
  console.log('TAB reveal:\n   ' + tabSum(R.tab.reveal).join('\n   '));
  console.log('TAB journal:\n   ' + tabSum(R.tab.journal).join('\n   '));
  console.log('onboarding Enter:', JSON.stringify(R.tab.onboardingEnter));
  console.log('gate by keyboard:', JSON.stringify(R.tab.gateByKeyboard), '| after → :', R.tab.afterArrow && R.tab.afterArrow.d, '| after reveal:', R.tab.afterReveal && R.tab.afterReveal.d);
  console.log('cal after ‹:', JSON.stringify(R.tab.calAfterPrev));
  console.log('TRAP:', JSON.stringify(R.trap));
  console.log('MOTION:', JSON.stringify(R.motion));
  console.log('OVERFLOW:', JSON.stringify(R.overflow));
  console.log('TOUCH:', JSON.stringify(R.touch));
  console.log('AX:', JSON.stringify(R.ax));
  console.log('AXE:'); Object.entries(R.axe).forEach(([k, v]) => console.log(`  ${k}: ${v.length ? v.map(x => `${x.id}(${x.impact},${x.n}) ${x.t.join(' | ')}`).join('\n      ') : 'no violations'}`));
  console.log('ERRORS:', R.errors.length ? R.errors.join('\n  ') : 'none');
}
module.exports = { summary };

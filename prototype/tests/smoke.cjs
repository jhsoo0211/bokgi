/* 복기 프로토타입 헤드리스 스모크 테스트 (Playwright, chromium) */
const { chromium } = require(require.resolve('playwright', { paths: ['/Users/jeonghyeonsu/projects/IfSave/frontend'] }));
const URL = 'file:///Users/jeonghyeonsu/projects/bokgi/prototype/app/index.html';
const OUT = '/Users/jeonghyeonsu/projects/bokgi/prototype/screenshots';
const SCRATCH = '/private/tmp/claude-501/-Users-jeonghyeonsu-projects/dd1ded55-a0e5-440c-8616-b11f60af2086/scratchpad';
const KEY = 'bokgi.proto.v1';

const results = [];
const check = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const S = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
const top = page => page.locator('.top').first().innerText();
/* 입장 카드 세 칸: 1줄 학습, 2줄 오늘 남은 카드, 오른쪽 스트릭 */
const entry = page => page.evaluate(() => {
  const e = document.querySelector('.ds-entry'); if (!e) return null;
  const t = s => (e.querySelector(s) || {}).innerText || '';
  return { lead: t('.ds-entry-lead'), sub: t('.ds-entry-sub'), streak: t('.ds-streak'), all: e.innerText };
});
const fmtEntry = e => (e ? `${e.lead} / ${e.sub} / ${e.streak}` : 'no .ds-entry');
/* 연습 달력이 보여 주는 달의 기대값을 State에서 계산 (날짜가 바뀌어도 맞게) */
const calExpect = (page, shift) => page.evaluate(sh => {
  const S = State.get(), today = State.dayKey(), now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + sh, 1), ym = State.dayKey(first).slice(0, 7);
  const practiced = [...new Set(S.judgments.map(j => State.dayKey(j.created_at)))].filter(k => k.startsWith(ym));
  const due = Object.entries(S.review).filter(([id]) => IFSAVE.CONCEPTS[id]).map(([, r]) => { const k = State.dayKey(r.due_at); return k < today ? today : k; }).filter(k => k.startsWith(ym));
  return { title: `${first.getFullYear()}년 ${first.getMonth() + 1}월`, month: first.getMonth() + 1, practicedDays: practiced.map(k => +k.slice(8)).sort((a, b) => a - b), dueDays: [...new Set(due.map(k => +k.slice(8)))].sort((a, b) => a - b), dueCount: due.length, todayN: +today.slice(8), isCurrent: sh === 0 };
}, shift);
const calShown = page => page.evaluate(() => ({
  title: document.querySelector('#cal-title').innerText,
  cap: document.querySelector('.cal-cap').innerText,
  done: [...document.querySelectorAll('.cal-day--done .cal-n')].map(e => +e.innerText),
  due: [...document.querySelectorAll('.cal-day--due .cal-n')].map(e => +e.innerText),
  today: [...document.querySelectorAll('.cal-day--today .cal-n')].map(e => +e.innerText),
  todayDone: document.querySelectorAll('.cal-day--today.cal-day--done').length,
  classes: [...new Set([...document.querySelectorAll('.cal td')].flatMap(td => [...td.classList]))],
  prevDisabled: document.querySelector('#cal-prev').disabled, nextDisabled: document.querySelector('#cal-next').disabled
}));

function watch(page, errors) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
}

async function shotFull(page, path) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 380, height: Math.max(760, h) });
  await page.waitForTimeout(50);
  await page.screenshot({ path });
  await page.setViewportSize({ width: 380, height: 760 });
}

async function dragCard(page, dx) {
  const box = await page.locator('#stage .sc:last-child').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height * 0.85;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(350);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  /* ===== A. 처음 실행 → 카드 3장 → 일지 → 개념 → 복습 ===== */
  const ctx = await browser.newContext({ viewport: { width: 380, height: 760 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  const page = await ctx.newPage(); watch(page, errors);
  await page.goto(URL);

  // 온보딩
  check('A1 onboarding ①', (await page.locator('.onb-title').innerText()) === '복기는 주가 맞히기 게임이 아니에요');
  check('A2 nav hidden during onboarding', await page.locator('#nav').isHidden());
  await page.screenshot({ path: `${SCRATCH}/x-onboarding-1.png` });
  await page.click('#onb-next');
  check('A3 onboarding ②', (await page.locator('.onb-title').innerText()) === '하루 3장, 5분');
  await page.click('#onb-next');
  check('A4 onboarding ③', (await page.locator('.onb-title').innerText()) === '결과와 회사 이름은 판단한 뒤에만 보여요');
  check('A5 last button = 시작', (await page.locator('#onb-next').innerText()) === '시작');
  await page.click('#onb-next');
  await page.waitForSelector('#stage .sc');
  check('A6 onboarded flag', (await page.evaluate(() => localStorage.getItem('bokgi.onboarded'))) === '1');
  check('A7 title', (await page.title()) === '복기 — 프로토타입');
  check('A8 nav = 오늘/일지/개념', (await page.locator('#nav button').allInnerTexts()).join('/') === '오늘/일지/개념');

  // 카드 화면
  check('A9 header 오늘 0/3 (스트릭은 입장 카드로 옮김)', /^오늘 0\/3/.test(await top(page)) && !(await top(page)).includes('스트릭'), await top(page));
  let en = await entry(page);
  check('E1 entry strip: learning line first, then cards, streak right', en && en.lead === '개념 이해 0/4 · 복습 예정 0개' && en.sub === '오늘 남은 카드 3장' && en.streak === '스트릭 0일' && en.all.startsWith('개념 이해'), fmtEntry(en));
  check('E2 entry strip sits above the card stack, not a button', await page.evaluate(() => { const e = document.querySelector('.ds-entry'), s = document.querySelector('#stage'); return !!(e.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && !e.querySelector('button, a') && e.closest('button') === null; }));
  const lpLeak = await page.evaluate(() => { const t = document.body.innerText; return Object.values(IFSAVE.CONCEPTS).map(c => c.title).filter(x => t.includes(x)); });
  check('E3 no learning point / concept title on the card screen (no outcome hint)', lpLeak.length === 0, JSON.stringify(lpLeak));
  check('H1 no .ds-hl highlighter before reveal', (await page.locator('.ds-hl').count()) === 0);
  check('A10 default panel = 숫자', (await page.locator('#stage .sc:last-child .panel-tabs button[aria-pressed="true"]').innerText()) === '숫자');
  check('A11 숫자 panel has no 맥락/기준금리', !(await page.locator('#stage .sc:last-child .panel').innerText()).includes('기준금리'));
  check('A12 buttons disabled at start', (await page.locator('#btnL').isDisabled()) && (await page.locator('#btnR').isDisabled()));
  check('A13 confidence has no default', (await page.locator('#conf button[aria-pressed="true"]').count()) === 0);
  check('A14 hint text', (await page.locator('#hint').innerText()) === '근거 하나와 확신도를 고르면 판단할 수 있어요');
  check('A15 button labels', (await page.locator('#btnL').innerText()).startsWith('← 시장보다 뒤졌다') && (await page.locator('#btnR').innerText()).startsWith('시장보다 앞섰다 →'));
  check('A16 recognized checkbox unchecked by default', !(await page.locator('#recog').isChecked()));
  const leak = await page.evaluate(() => {
    const t = document.body.innerText, html = document.documentElement.outerHTML;
    return Object.values(IFSAVE.OUTCOMES).filter(o => t.includes(o.company) || html.includes(o.company) || new RegExp('\\b' + o.ticker + '\\b').test(t)).map(o => o.company);
  });
  check('A17 no company/ticker before reveal', leak.length === 0, JSON.stringify(leak));
  check('A18 no ds-up/ds-down elements before reveal', (await page.locator('.ds-up, .ds-down').count()) === 0);
  await page.screenshot({ path: `${OUT}/01-today.png` });

  // 판 전환 (포인터 캡처가 탭 클릭을 막지 않는지)
  await page.click('#stage .sc:last-child .panel-tabs button[data-panel="context"]');
  const ctxText = await page.locator('#stage .sc:last-child .panel').innerText();
  check('A19 그때 panel shows rate + notes', ctxText.includes('5.25%') && (await page.locator('#stage .sc:last-child .ctx-notes li').count()) === 3);
  check('A20 그때 notes use relative dates only', /판단일 D-\d+/.test(ctxText) && !/20\d\d|\d+월|\d+일(?!\s)/.test(ctxText.replace(/판단일 D-\d+/g, '')), ctxText.split('\n').slice(0, 3).join(' | '));
  await page.screenshot({ path: `${SCRATCH}/x-panel-context.png` });
  await page.click('#stage .sc:last-child .panel-tabs button[data-panel="flow"]');
  check('A21 흐름 panel has sparkline', (await page.locator('#stage .sc:last-child .panel .spark').count()) === 1);
  await page.screenshot({ path: `${SCRATCH}/x-panel-flow.png` });
  await page.click('#stage .sc:last-child .panel-tabs button[data-panel="numbers"]');
  let st = await S(page);
  const pv = st.events.filter(e => e.event === 'panel_view').map(e => `${e.payload.case_id}:${e.payload.panel}`);
  check('A22 panel_view logged per switch', pv.join(',') === 'c001:context,c001:flow,c001:numbers', pv.join(','));

  // 게이트: 고르기 전 스와이프·키보드·버튼 막힘
  await dragCard(page, 230);
  check('A23 swipe blocked before gate', (await S(page)).judgments.length === 0);
  check('A24 blocked hint shown', (await page.locator('#hint').innerText()).startsWith('먼저'), await page.locator('#hint').innerText());
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('A25 keyboard blocked before gate', (await S(page)).judgments.length === 0);
  await page.click('#ev .ds-chip >> nth=0');
  check('A26 evidence only → still disabled', await page.locator('#btnR').isDisabled());
  check('A27 hint asks confidence', (await page.locator('#hint').innerText()) === '확신도를 고르면 판단할 수 있어요');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('A28 keyboard blocked with evidence only', (await S(page)).judgments.length === 0);
  await page.check('#recog');
  await page.click('#risk .ds-chip >> nth=0');
  await page.click('#conf button:has-text("3")');
  check('A29 evidence + confidence → enabled', (await page.locator('#btnR').isEnabled()) && (await page.locator('#btnL').isEnabled()));
  check('H1b still no .ds-hl with the gate filled (pre-judgment)', (await page.locator('.ds-hl').count()) === 0);
  await shotFull(page, `${OUT}/02-gate.png`);

  // → 버튼으로 판단, 2.5초 뒤 자동 공개
  await page.click('#btnR');
  await page.waitForSelector('#toast #undo');
  const toast = await page.locator('#toast').innerText();
  check('A30 toast wording', toast.startsWith('시장보다 앞섰다 · 근거: 매출 +23% · 확신 3/5'), toast.replace(/\s+/g, ' '));
  check('A31 toast has 되돌리기 + 바로 공개', (await page.locator('#toast #undo').count()) === 1 && (await page.locator('#toast #now').innerText()) === '바로 공개');
  check('A32 gate locked during undo window', await page.locator('#gate').evaluate(el => el.disabled));
  check('A33 buttons disabled during undo window', await page.locator('#btnR').isDisabled());
  await page.screenshot({ path: `${SCRATCH}/x-toast.png` });
  await page.waitForSelector('.reveal .name', { timeout: 5000 });
  const name = await page.locator('.reveal .name').innerText();
  check('A34 company name appears in reveal', name === '어도비 (ADBE)', name);
  await page.waitForSelector('#explain .ds-bubble', { timeout: 3000 });
  await page.waitForSelector('#explain .ex-line--read');
  check('A34b AI explain uses − sign like the numbers', (await page.locator('#explain').innerText()).includes('시장 대비 −2.3%p'), (await page.locator('#explain .ex-line--read .ex-s').innerText()));
  const nums = await page.locator('.ds-nums b').allInnerTexts();
  check('A35 numbers have sign + shape', nums[0] === '▲+4.8%' && nums[1] === '▲+7.1%' && nums[2] === '▼−2.3%p', JSON.stringify(nums));
  check('A36 colored classes in reveal', (await page.locator('.ds-nums b.ds-up').count()) === 2 && (await page.locator('.ds-nums b.ds-down').count()) === 1);
  const verdict = await page.locator('.verdict').innerText();
  check('A37 verdict behind + miss', verdict.includes('뒤짐') && verdict.includes('시장보다 2.3%p 뒤졌어요') && verdict.includes('판단한 방향과 달라요'), verdict.replace(/\s+/g, ' '));
  const mine = await page.locator('.mine').innerText();
  check('A38 사후에 중요했던 것 row', /사후에 중요했던 것\s+절대수익과 시장 대비/.test(mine));
  check('A39 알고 판단 row', mine.includes('알고 판단'));
  st = await S(page);
  check('A40 judgment stored with recognized/result', st.judgments.length === 1 && st.judgments[0].recognized === true && st.judgments[0].result.state === 'behind' && st.judgments[0].result.hit === false && st.judgments[0].result.company === '어도비');
  check('A41 judge log has recognized + gesture', st.events.some(e => e.event === 'judge' && e.payload.recognized === true && e.payload.gesture.via === 'button'));

  // 해설 세 줄: 머리글·라벨·면책, 개념 줄이 마지막이고 가장 진함
  await page.waitForSelector('#explain .ex-line');
  const ex = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('#explain .ex-line')];
    const fw = s => +getComputedStyle(s).fontWeight, fs = s => parseFloat(getComputedStyle(s).fontSize);
    return {
      heads: lines.map(l => l.querySelector('.ex-h').innerText),
      labels: lines.map(l => l.querySelector('.ex-s .ds-label').innerText),
      sentences: lines.map(l => l.querySelector('.ex-s').innerText),
      warnIn: lines.map(l => !!l.querySelector('.warn')),
      lastIsConcept: lines[lines.length - 1].classList.contains('ex-line--concept') && !lines[lines.length - 1].nextElementSibling,
      conceptHl: (lines[2] && lines[2].querySelector('.ds-hl') || {}).innerText || '',
      stronger: lines.length === 3 && fw(lines[2].querySelector('.ex-s')) > fw(lines[0].querySelector('.ex-s')) && fs(lines[2].querySelector('.ex-s')) >= fs(lines[0].querySelector('.ex-s'))
    };
  });
  check('X1 explainer = three labelled lines (잘 읽은 것 · 바꿀 것 · 개념 연결)', ex.heads.join('|') === '이번에 잘 읽은 것|다음에 바꿀 것|개념 연결' && ex.labels.join('|') === '📄 출처|🔍 추론|📄 출처', `${ex.heads.join('|')} / ${ex.labels.join('|')}`);
  check('X2 disclaimer sits next to the 🔍 추론 line only', ex.warnIn.join(',') === 'false,true,false');
  check('X3 concept line last, strongest, concept name highlighted', ex.lastIsConcept && ex.stronger && ex.conceptHl === '절대수익과 시장 대비', `hl=${ex.conceptHl} stronger=${ex.stronger}`);
  check('X4 each line is one sentence', ex.sentences.every(s => (s.replace(/^\S+ \S+ /, '').match(/[.?!](\s|$)/g) || []).length === 1), ex.sentences.join(' | '));
  const guard = await page.evaluate(() => {
    const nums = s => s.match(/\d+(?:\.\d+)?/g) || [];
    const shown = new Set(nums(document.querySelector('.ds-nums').innerText + ' ' + document.querySelector('.mine').innerText));
    return nums(document.querySelector('#explain').innerText).filter(n => !shown.has(n));
  });
  check('X5 number guard: explainer numbers are only numbers shown on the reveal screen', guard.length === 0, JSON.stringify(guard));
  const hl = await page.evaluate(() => [...document.querySelectorAll('.ds-hl')].map(e => `${e.closest('#after-row') ? 'after' : e.closest('.ex-line--concept') ? 'explain' : e.closest('.concept h5') ? 'concept' : 'OTHER'}:${e.innerText}`));
  check('H2 .ds-hl after reveal only on 사후 value · explainer concept · concept title', hl.length === 3 && hl.every(x => !x.startsWith('OTHER') && x.endsWith(':절대수익과 시장 대비')), JSON.stringify(hl));
  // ○△✕ 자기 평가 (난이도 2 카드): 사후에 중요했던 것 바로 아래
  const sc = await page.evaluate(() => {
    const box = document.querySelector('#selfcheck');
    return box && { under: document.querySelector('#after-row').nextElementSibling === box, q: box.querySelector('.selfcheck-q').innerText,
      btns: [...box.querySelectorAll('.ds-selfcheck button')].map(b => b.innerText), pressed: box.querySelectorAll('[aria-pressed="true"]').length };
  });
  check('S1 self-check under 사후에 중요했던 것, concept wording, ○△✕, nothing preselected', !!sc && sc.under && sc.q === '내 근거는 이 개념과 맞았나요?' && sc.btns.join('|') === '○ 맞았다|△ 일부|✕ 달랐다' && sc.pressed === 0, JSON.stringify(sc));
  await shotFull(page, `${OUT}/03-reveal.png`);
  await page.click('.ds-selfcheck button[data-v="o"]');
  await page.click('.ds-selfcheck button[data-v="tri"]');
  st = await S(page);
  const scEv = st.events.filter(e => e.event === 'self_check');
  check('S2 self-check stores value (change allowed) + logs self_check', st.judgments[0].self_check === 'tri' && scEv.length === 2 && scEv[1].payload.value === 'tri' && scEv[1].payload.concept === 'abs-vs-relative' && scEv[1].payload.judgment_id === st.judgments[0].id, JSON.stringify(scEv.map(e => e.payload.value)));
  check('S3 selected = red pen ring on one button, feedback line', (await page.locator('.ds-selfcheck button[aria-pressed="true"]').allInnerTexts()).join() === '△ 일부' && (await page.locator('.ds-selfcheck button[aria-pressed="true"]').evaluate(b => getComputedStyle(b, '::after').borderTopColor)) === 'rgb(215, 38, 61)' && (await page.locator('.selfcheck-fb').innerText()).startsWith('기록했어요'));
  check('S4 self-check is not scored anywhere on screen', !/점수|\d+\s*점|%/.test(await page.locator('#selfcheck').innerText()));
  await page.evaluate(() => { const r = document.querySelector('#after-row'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 12); });
  await page.waitForTimeout(50);
  await page.screenshot({ path: `${OUT}/07-selfcheck.png` });
  await page.evaluate(() => window.scrollTo(0, 0));

  // 신고 시트
  await page.click('#flag');
  check('A42 report sheet with 8 categories', (await page.locator('.sheet input[type=radio]').count()) === 8);
  check('A43 report send disabled until category', await page.locator('#rp-send').isDisabled());
  await page.screenshot({ path: `${SCRATCH}/x-report-sheet.png` });
  await page.click('.sheet label.radio:has-text("기업 유추 가능")');
  await page.fill('#rp-note', '업종과 가이던스로 회사를 짐작할 수 있었어요');
  await page.click('#rp-send');
  st = await S(page);
  check('A44 State.report stored', st.reports.length === 1 && st.reports[0].category === '기업 유추 가능' && st.reports[0].case_id === 'c001' && st.reports[0].case_version === 1 && st.reports[0].note.length > 0, JSON.stringify(st.reports[0]));
  check('A45 report logged', st.events.some(e => e.event === 'report' && e.payload.category === '기업 유추 가능'));
  check('A46 sheet closed', (await page.locator('.sheet-back').count()) === 0);

  // 공개 화면 퀴즈 (정답) → 복습 level 0, 내일
  const ans1 = await page.evaluate(() => IFSAVE.CONCEPTS['abs-vs-relative'].quiz.answer);
  await page.click(`.concept .opt[data-i="${ans1}"]`);
  st = await S(page);
  const tomorrow = await page.evaluate(() => { const t = new Date(); t.setDate(t.getDate() + 1); return State.dayKey(t); });
  const rv1 = st.review['abs-vs-relative'];
  check('A47 quiz schedules review (level 0, due tomorrow)', rv1 && rv1.level === 0 && (await page.evaluate(d => State.dayKey(new Date(d)), rv1.due_at)) === tomorrow, JSON.stringify(rv1));

  // 카드 2: 키보드 ← → 바로 공개
  await page.click('#next');
  await page.waitForSelector('#stage .sc');
  en = await entry(page);
  check('A48 header 오늘 1/3 + strip 오늘 남은 카드 2장 · 스트릭 1일', /^오늘 1\/3/.test(await top(page)) && en.sub === '오늘 남은 카드 2장' && en.streak === '스트릭 1일' && en.lead === '개념 이해 0/4 · 복습 예정 0개', `${await top(page)} | ${fmtEntry(en)}`);
  await page.click('#ev .ds-chip >> nth=2');
  await page.click('#conf button:has-text("4")');
  await page.keyboard.press('ArrowLeft');
  await page.waitForSelector('#toast #now');
  const t0 = Date.now();
  await page.click('#toast #now');
  await page.waitForSelector('.reveal .name', { timeout: 1500 });
  check('A49 바로 공개 reveals immediately', (await page.locator('.reveal .name').innerText()).startsWith('마이크론') && Date.now() - t0 < 1500, `${Date.now() - t0}ms`);
  st = await S(page);
  check('A50 keyboard judgment = underperform, hit', st.judgments[1].direction === 'underperform' && st.judgments[1].result.hit === true && st.judgments[1].gesture.via === 'button');
  check('A51 verdict hit wording', (await page.locator('.verdict').innerText()).includes('판단한 방향과 같아요'));
  await page.waitForSelector('#explain .ex-line');
  check('X6 explainer hit + no-risk variants (방향 같음 / 위험 요인 권유)', (await page.locator('#explain .ex-line--read').innerText()).includes('고른 방향과 같았어요') && (await page.locator('#explain .ex-line--change').innerText()).includes('위험 요인도 하나 골라'), (await page.locator('#explain').innerText()).replace(/\s+/g, ' '));
  await page.click('.ds-selfcheck button[data-v="x"]');
  check('S5 second card self-check = x', (await S(page)).judgments[1].self_check === 'x');
  const wrong2 = await page.evaluate(() => 1 - IFSAVE.CONCEPTS['debt-and-cycle'].quiz.answer);
  await page.click(`.concept .opt[data-i="${wrong2}"]`);
  st = await S(page);
  check('A52 wrong answer → level 0, state 복습 필요', st.review['debt-and-cycle'].level === 0 && st.concept_progress['debt-and-cycle'].state === 'review');
  check('A53 wrong answer shows correct option', (await page.locator('.concept .opt.ok').count()) === 1 && (await page.locator('.concept .opt.no').count()) === 1);

  // 카드 3: 되돌리기 → 다시 스와이프
  await page.click('#next');
  await page.waitForSelector('#stage .sc');
  await page.click('#ev .ds-chip >> nth=0');
  await page.click('#conf button:has-text("2")');
  await page.click('#btnL');
  await page.waitForSelector('#toast #undo');
  await page.click('#toast #undo');
  st = await S(page);
  check('A54 undo removes judgment', st.judgments.length === 2 && st.events.some(e => e.event === 'undo'));
  check('A55 gate reset after undo', (await page.locator('#ev .ds-chip[aria-pressed="true"]').count()) === 0 && (await page.locator('#conf button[aria-pressed="true"]').count()) === 0 && (await page.locator('#btnL').isDisabled()));
  check('A56 same card back after undo', (await page.locator('#stage .sc:last-child .meta').innerText()).includes('소비재'));
  await page.click('#ev .ds-chip >> nth=1');
  await page.click('#conf button:has-text("5")');
  await dragCard(page, -230);
  await page.waitForSelector('#toast #now', { timeout: 2000 });
  st = await S(page);
  check('A57 swipe judgment logged with gesture', st.judgments.length === 3 && st.judgments[2].gesture.via === 'swipe' && st.judgments[2].direction === 'underperform', JSON.stringify(st.judgments[2] && st.judgments[2].gesture));
  check('A58 toast shows 망설임 for swipe', (await page.locator('#toast').innerText()).includes('망설임'));
  await page.click('#toast #now');
  await page.waitForSelector('.reveal .name');
  check('A59 third reveal = 코카콜라', (await page.locator('.reveal .name').innerText()).startsWith('코카콜라'));
  check('S6 difficulty-1 card asks no self-check (docs/06 §9 난이도 2부터)', (await page.evaluate(() => IFSAVE.CASES.find(c => c.id === 'c003').difficulty)) === 1 && (await page.locator('.ds-selfcheck').count()) === 0 && (await page.locator('.ds-hl').count()) >= 2);
  check('A60 next label = 계속', (await page.locator('#next').innerText()).startsWith('계속'));
  await page.click('#next');
  await page.waitForSelector('.done-title');
  check('A61 done screen 오늘은 여기까지', (await page.locator('.done-title').innerText()) === '오늘은 여기까지');
  check('A62 concept summary listed', (await page.locator('.csum li').count()) >= 3);
  check('A63 deck exhausted message, no 한 장 더', (await page.locator('.exhausted').innerText()).includes('준비된 카드를 모두 봤어요') && (await page.locator('#more').count()) === 0);
  en = await entry(page);
  check('A64 header 오늘 3/3 + done strip 오늘 끝 (deck empty) · 스트릭 1일', /^오늘 3\/3/.test(await top(page)) && en.sub === '오늘 끝' && en.streak === '스트릭 1일', `${await top(page)} | ${fmtEntry(en)}`);
  check('H3 no .ds-hl on the done screen', (await page.locator('.ds-hl').count()) === 0);
  await shotFull(page, `${SCRATCH}/x-done.png`);

  // 일지
  await page.click('#nav button[data-v="journal"]');
  await page.waitForSelector('.jlist');
  const rows = await page.locator('.jrow').allInnerTexts();
  check('A65 journal newest first, 3 rows', rows.length === 3 && rows[0].includes('코카콜라 (KO)') && rows[2].includes('어도비 (ADBE)'), rows.map(r => r.split('\n')[0]).join(' / '));
  check('A66 journal row fields', rows[2].includes('알고 판단') && rows[2].includes('시장보다 앞섰다') && rows[2].includes('매출 +23%') && rows[2].includes('3/5') && rows[2].includes('뒤짐'), rows[2].replace(/\s+/g, ' '));
  check('A67 알고 판단 tag only on recognized', (await page.locator('.jrow .tag').count()) === 1);
  check('A68 stats summary locked text', (await page.locator('details.stats summary').innerText()) === '통계 (20장 뒤에 열려요 · 지금 3장)');
  check('A69 stats collapsed by default', !(await page.locator('details.stats').evaluate(d => d.open)));
  check('A70 export/reset buttons in journal', (await page.locator('#export').count()) === 1 && (await page.locator('#reset').count()) === 1);
  check('A71 no colored result classes in journal', (await page.locator('.ds-up, .ds-down').count()) === 0);
  const marks = await page.evaluate(() => [...document.querySelectorAll('.jrow')].map(r => { const m = r.querySelector('.jmark'); return m ? `${m.innerText}|${m.getAttribute('role')}|${m.getAttribute('aria-label')}` : '-'; }));
  check('S7 journal rows show ○△✕ mark with aria-label 개념 확인 (none for unasked card)', marks.join(' / ') === '- / ✕|img|개념 확인: 달랐다 / △|img|개념 확인: 일부', marks.join(' / '));
  check('S8 journal has no self-check tally/score', !/[○△✕]\s*\d/.test(await page.locator('.screen').innerText()));
  check('H4 no .ds-hl in the journal', (await page.locator('.ds-hl').count()) === 0);
  // 연습 달력
  let ce = await calExpect(page, 0), cs = await calShown(page);
  check('CAL1 calendar at top of 일지: month title + 월~일 headers', cs.title === ce.title && (await page.locator('.cal-grid th').allInnerTexts()).join('') === '월화수목금토일' && (await page.evaluate(() => document.querySelector('.top').nextElementSibling.id)) === 'cal', `${cs.title}`);
  check('CAL2 today = pen ring (one cell) with a done dot after judging today', cs.today.join() === String(ce.todayN) && cs.todayDone === 1 && cs.done.join() === ce.practicedDays.join(), JSON.stringify({ today: cs.today, done: cs.done }));
  check('CAL3 scheduled reviews = outlined ring on their (future) days', cs.due.join() === ce.dueDays.join() && cs.due.every(d => d >= ce.todayN), `shown ${cs.due} expected ${ce.dueDays}`);
  check('CAL4 caption 이달 연습 n일 · 복습 n개', cs.cap === `이달 연습 ${ce.practicedDays.length}일 · 복습 ${ce.dueCount}개`, cs.cap);
  const ringColor = await page.locator('.cal-day--today .cal-n').evaluate(n => getComputedStyle(n, '::after').borderTopColor);
  const dotColor = await page.locator('.cal-day--done .cal-mk').first().evaluate(n => getComputedStyle(n).backgroundColor);
  check('CAL5 never coloured by result: only practice/due/today/future classes, ink dot, pen ring', cs.classes.every(c => ['cal-day', 'cal-day--done', 'cal-day--due', 'cal-day--today', 'cal-day--future'].includes(c)) && (await page.locator('.cal .ds-up, .cal .ds-down, .cal .jstate').count()) === 0 && dotColor === 'rgb(28, 27, 26)' && ringColor === 'rgb(215, 38, 61)', JSON.stringify({ classes: cs.classes, dotColor, ringColor }));
  check('CAL6 ‹ disabled with no earlier practice; › only if reviews fall in a later month', cs.prevDisabled === true && cs.nextDisabled === !(await page.evaluate(() => Object.values(State.get().review).some(r => State.dayKey(r.due_at).slice(0, 7) > State.dayKey().slice(0, 7)))));
  await page.screenshot({ path: `${OUT}/06-calendar.png` });
  await shotFull(page, `${OUT}/04-journal.png`);

  // 개념
  await page.click('#nav button[data-v="concepts"]');
  await page.waitForSelector('.clist');
  const crow = await page.locator('.crow').allInnerTexts();
  check('A72 concepts list 4 items', crow.length === 4);
  check('A73 concept states + due', crow[0].includes('학습 중') && crow[0].includes('복습 예정: 내일') && crow[2].includes('복습 필요') && crow[1].includes('신규') && crow[1].includes('복습 예정 없음'), crow.map(c => c.replace(/\s+/g, ' ')).join(' / '));
  await shotFull(page, `${OUT}/05-concepts.png`);
  const hlList = await page.locator('.ds-hl').count();
  await page.click('.crow[data-c="growth-vs-valuation"]');
  await page.waitForSelector('.concept .opt');
  check('H5 no .ds-hl on the concept tab (list + detail)', hlList === 0 && (await page.locator('.ds-hl').count()) === 0);
  const ans3 = await page.evaluate(() => IFSAVE.CONCEPTS['growth-vs-valuation'].quiz.answer);
  await page.click(`.concept .opt[data-i="${ans3}"]`);
  st = await S(page);
  check('A74 concept-tab quiz schedules review', st.review['growth-vs-valuation'] && st.review['growth-vs-valuation'].level === 0 && st.quiz_log.some(q => q.via === 'concepts'));
  // 같은 날 다시 맞혀도 간격이 부풀지 않는다
  await page.click('#back'); await page.click('.crow[data-c="growth-vs-valuation"]');
  await page.click(`.concept .opt[data-i="${ans3}"]`);
  st = await S(page);
  check('A75 early correct answer does not inflate level', st.review['growth-vs-valuation'].level === 0);

  // 복습: 모든 복습일을 과거로 당기고 새로고침 → 카드 3장은 끝났으니 복습 문제(최대 2개)
  await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); Object.values(s.review).forEach(r => { r.due_at = new Date(Date.now() - 3600e3).toISOString(); }); localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await page.reload();
  await page.waitForSelector('.top');
  check('A76 due review shown after cards (복습 1/2)', /복습 1\/2/.test(await top(page)), await top(page));
  en = await entry(page);
  check('E4 review screen strip: 개념 이해 counts 이해 concepts · 복습 예정 = today\'s review quizzes', en && en.lead === '개념 이해 1/4 · 복습 예정 2개' && en.sub === '오늘 끝', fmtEntry(en));
  const rid1 = await page.evaluate(() => State.dueReviews()[0]);
  const rans1 = await page.evaluate(id => IFSAVE.CONCEPTS[id].quiz.answer, rid1);
  await page.click(`.concept .opt[data-i="${rans1}"]`);
  st = await S(page);
  check('A77 due + correct → level 1 (3 days)', st.review[rid1].level === 1, `${rid1}: ${JSON.stringify(st.review[rid1])}`);
  await page.click('#next');
  await page.waitForSelector('.top');
  check('A78 second review (복습 2/2)', /복습 2\/2/.test(await top(page)), await top(page));
  en = await entry(page);
  check('E5 strip 복습 예정 counts down (1개)', en && en.lead.endsWith('· 복습 예정 1개'), fmtEntry(en));
  const rid2 = await page.evaluate(() => State.dueReviews()[0]);
  await page.click('.concept .opt >> nth=0');
  await page.click('#next');
  await page.waitForSelector('.done-title');
  const dueLeft = await page.evaluate(() => State.dueReviews().length);
  check('A79 max 2 reviews per day (still due but done screen)', dueLeft >= 1, `due left: ${dueLeft}`);
  check('A80 review_view/quiz via review logged', (await S(page)).quiz_log.filter(q => q.via === 'review').length === 2);

  // 다른 탭으로 갔다가 돌아오면 대기 중인 판단은 공개된다 (되돌리기 창 중 이탈)
  // → C 컨텍스트에서 확인

  /* ===== B. 스트릭·통계 잠금 해제·세 가지 결과 상태 (주입 데이터) ===== */
  const ctx2 = await browser.newContext({ viewport: { width: 380, height: 760 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  const p2 = await ctx2.newPage(); watch(p2, errors);
  await p2.goto(URL);
  await p2.evaluate(() => localStorage.setItem('bokgi.onboarded', '1'));
  // 상태 계산 단위 확인
  const tri = await p2.evaluate(() => {
    const out = [];
    const cases = [[5.5, 5.0, 'outperform'], [6.1, 5.0, 'outperform'], [4.0, 5.0, 'outperform'], [6.0, 5.0, 'underperform'], [4.0, 5.0, 'underperform'], [3.9, 5.0, 'underperform'], [5.0, 5.0, 'outperform']];
    cases.forEach(([a, b, dir]) => {
      const j = State.addJudgment({ case_id: 'zz', case_version: 1, direction: dir, key_evidence: 'x', confidence: 3 });
      const r = State.reveal(j.id, { return_pct: a, bench_return_pct: b, bench: 'B', company: 'C', ticker: 'T', period: 'P' });
      out.push(`${(a - b).toFixed(1)}/${dir}→${r.state}:${r.hit}`);
    });
    State.reset(); localStorage.setItem('bokgi.onboarded', '1');
    return out;
  });
  check('B1 three-state (|rel|≤1 even/null, else ahead/behind + hit)', tri.join(' ') === '0.5/outperform→even:null 1.1/outperform→ahead:true -1.0/outperform→even:null 1.0/underperform→even:null -1.0/underperform→even:null -1.1/underperform→behind:true 0.0/outperform→even:null', tri.join(' '));

  // 스트릭: 어제·그제 판단 + 나흘 전(끊김)
  await p2.evaluate(k => {
    const at = n => { const x = new Date(); x.setDate(x.getDate() - n); x.setHours(12, 0, 0, 0); return x.toISOString(); };
    const mk = (id, cid, n, ev, conf, state, hit) => ({ id, case_id: cid, case_version: 1, direction: 'outperform', key_evidence: ev, risk_factor: null, confidence: conf, recognized: false, created_at: at(n), revealed_at: at(n),
      result: { relative_pp: state === 'even' ? 0.5 : hit ? 3 : -3, state, hit, return_pct: 1, bench_return_pct: 1, bench: 'S&P 500', company: '주입사', ticker: 'INJ', period: 'P' } });
    const s = { judgments: [mk('j1', 'c001', 4, '매출 +23%', 3, 'behind', false), mk('j2', 'c002', 2, '부채비율 88%', 4, 'ahead', true), mk('j3', 'c003', 1, 'PER 24 vs 21', 2, 'even', null)],
      events: [], concept_progress: {}, review: {}, quiz_log: [], reports: [], session: null };
    localStorage.setItem(k, JSON.stringify(s));
  }, KEY);
  await p2.reload();
  await p2.waitForSelector('.top');
  let en2 = await entry(p2);
  check('B2 streak counts yesterday+day before, not 4 days ago (2일, in the strip)', en2 && en2.streak === '스트릭 2일' && !(await top(p2)).includes('스트릭'), fmtEntry(en2));
  check('B3 deck exhausted with 0 today → 준비된 카드를 모두 봤어요 + strip 남은 카드 없음', (await p2.locator('.done-title').innerText()) === '준비된 카드를 모두 봤어요' && en2.sub === '남은 카드 없음', fmtEntry(en2));

  // 통계: 판단 24장(비슷 4장 포함) 주입 → 잠금 해제
  await p2.evaluate(k => {
    const s = JSON.parse(localStorage.getItem(k));
    const evs = ['매출 +23%', 'PER 38 vs 27', '부채비율 88%', '가이던스 하향'];
    for (let i = 0; i < 21; i++) {
      const state = i % 6 === 0 ? 'even' : i % 2 ? 'ahead' : 'behind', hit = state === 'even' ? null : i % 3 === 1;   // 확신 5인데 같은 방향 7/17 → 확신 과잉
      s.judgments.push({ id: 'jx' + i, case_id: 'c00' + (1 + (i % 3)), case_version: 1, direction: 'outperform', key_evidence: evs[i % 4], risk_factor: null, confidence: 5, recognized: i % 5 === 0,
        created_at: new Date(Date.now() - (30 - i) * 864e5).toISOString(), result: { relative_pp: 2, state, hit, return_pct: 1, bench_return_pct: 1, bench: 'S&P 500', company: '주입사', ticker: 'INJ', period: 'P' } });
    }
    localStorage.setItem(k, JSON.stringify(s));
  }, KEY);
  await p2.reload();
  await p2.click('#nav button[data-v="journal"]');
  await p2.waitForSelector('details.stats');
  const dates = await p2.locator('.jrow-date').allInnerTexts();
  const exp = await p2.evaluate(() => State.get().judgments.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(j => { const d = new Date(j.created_at); return `${d.getMonth() + 1}월 ${d.getDate()}일`; }));
  check('B10 journal newest first by created_at', dates.join(',') === exp.join(','), dates.slice(0, 4).join(', ') + ' …');
  // 연습 달력: 이번 달 → ‹ 이전 달 → › 이번 달 (판단이 30일 전까지 있음)
  let ce2 = await calExpect(p2, 0), cs2 = await calShown(p2);
  check('CAL7 current month: practice dots = days with judgments, caption 이달', cs2.done.join() === ce2.practicedDays.join() && cs2.cap === `이달 연습 ${ce2.practicedDays.length}일 · 복습 0개` && cs2.todayDone === 0 && cs2.today.length === 1, `${cs2.cap} dots=${cs2.done}`);
  const minMonth = await p2.evaluate(() => State.get().judgments.map(j => State.dayKey(j.created_at).slice(0, 7)).sort()[0] < State.dayKey().slice(0, 7));
  if (minMonth) {
    await p2.click('#cal-prev');
    const pe = await calExpect(p2, -1), ps = await calShown(p2);
    check('CAL8 ‹ shows previous month: title, dots, caption "{m}월 연습", no today ring', ps.title === pe.title && ps.done.join() === pe.practicedDays.join() && ps.cap === `${pe.month}월 연습 ${pe.practicedDays.length}일 · 복습 0개` && ps.today.length === 0 && ps.nextDisabled === false, `${ps.title} ${ps.cap}`);
    check('CAL9 month change logged (calendar_month) and focus kept on the nav', (await S(p2)).events.some(e => e.event === 'calendar_month' && e.payload.shift === -1) && (await p2.evaluate(() => document.activeElement && ['cal-prev', 'cal-title'].includes(document.activeElement.id))));
    await p2.click('#cal-next');
    const back = await calShown(p2);
    check('CAL10 › returns to this month; › disabled with no future reviews', back.title === ce2.title && back.cap.startsWith('이달 연습') && back.nextDisabled === true, `${back.title} ${back.cap}`);
  } else check('CAL8-10 month navigation (skipped: all injected judgments fall in this month today)', true);
  const sum = await p2.locator('details.stats summary').innerText();
  check('B4 stats unlocked at ≥20', sum === '통계 (지금 24장)', sum);
  await p2.click('details.stats summary');
  await p2.waitForFunction(() => document.querySelector('details.stats').open);
  await p2.waitForTimeout(100);   // toggle 이벤트는 비동기로 온다
  const statsText = await p2.locator('.stats-body').innerText();
  const ins = await p2.locator('.stats-body .ds-insight p').allInnerTexts();
  check('B5 insight cards (1–3, one sentence each, counts only) replace raw stat rows', ins.length === 3 && (await p2.locator('.stats-body .ds-kv').count()) === 0
    && ins[0] === '확신도 5를 준 판단 21번 중 시장보다 앞선 것은 10번이었어요.'
    && ins[1] === "'매출'을 근거로 한 판단 7번 중 5번이 시장보다 뒤졌어요."
    && ins[2] === '아는 회사 판단 5번과 모르는 회사 판단 19번의 앞섬 횟수는 2번·9번이었어요.', '\n      ' + ins.join('\n      '));
  check('B6 no "%" anywhere in insight cards or the stats body', ins.length > 0 && !ins.join('').includes('%') && !statsText.includes('%'));
  check('B6b insight cards: no big numbers (same size as body text, no bold counts)', await p2.evaluate(() => [...document.querySelectorAll('.ds-insight p')].every(p => parseFloat(getComputedStyle(p).fontSize) <= 14 && !p.querySelector('b, strong'))));
  check('B7 calibration note (all conf 5 → over)', statsText.includes('확신이 근거보다 앞서는 편이에요'), statsText.split('\n').find(l => l.includes('확신')) || '');
  st = await S(p2);
  check('B8 stats_toggle logged', st.events.some(e => e.event === 'stats_toggle' && e.payload.open === true && e.payload.unlocked === true), JSON.stringify(st.events.map(e => e.event + (e.payload && e.payload.open !== undefined ? ':' + e.payload.open : ''))));
  // 보정 문구 4종 단위 확인 (S.judgments를 잠시 바꿔 State.stats만 호출)
  const cal = await p2.evaluate(() => {
    const S = State.get(), saved = S.judgments, out = {};
    const mk = (n, conf, hits, evens = 0) => Array.from({ length: n + evens }, (_, i) => ({ key_evidence: 'e', confidence: conf, result: i < evens ? { state: 'even', hit: null } : { state: 'ahead', hit: i - evens < hits } }));
    S.judgments = mk(20, 5, 10); out.over = State.stats().calibration;          // 기대 0.9 vs 실제 0.5
    S.judgments = mk(20, 1, 18); out.under = State.stats().calibration;         // 기대 0.5 vs 실제 0.9
    S.judgments = mk(20, 3, 14); out.fit = State.stats().calibration;           // 기대 0.7 vs 실제 0.7
    S.judgments = mk(9, 5, 9, 15); out.few = State.stats().calibration;         // 24장이지만 비슷함 빼면 9장
    out.lockedAt19 = (S.judgments = mk(19, 3, 10), State.stats().locked); out.lockedAt20 = (S.judgments = mk(20, 3, 10), State.stats().locked);
    S.judgments = saved; return out;
  });
  check('B9 calibration over/under/fit/few + lock at 20', cal.over === 'over' && cal.under === 'under' && cal.fit === 'fit' && cal.few === 'few' && cal.lockedAt19 === true && cal.lockedAt20 === false, JSON.stringify(cal));
  // 인사이트 규칙 단위 확인: 같은 조건 3번 미만이면 뺀다, 뒤짐 없는 근거는 뺀다, 확신도 동률은 높은 쪽
  const insU = await p2.evaluate(() => {
    const S = State.get(), saved = S.judgments, out = {};
    const mk = (conf, ev, state, rec) => ({ key_evidence: ev, confidence: conf, recognized: rec, result: { state, hit: state === 'even' ? null : state === 'ahead' } });
    S.judgments = [mk(1, 'A 1', 'ahead'), mk(2, 'A 2', 'behind'), mk(3, 'B 3', 'behind'), mk(4, 'C', 'ahead', true), mk(5, 'C', 'ahead', true)];
    out.small = State.stats().insights.map(i => i.kind);                                   // 모두 3번 미만
    S.judgments = [mk(4, 'X 1', 'ahead'), mk(4, 'X 2', 'ahead'), mk(4, 'X 3', 'even'), mk(5, 'Y', 'behind'), mk(5, 'Y', 'ahead'), mk(5, 'Y', 'ahead')];
    out.tie = State.stats().insights;                                                      // 확신도 4·5 동률 → 5, X는 뒤짐 0 → 빼고 Y
    const st = State.stats(); out.keys = Object.keys(st).sort().join(',');
    S.judgments = saved; return out;
  });
  check('B11 insight rules: skip <3, skip evidence with no 뒤짐, tie → higher confidence, API keys kept', insU.small.length === 0
    && insU.tie.length === 2 && insU.tie[0].kind === 'confidence' && insU.tie[0].level === 5 && insU.tie[0].n === 3 && insU.tie[0].k === 2
    && insU.tie[1].kind === 'evidence' && insU.tie[1].label === 'Y' && insU.tie[1].k === 1
    && insU.keys === 'calibration,decided,evidence,insights,lock,locked,total', JSON.stringify(insU));
  const jo = await p2.evaluate(() => [['매출', '을', '를'], ['PER', '을', '를'], ['금리', '을', '를'], ['5', '을', '를'], ['3', '을', '를'], ['가이던스 상향', '이', '가'], ['매출 +23%', '과', '와'], ['FCF 음수', '을', '를'], ['절대수익과 시장 대비', '이에요', '예요'], ['높은 성장률과 높은 밸류에이션', '이에요', '예요']].map(a => State.josa(...a)).join(' '));
  const kinds = await p2.evaluate(() => ['PER 38 vs 27', '매출 +23%', '매출 −8%', '가이던스 하향', '금리 5.25%', '순현금 보유'].map(State.evidenceKind).join('|'));
  check('B12 Korean particles follow the final sound (josa) + evidence kinds strip numbers', jo === '을 을 를 를 을 이 와 를 예요 이에요' && kinds === 'PER|매출|매출|가이던스 하향|금리|순현금 보유', `${jo} / ${kinds}`);
  await shotFull(p2, `${SCRATCH}/x-journal-stats.png`);

  /* ===== C. 비슷함 공개 화면 · 한 장 더 · 되돌리기 창 중 이탈 (카드 4장짜리 덱 주입) ===== */
  const ctx3 = await browser.newContext({ viewport: { width: 380, height: 760 }, deviceScaleFactor: 2, locale: 'ko-KR' });
  await ctx3.addInitScript(() => {
    const o = {}; let cases, outs;
    Object.defineProperty(o, 'CASES', { configurable: true, get: () => cases, set: v => { cases = v.concat([Object.assign({}, v[0], { id: 'c004' })]); } });
    Object.defineProperty(o, 'OUTCOMES', { configurable: true, get: () => outs, set: v => { outs = Object.assign({}, v, { c004: Object.assign({}, v.c001, { company: '테스트사', ticker: 'TST', return_pct: 7.5 }) }); } });
    window.IFSAVE = o;
    try { localStorage.setItem('bokgi.onboarded', '1'); } catch (e) {}
  });
  const p3 = await ctx3.newPage(); watch(p3, errors);
  await p3.goto(URL);
  await p3.waitForSelector('#stage .sc');
  // 되돌리기 창 중 다른 탭으로 이탈 → 돌아오면 공개
  await p3.click('#ev .ds-chip >> nth=0'); await p3.click('#conf button:has-text("1")');
  await p3.click('#btnR');
  await p3.waitForSelector('#toast #undo');
  await p3.click('#nav button[data-v="journal"]');
  check('C1 leaving during undo window → journal shows 결과 대기', (await p3.locator('.jstate--wait').count()) === 1 && (await p3.locator('.jrow-title').innerText()) === '소프트웨어 · 대형');
  check('C1b calendar counts the unrevealed judgment as practice (today dot)', (await p3.locator('.cal-day--today.cal-day--done').count()) === 1 && (await p3.locator('.cal-cap').innerText()).startsWith('이달 연습 1일'));
  await p3.waitForTimeout(2800);
  check('C2 no auto-reveal hijack on other tab', (await p3.locator('.jlist').count()) === 1);
  await p3.click('#nav button[data-v="today"]');
  await p3.waitForSelector('.reveal .name');
  check('C3 returning to 오늘 reveals pending judgment', (await p3.locator('.reveal .name').innerText()).startsWith('어도비'));
  // 카드 2·3 바로 공개
  for (let i = 0; i < 2; i++) {
    await p3.click('#next'); await p3.waitForSelector('#stage .sc');
    await p3.click('#ev .ds-chip >> nth=0'); await p3.click('#conf button:has-text("2")');
    await p3.click('#btnL'); await p3.waitForSelector('#toast #now'); await p3.click('#toast #now');
    await p3.waitForSelector('.reveal .name');
  }
  await p3.click('#next');
  await p3.waitForSelector('.done-title');
  check('C4 done with cards left → 한 장 더 button', (await p3.locator('#more').count()) === 1 && (await p3.locator('.done-title').innerText()) === '오늘은 여기까지');
  let en3 = await entry(p3);
  check('E6 done strip = 오늘 끝 · 한 장 더 가능 (no extra tap needed for the 3 cards)', en3 && en3.sub === '오늘 끝 · 한 장 더 가능' && en3.lead.startsWith('개념 이해 ') && en3.streak === '스트릭 1일', fmtEntry(en3));
  await p3.click('#more');
  await p3.waitForSelector('#stage .sc');
  check('C5 extra card header', /한 장 더/.test(await top(p3)), await top(p3));
  en3 = await entry(p3);
  check('E7 extra card strip = 오늘 끝 · 한 장 더 보는 중', en3 && en3.sub === '오늘 끝 · 한 장 더 보는 중', fmtEntry(en3));
  st = await S(p3);
  check('C6 extra_card logged', st.events.some(e => e.event === 'extra_card' && e.payload.case_id === 'c004'));
  await p3.click('#ev .ds-chip >> nth=1'); await p3.click('#conf button:has-text("3")');
  await p3.click('#btnR'); await p3.waitForSelector('#toast #now'); await p3.click('#toast #now');
  await p3.waitForSelector('.reveal .name');
  const v3 = await p3.locator('.verdict').innerText();
  const n3 = await p3.locator('.ds-nums b').allInnerTexts();
  check('C7 even reveal wording', v3.includes('거의 같았어요 — 적중·실패로 세지 않아요'), v3.replace(/\s+/g, ' '));
  check('C8 even stamp + ■ + neutral color', (await p3.locator('.verdict .ds-stamp--even').count()) === 1 && n3[2] === '■+0.4%p' && !(await p3.locator('.ds-nums div:nth-child(3) b').getAttribute('class')).includes('ds-'), JSON.stringify(n3));
  st = await S(p3);
  check('C9 even → hit null, extra flag stored', st.judgments[3].result.state === 'even' && st.judgments[3].result.hit === null && st.judgments[3].extra === true);
  await p3.waitForSelector('#explain .ex-line');
  check('X7 even explainer: read line restates 거의 같았어요 with the revealed +0.4%p', (await p3.locator('#explain .ex-line--read').innerText()).includes('시장 대비 +0.4%p로 시장과 거의 같았어요') && (await p3.locator('#explain .ex-line--concept .ds-hl').count()) === 1, (await p3.locator('#explain .ex-line--read').innerText()).replace(/\s+/g, ' '));
  await shotFull(p3, `${SCRATCH}/x-reveal-even.png`);
  await p3.click('#next');
  await p3.waitForSelector('.done-title');
  check('C10 header shows 3/3 +1 after extra', /오늘 3\/3 \+1/.test(await top(p3)), await top(p3));

  /* ===== D. 판 내용이 카드 안에서 잘리지 않는지 (카드 3장 × 판 3개, 380px) ===== */
  const ctx4 = await browser.newContext({ viewport: { width: 380, height: 760 }, deviceScaleFactor: 1, locale: 'ko-KR' });
  await ctx4.addInitScript(() => { try { localStorage.setItem('bokgi.onboarded', '1'); } catch (e) {} });
  const p4 = await ctx4.newPage(); watch(p4, errors);
  await p4.goto(URL);
  const over = [];
  for (let i = 0; i < 3; i++) {
    await p4.waitForSelector('#stage .sc');
    for (const k of ['numbers', 'flow', 'context']) {
      await p4.click(`#stage .sc:last-child .panel-tabs button[data-panel="${k}"]`).catch(() => {});
      const m = await p4.evaluate(() => { const p = document.querySelector('#stage .sc:last-child .panel'); const meta = document.querySelector('#stage .sc:last-child .meta'); return { id: document.querySelector('#stage .sc:last-child .meta').innerText.split('\n')[0], sh: p.scrollHeight, ch: p.clientHeight, metaH: meta.offsetHeight }; });
      over.push(`${m.id}/${k}: ${m.sh}/${m.ch}${m.sh > m.ch ? ' OVERFLOW' : ''} meta=${m.metaH}`);
    }
    await p4.click('#ev .ds-chip >> nth=0'); await p4.click('#conf button:has-text("3")');
    await p4.click('#btnR'); await p4.waitForSelector('#toast #now'); await p4.click('#toast #now');
    await p4.waitForSelector('.reveal .name'); await p4.click('#next');
  }
  check('D1 no panel needs inner scroll at 380px', !over.some(s => s.includes('OVERFLOW')), '\n      ' + over.join('\n      '));

  await browser.close();
  console.log(results.join('\n'));
  console.log(`\n${results.filter(r => r.startsWith('PASS')).length} passed, ${results.filter(r => r.startsWith('FAIL')).length} failed`);
  console.log('console errors/warnings:', errors.length ? '\n' + errors.join('\n') : 'none');
})().catch(e => { console.error('SMOKE CRASH', e); process.exit(1); });

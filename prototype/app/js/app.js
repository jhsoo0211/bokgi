/* 복기 프로토타입 — 화면 흐름 (빌드 없이 file://로 연다)
   오늘: 첫 실행 안내 3장 → 입장 카드(개념 이해·복습 예정 / 오늘 남은 카드 · 스트릭) + 카드(판: 흐름·숫자·그때)
         → 아는 회사 체크·핵심 근거·확신도(게이트) → 스와이프 / 버튼 / 키보드(← →) → 되돌리기 2.5초(바로 공개 가능)
         → 결과 공개(○△✕ 자기 평가, 해설 세 줄) → 개념·확인 문제
         → 카드 3장 뒤 복습 문제(하루 최대 2개) → 오늘은 여기까지(한 장 더 허용)
   일지: 연습 달력 + 판단 기록(최신순, 자기 평가 표시) + 통계(20장 뒤에 열림, 인사이트 카드) + 연구 로그 내보내기·세션 초기화
   개념: 개념 목록(숙련도·복습 예정) → 설명·확인 문제
   규칙: 판단 결과 데이터와 상승·하락 색 클래스, 형광펜 밑줄 클래스는 showReveal 안에서만 쓴다.
         다른 화면은 공개 때 판단 기록에 붙여 둔 값(j.result)만 읽는다. 달력·입장 카드는 결과 상태로 칠하지 않는다. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmt = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1);
  const md = d => `${d.getMonth() + 1}월 ${d.getDate()}일`;

  const DAILY_CARDS = 3, DAILY_REVIEWS = 2, UNDO_MS = 2500, STATS_LOCK = 20;
  const PANELS = [['flow', '흐름'], ['numbers', '숫자'], ['context', '그때']];
  const DEFAULT_PANEL = 'numbers';
  const DIR = { outperform: '시장보다 앞섰다', underperform: '시장보다 뒤졌다' };
  const RESULT = { ahead: '앞섬', behind: '뒤짐', even: '비슷' };
  const SHAPE = { ahead: '▲', behind: '▼', even: '■' };
  const CONCEPT_STATE = { new: '신규', learning: '학습 중', review: '복습 필요', known: '이해' };
  const REPORT_CATS = ['데이터 오류', '기업 유추 가능', '중요 정보 누락', '결과 설명 부정확', '개념 설명 이해 어려움', '출처 오류', 'AI 추론이 사실처럼 보임', '기타'];
  const CALIBRATION = {
    few: '비슷함을 뺀 판단이 10장 넘게 쌓이면 확신도 보정을 글로 알려 드려요.',
    over: '확신도를 높게 고른 만큼 결과가 판단과 같은 방향이지는 않았어요 — 확신이 근거보다 앞서는 편이에요.',
    under: '고른 확신도에 비해 결과가 판단과 같은 방향인 때가 많았어요 — 확신도를 낮게 고르는 편이에요.',
    fit: '고른 확신도와 결과가 대체로 어울려요.'
  };
  /* ○△✕ 자기 평가: 원칙을 지켰나가 아니라 '내 근거가 이 개념과 맞았나'를 묻는 개념 확인. 기록만, 점수 없음 */
  const SELF_CHECK = { o: ['○', '맞았다'], tri: ['△', '일부'], x: ['✕', '달랐다'] };
  const SELF_CHECK_FB = {
    o: '기록했어요. 일지에 ○로 남아요.',
    tri: '기록했어요. 아래 개념 설명에서 근거와 어긋난 부분을 찾아보세요.',
    x: '기록했어요. 아래 개념 설명을 먼저 읽고 확인 문제를 풀어 보세요.'
  };
  const SELF_CHECK_FROM = 2;   // 난이도 2 이상 카드에서만 묻는다 (docs/06 §9 '난이도 2부터')
  /* 해설 세 줄: 화면은 이 순서로 그린다. 개념 연결이 늘 마지막이고 가장 진하다 */
  const EXPLAIN_PARTS = [['read', '이번에 잘 읽은 것'], ['change', '다음에 바꿀 것'], ['concept', '개념 연결']];
  const LABEL_TEXT = { source: '📄 출처', inference: '🔍 추론', uncertain: '❓ 불확실' };
  const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const INSIGHT_KIND = { confidence: '확신도', evidence: '근거', recognized: '아는 회사' };
  const ONBOARDING = [
    { title: '복기는 주가 맞히기 게임이 아니에요', body: '근거를 남기는 연습이에요. 맞혔는지보다 무엇을 보고 판단했는지가 남아요.',
      art: '<span class="ds-chip" aria-pressed="true">근거</span>' },
    { title: '하루 3장, 5분', body: '카드 3장을 판단하고, 전에 배운 개념은 복습 문제로 두 개까지 다시 풀어요.',
      art: '<span class="mini-card"></span><span class="mini-card"></span><span class="mini-card"></span>' },
    { title: '결과와 회사 이름은 판단한 뒤에만 보여요', body: '근거와 확신도를 고르고 판단을 남기면, 그때 회사와 결과가 공개돼요.',
      art: '<span class="masked">회사 ○○○ · 티커 ••••</span>' }
  ];

  const view = $('#view'), nav = $('#nav');
  const deck = IFSAVE.CASES;
  const caseById = id => deck.find(c => c.id === id);
  const freshDraft = () => ({ recognized: false, key_evidence: null, risk: null, confidence: null });   // 확신도 기본값 없음

  let draft = freshDraft();
  let stack = null;
  let locked = false;     // 카드가 날아가기 시작한 뒤 ~ 공개·되돌리기 전: 게이트 잠금(이중 판단 방지)
  let pending = null;     // 되돌리기를 기다리는 판단 { j, card, timer }
  let seq = 0;            // 화면 토큰: 늦게 도착한 콜백이 다른 화면을 덮어쓰지 않게

  function screen(html) {
    seq++;
    document.onkeydown = null;
    view.innerHTML = html;
    view.scrollTop = 0; window.scrollTo(0, 0);
    return seq;
  }

  /* ---------- 공통: 오늘 머리줄, 입장 카드, 날짜 ---------- */
  // 머리줄은 하루 진행(n/3)만. 스트릭은 입장 카드 오른쪽에 작게 한 번만 보인다
  function todayTop(label) {
    const n = State.todayJudgments().length, done = Math.min(n, DAILY_CARDS);
    return `<div class="top"><span>오늘 <b class="ds-num">${done}/${DAILY_CARDS}</b>${n > DAILY_CARDS ? `<span class="ds-num"> +${n - DAILY_CARDS}</span>` : ''}</span><span>${label}</span></div>
      <div class="ds-bar" aria-hidden="true"><i style="width:${(done / DAILY_CARDS) * 100}%"></i></div>`;
  }
  /* 입장 카드: 1줄 학습(개념 이해 n/전체 · 복습 예정 m개), 2줄 오늘 남은 카드, 오른쪽 스트릭.
     복습 예정 = 오늘 세션에서 풀 복습 문제 수(하루 2개 한도 반영). 다음 카드의 개념·결과는 넣지 않는다(결과 암시 방지) */
  function entryStrip(extra) {
    const S = State.get(), ids = Object.keys(IFSAVE.CONCEPTS);
    const known = ids.filter(id => S.concept_progress[id] && S.concept_progress[id].state === 'known').length;
    const n = State.todayJudgments().length, left = unjudged().length;
    const cards = n >= DAILY_CARDS ? `오늘 끝${extra ? ' · 한 장 더 보는 중' : left ? ' · 한 장 더 가능' : ''}`
      : left ? `오늘 남은 카드 <b>${Math.min(DAILY_CARDS - n, left)}장</b>` : '남은 카드 없음';
    return `<div class="ds-entry" role="group" aria-label="오늘 학습">
        <p class="ds-entry-lead">개념 이해 <b>${known}/${ids.length}</b> · 복습 예정 <b>${dueToday().length}개</b></p>
        <p class="ds-entry-sub">${cards}</p>
        <span class="ds-streak">스트릭 ${State.streak()}일</span>
      </div>`;
  }
  function dueLabel(iso) {
    const d = new Date(iso), k = State.dayKey(d);
    if (k <= State.dayKey()) return '오늘';
    const t = new Date(); t.setDate(t.getDate() + 1);
    return k === State.dayKey(t) ? `내일 (${md(d)})` : md(d);
  }
  const unjudged = () => { const seen = new Set(State.get().judgments.map(j => j.case_id)); return deck.filter(c => !seen.has(c.id)); };
  const dueToday = () => State.dueReviews().filter(id => IFSAVE.CONCEPTS[id]).slice(0, Math.max(0, DAILY_REVIEWS - State.reviewsDoneToday().length));

  /* ---------- 오늘: 세션 진행 ---------- */
  function showToday() {
    if (!State.onboarded()) return showOnboarding(0);
    nav.hidden = false;
    // 되돌리기 시간 안에 화면을 떠났던 판단은 돌아오면 바로 공개한다
    const waiting = State.get().judgments.find(j => !j.result && caseById(j.case_id));
    if (waiting) return showReveal(waiting, caseById(waiting.case_id));
    const n = State.todayJudgments().length, left = unjudged();
    if (n < DAILY_CARDS && left.length) return showCard(left.slice(0, DAILY_CARDS - n), false);
    const due = dueToday();
    if (due.length) return showReview(due[0]);
    showDone(left);
  }

  /* ---------- 첫 실행 안내 ---------- */
  function showOnboarding(i) {
    nav.hidden = true;
    const s = ONBOARDING[i], last = i === ONBOARDING.length - 1;
    screen(`<section class="onb" aria-labelledby="onb-title">
        <p class="onb-step ds-num">${i + 1} / ${ONBOARDING.length}</p>
        <div class="onb-art" aria-hidden="true">${s.art}</div>
        <h1 class="onb-title ds-head" id="onb-title">${s.title}</h1>
        <p class="onb-body">${s.body}</p>
        <div class="onb-dots" aria-hidden="true">${ONBOARDING.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <button type="button" class="ds-btn ds-btn--primary wide" id="onb-next">${last ? '시작' : '다음'}</button>
      </section>`);
    $('#onb-next').onclick = () => {
      if (!last) return showOnboarding(i + 1);
      State.setOnboarded(); State.log('onboarding_done', {});
      showToday();
    };
  }

  /* ---------- 카드 앞면 (판단 전 정보만) ---------- */
  function renderCardFace(card) {
    const wrap = h('div', 'ds-card sc-face');
    wrap.innerHTML = `<p class="meta">업종 <b>${card.sector_public}</b> · 규모 <b>${card.size_bucket}</b> · 기간 <b>${Math.round(card.horizon_days / 30)}개월</b> · ${card.year_public ? `<b>${card.year_public}년</b> · 날짜 비공개` : '시점 비공개'}</p>
      <div class="ds-lens panel-tabs" role="group" aria-label="카드 정보">${PANELS.map(([k, t]) => `<button type="button" data-panel="${k}" aria-pressed="false">${t}</button>`).join('')}</div>
      <div class="panel"></div>`;
    const tabs = wrap.querySelector('.panel-tabs'), body = wrap.querySelector('.panel');
    const open = (k, log) => {
      tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.panel === k)));
      body.innerHTML = '';
      body.appendChild(k === 'flow' ? chartBlock(card) : k === 'context' ? contextBlock(card) : fundBlock(card));
      body.scrollTop = 0;
      if (log) State.log('panel_view', { case_id: card.id, panel: k });
    };
    // 판 탭에서는 드래그를 시작하지 않는다: 카드의 포인터 캡처가 탭 클릭을 가로채지 않게 (swipe.js는 그대로)
    tabs.addEventListener('pointerdown', e => e.stopPropagation());
    tabs.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && b.getAttribute('aria-pressed') !== 'true') open(b.dataset.panel, true);
    });
    // 뒤에 깔린 카드는 키보드·스크린리더에서 뺀다
    if (stack && stack.current() !== card) { wrap.setAttribute('aria-hidden', 'true'); tabs.querySelectorAll('button').forEach(b => { b.tabIndex = -1; }); }
    open(DEFAULT_PANEL, false);
    return wrap;
  }
  function chartBlock(card) {
    const p = card.chart.prices_norm, m = card.chart.market_norm;
    const b = h('div', 'block', '<h5>판단일까지 가격 흐름 (처음 = 100)</h5>');
    b.appendChild(spark([{ pts: p, cls: 'ln-main' }, { pts: m, cls: 'ln-bench' }]));
    b.insertAdjacentHTML('beforeend', `<div class="legend"><span><i class="ln-main"></i>이 회사 ${p[p.length - 1]}</span><span><i class="ln-bench"></i>시장 ${m[m.length - 1]}</span></div>
      <p class="panel-note">판단일 이후의 흐름은 판단한 뒤에 보여요.</p>`);
    return b;
  }
  function fundBlock(card) {
    const f = card.fundamental;
    const kv = (k, v, s) => `<div class="ds-kv"><span>${k}</span><b>${v == null ? '데이터 없음' : v}${s ? `<small>${s}</small>` : ''}</b></div>`;
    return h('div', 'block',
      `<h5>성장</h5>${kv('매출 성장률', f.growth.rev_yoy)}${kv('영업이익률 추이', f.growth.opm)}${kv('EPS 성장률', f.growth.eps_yoy)}${kv('가이던스', f.growth.guidance)}` +
      `<h5>밸류에이션</h5>${kv('PER', f.valuation.per, '업종 중앙값 ' + f.valuation.per_sector)}${kv('PBR', f.valuation.pbr)}${kv('PSR', f.valuation.psr)}` +
      `<h5>재무건전성</h5>${kv('부채비율', f.health.debt_ratio)}${kv('순현금', f.health.net_cash)}${kv('잉여현금흐름', f.health.fcf)}`);
  }
  function contextBlock(card) {
    const c = card.context;
    return h('div', 'block',
      `<h5>금리</h5><div class="ds-kv"><span>기준금리</span><b>${c.rate}<small>${c.rate_trend}</small></b></div>` +
      `<h5>판단일 전 소식</h5><ul class="ctx-notes">${c.notes.map(n => `<li><span class="ctx-when ds-num">${n.when}</span><span class="ds-label">${n.source}</span><p>${n.text}</p></li>`).join('')}</ul>` +
      `<p class="panel-note">회사 이름과 정확한 날짜는 판단한 뒤에 보여요.</p>`);
  }
  function spark(series, W = 300, H = 90) {
    const all = series.flatMap(s => s.pts), min = Math.min(...all), max = Math.max(...all), pad = 6;
    const x = (i, n) => (i / (n - 1)) * W, y = v => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
    series.forEach(s => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      p.setAttribute('points', s.pts.map((v, i) => `${x(i, s.pts.length).toFixed(1)},${y(v).toFixed(1)}`).join(' '));
      p.setAttribute('class', s.cls); svg.appendChild(p);
    });
    return svg;
  }

  /* ---------- 오늘: 카드 + 판단 ---------- */
  function showCard(cards, extra) {
    cancelPending(); draft = freshDraft(); locked = false;
    const months = Math.round(cards[0].horizon_days / 30);
    const token = screen(`
      ${todayTop(extra ? '한 장 더' : '판단')}
      ${entryStrip(extra)}
      <div class="stage" id="stage"></div>
      <p class="hint" id="hint" aria-live="polite"></p>
      <fieldset class="gate" id="gate">
        <legend class="sr-only">판단 전에 고르기</legend>
        <label class="check"><input type="checkbox" id="recog"> 이 회사를 아는 것 같아요</label>
        <p class="q ds-head" id="ev-q">가장 중요하게 본 정보는?</p>
        <div class="chips" id="ev" role="group" aria-labelledby="ev-q"></div>
        <p class="q ds-head" id="risk-q">가장 큰 위험 요인은? <small class="ds-muted">(선택)</small></p>
        <div class="chips" id="risk" role="group" aria-labelledby="risk-q"></div>
        <div class="ds-conf"><label id="conf-q">얼마나 확신하나요</label><div class="dots" id="conf" role="group" aria-labelledby="conf-q"></div></div>
        <p class="conf-scale">1 거의 모르겠다 · 5 매우 확신한다</p>
      </fieldset>
      <div class="ds-card judge"><h5>${months}개월 뒤, 이 회사는</h5>
        <div class="swipe">
          <button type="button" class="ds-btn" id="btnL" disabled aria-describedby="hint">← 시장보다 뒤졌다<small>키보드 ←</small></button>
          <button type="button" class="ds-btn ds-btn--primary" id="btnR" disabled aria-describedby="hint">시장보다 앞섰다 →<small>키보드 →</small></button>
        </div>
      </div>
      <p class="hint">맞히는 게 아니라 근거를 남기는 연습이에요</p>
      <p class="toast" id="toast" role="status"></p>`);

    stack = new SwipeStack($('#stage'), {
      renderCard: renderCardFace,
      canSwipe: () => !locked && gateOpen(),
      onBlocked: blocked,
      onCommit: (direction, meta, card) => commit(direction, meta, card, extra, token)
    });
    // 카드가 날아가기 시작하는 순간(onCommit은 220ms 뒤) 게이트를 잠가 이중 판단을 막는다. swipe.js는 고치지 않는다.
    const startCommit = stack._commit.bind(stack);
    stack._commit = (direction, el, meta) => { lock(true); startCommit(direction, el, meta); };
    stack.setDeck(cards);
    stack.render();
    fillGate();

    $('#btnL').onclick = () => judgeBy('underperform');
    $('#btnR').onclick = () => judgeBy('outperform');
    document.onkeydown = e => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target.closest && e.target.closest('input[type="text"], textarea')) return;
      e.preventDefault();
      judgeBy(e.key === 'ArrowLeft' ? 'underperform' : 'outperform');
    };
    State.log('card_view', { case_id: cards[0].id, case_version: cards[0].version, panel: DEFAULT_PANEL, extra: !!extra });
  }

  const gateOpen = () => !!(draft.key_evidence && draft.confidence);
  function judgeBy(direction) { if (!locked) stack.commitByButton(direction); }   // 게이트가 닫혀 있으면 SwipeStack이 onBlocked를 부른다

  function fillGate() {
    const card = stack.current(); if (!card) return;
    const chipRow = (el, list, key) => {
      el.innerHTML = list.map(t => `<button type="button" class="ds-chip" aria-pressed="false">${t}</button>`).join('');
      el.onclick = e => {
        const b = e.target.closest('.ds-chip'); if (!b || locked) return;
        const again = b.getAttribute('aria-pressed') === 'true';
        if (again && key === 'key_evidence') return;               // 핵심 근거는 필수: 다시 눌러도 풀리지 않는다
        el.querySelectorAll('.ds-chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
        if (again) draft[key] = null;                              // 위험 요인은 선택: 다시 누르면 풀린다
        else { b.setAttribute('aria-pressed', 'true'); draft[key] = b.textContent; }
        if (key === 'key_evidence') State.log('evidence_pick', { case_id: card.id, evidence: draft.key_evidence });
        else State.log('risk_pick', { case_id: card.id, risk: draft.risk });
        updateGate();
      };
    };
    chipRow($('#ev'), card.evidence_options, 'key_evidence');
    chipRow($('#risk'), card.risk_options, 'risk');
    const conf = $('#conf');
    conf.innerHTML = [1, 2, 3, 4, 5].map(n => `<button type="button" aria-pressed="false" aria-label="확신도 ${n}">${n}</button>`).join('');
    conf.onclick = e => {
      const b = e.target.closest('button'); if (!b || locked) return;
      conf.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true'); draft.confidence = +b.textContent;
      State.log('confidence_pick', { case_id: card.id, confidence: draft.confidence });
      updateGate();
    };
    const rc = $('#recog'); rc.checked = false;
    rc.onchange = () => { draft.recognized = rc.checked; State.log('recognize_toggle', { case_id: card.id, recognized: rc.checked }); };
    updateGate();
  }
  function updateGate() {
    const open = !locked && gateOpen();
    $('#btnL').disabled = $('#btnR').disabled = !open;
    $('#hint').textContent = locked ? ''
      : open ? '카드를 좌우로 밀거나, 아래 버튼이나 키보드 ← →로 판단해요'
      : !draft.key_evidence && !draft.confidence ? '근거 하나와 확신도를 고르면 판단할 수 있어요'
      : !draft.key_evidence ? '근거를 하나 고르면 판단할 수 있어요' : '확신도를 고르면 판단할 수 있어요';
  }
  function lock(on) { locked = on; $('#gate').disabled = on; updateGate(); }
  function blocked() {
    if (locked) return;
    const el = !draft.key_evidence ? $('#ev') : $('#conf');
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    $('#hint').textContent = !draft.key_evidence && !draft.confidence ? '먼저 근거 하나와 확신도를 골라 주세요'
      : !draft.key_evidence ? '먼저 근거를 하나 골라 주세요' : '먼저 확신도를 골라 주세요';
    const card = stack.current();
    State.log('gate_blocked', { case_id: card && card.id, missing: [!draft.key_evidence && 'evidence', !draft.confidence && 'confidence'].filter(Boolean) });
  }

  function commit(direction, meta, card, extra, token) {
    const j = State.addJudgment({
      case_id: card.id, case_version: card.version, direction,
      key_evidence: draft.key_evidence, risk_factor: draft.risk, confidence: draft.confidence,
      recognized: draft.recognized, extra: !!extra, gesture: meta
    });
    State.log('judge', { judgment_id: j.id, case_id: card.id, case_version: card.version, direction, key_evidence: j.key_evidence, risk_factor: j.risk_factor, confidence: j.confidence, recognized: j.recognized, extra: !!extra, gesture: meta });
    if (token !== seq) return;   // 카드가 날아가는 사이 다른 탭으로 갔다: 오늘 탭에 돌아오면 공개된다
    $('#toast').innerHTML = `${DIR[direction]} · 근거: ${j.key_evidence} · 확신 ${j.confidence}/5${meta.via === 'swipe' ? ` · 망설임 ${meta.flips}회` : ''}
      <span class="toast-acts"><button type="button" id="undo">되돌리기</button><button type="button" id="now">바로 공개</button></span>`;
    pending = { j, card, timer: setTimeout(revealPending, UNDO_MS) };
    $('#undo').onclick = undo;
    $('#now').onclick = () => { State.log('reveal_now', { judgment_id: j.id, case_id: card.id }); revealPending(); };
    if (meta.via === 'button') $('#now').focus({ preventScroll: true });
  }
  function revealPending() { if (!pending) return; const { j, card, timer } = pending; clearTimeout(timer); pending = null; showReveal(j, card); }
  function cancelPending() { if (pending) { clearTimeout(pending.timer); pending = null; } }
  function undo() {
    if (!pending) return;
    cancelPending();
    State.undoLast(); stack.undo();
    draft = freshDraft(); lock(false); fillGate();
    const toast = $('#toast'), token = seq;
    toast.textContent = '되돌렸어요. 다시 골라 주세요.';
    setTimeout(() => { if (token === seq && toast.textContent.startsWith('되돌렸어요')) toast.textContent = ''; }, 2000);
    const first = $('#ev .ds-chip'); if (first) first.focus({ preventScroll: true });
  }

  /* ---------- 오늘: 결과 공개 (결과 데이터와 상승·하락 색, 형광펜 밑줄은 여기서만) ---------- */
  async function showReveal(j, card) {
    const o = IFSAVE.OUTCOMES[card.id];            // 판단을 남긴 뒤에만, 이 함수에서만 읽는다
    const first = !j.result;
    const r = first ? State.reveal(j.id, o) : j.result;
    if (first) State.log('reveal', { judgment_id: j.id, case_id: card.id, state: r.state, hit: r.hit, relative_pp: r.relative_pp });
    const conceptId = card.learning_points[0], concept = IFSAVE.CONCEPTS[conceptId];
    const rel = r.relative_pp;
    // ds-up / ds-down 색은 공개 화면에서만. 색만으로 읽히지 않게 부호(+/−)와 모양(▲/▼/■)을 함께 붙인다
    const tone = v => (v > 0 ? 'ds-up' : v < 0 ? 'ds-down' : '');
    const shape = v => (v > 0 ? '▲' : v < 0 ? '▼' : '■');
    const num = (label, v, unit, cls, mk) => `<div><small>${label}</small><b class="${cls}"><span class="mk" aria-hidden="true">${mk}</span>${fmt(v)}${unit}</b></div>`;
    const verdict = r.state === 'even'
      ? `<em class="ds-stamp ds-stamp--even">${RESULT.even}</em><span>거의 같았어요 — 적중·실패로 세지 않아요</span>`
      : `<em class="ds-stamp${r.hit ? ' ds-stamp--ok' : ''}">${RESULT[r.state]}</em><span>시장보다 ${Math.abs(rel).toFixed(1)}%p ${r.state === 'ahead' ? '앞섰어요' : '뒤졌어요'} · ${r.hit ? '판단한 방향과 같아요' : '판단한 방향과 달라요'}</span>`;
    const more = State.todayJudgments().length < DAILY_CARDS && unjudged().length;
    const token = screen(`
      ${todayTop('결과')}
      <div class="reveal"><p class="name ds-head">${o.company} (${o.ticker})</p><span class="period ds-muted">${o.period} · 예시 데이터</span></div>
      <div class="ds-nums">
        ${num('이 회사', o.return_pct, '%', tone(o.return_pct), shape(o.return_pct))}
        ${num(o.bench, o.bench_return_pct, '%', tone(o.bench_return_pct), shape(o.bench_return_pct))}
        ${num('시장 대비', rel, '%p', r.state === 'even' ? '' : tone(rel), SHAPE[r.state])}
      </div>
      <p class="verdict">${verdict}</p>
      <div id="path"></div>
      <div class="legend"><span><i class="ln-main"></i>이 회사</span><span><i class="ln-bench"></i>${o.bench}</span></div>
      <div class="ds-card mine"><h5>내 판단</h5>
        <div class="row"><span>방향</span><b>${DIR[j.direction]}</b></div>
        <div class="row"><span>확신도</span><b class="ds-num">${j.confidence} / 5</b></div>
        <div class="row"><span>근거</span><b>${j.key_evidence}</b></div>
        <div class="row"><span>위험 요인</span><b>${j.risk_factor || '—'}</b></div>
        ${j.recognized ? '<div class="row"><span>아는 회사</span><b>알고 판단</b></div>' : ''}
        <div class="row" id="after-row"><span>사후에 중요했던 것</span><b><span class="ds-hl">${concept.title}</span></b></div>
        ${(card.difficulty || 0) >= SELF_CHECK_FROM ? selfCheckHtml(j) : ''}
      </div>
      <div id="explain" class="explain"><span class="ds-muted">해설을 정리하는 중…</span></div>
      <div class="ds-card concept"><h5>다시 볼 개념 · <span class="ds-hl">${concept.title}</span></h5><p>${concept.body}</p>${quizHtml(concept)}</div>
      <div class="report-line"><button type="button" class="ds-btn ghost" id="flag">정보가 이상해요</button></div>
      <button type="button" class="ds-btn ds-btn--primary wide" id="next">${more ? '다음 카드 →' : '계속 →'}</button>`);
    $('#path').appendChild(spark([{ pts: o.price_path, cls: 'ln-main' }, { pts: o.bench_path, cls: 'ln-bench' }]));
    bindQuiz(view.querySelector('.concept'), conceptId, 'reveal');
    bindSelfCheck(j, card, conceptId);
    $('#flag').onclick = () => openReport(card, $('#flag'));
    $('#next').onclick = showToday;

    // 해설 세 줄 (줄마다 작은 머리글 + 문장 라벨, 추론 줄 옆에 면책). 개념 줄이 마지막이고 개념 이름에 형광펜
    const ex = await AI.explain(card, j, o, concept);
    if (token !== seq) return;                       // 해설을 기다리는 사이 다른 화면으로 갔다
    $('#explain').innerHTML = `<div class="ds-bubble ds-bubble--ai"><span class="who">${AI.persona}</span>` +
      EXPLAIN_PARTS.filter(([k]) => ex[k]).map(([k, head]) => {
        const s = ex[k], text = s.term ? s.text.replace(s.term, () => `<span class="ds-hl">${s.term}</span>`) : s.text;
        return `<section class="ex-line ex-line--${k}"><h6 class="ex-h">${head}</h6>
          <p class="ex-s"><span class="ds-label ds-label--${s.label}">${LABEL_TEXT[s.label]}</span> ${text}</p>
          ${s.label === 'inference' ? '<p class="warn">AI 해석이에요. 공식 발표된 이유는 아니에요.</p>' : ''}</section>`;
      }).join('') + `</div>`;
  }

  /* ---------- 공개: ○△✕ 자기 평가 (사후에 중요했던 것 바로 아래) ---------- */
  function selfCheckHtml(j) {
    return `<div class="selfcheck" id="selfcheck">
        <p class="selfcheck-q" id="sc-q">내 근거는 이 개념과 맞았나요?</p>
        <div class="ds-selfcheck" role="group" aria-labelledby="sc-q">${Object.entries(SELF_CHECK).map(([v, [mk, t]]) =>
          `<button type="button" data-v="${v}" aria-pressed="${j.self_check === v}"><span aria-hidden="true">${mk}</span> ${t}</button>`).join('')}</div>
        <p class="selfcheck-fb" aria-live="polite">${j.self_check ? SELF_CHECK_FB[j.self_check] : ''}</p>
      </div>`;
  }
  function bindSelfCheck(j, card, conceptId) {
    const group = view.querySelector('.ds-selfcheck'); if (!group) return;
    group.onclick = e => {
      const b = e.target.closest('button'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
      group.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      State.selfCheck(j.id, b.dataset.v);
      State.log('self_check', { judgment_id: j.id, case_id: card.id, concept: conceptId, value: b.dataset.v });
      view.querySelector('.selfcheck-fb').textContent = SELF_CHECK_FB[b.dataset.v];
    };
  }

  /* ---------- 확인 문제 (공개·복습·개념 화면 공용) ---------- */
  function quizHtml(c) {
    return `<div class="quiz"><p class="quiz-q">확인 문제 · ${c.quiz.q}</p>${c.quiz.options.map((t, i) => `<button type="button" class="opt" data-i="${i}">${t}</button>`).join('')}<p class="quiz-fb" aria-live="polite"></p></div>`;
  }
  function bindQuiz(root, conceptId, via, after) {
    const c = IFSAVE.CONCEPTS[conceptId], opts = [...root.querySelectorAll('.quiz .opt')];
    opts.forEach(b => {
      b.onclick = () => {
        const ok = +b.dataset.i === c.quiz.answer;
        const rv = State.quiz(conceptId, ok, via);         // 숙련도 + 다음 복습일
        State.log('quiz', { concept: conceptId, correct: ok, via, review_level: rv.level, due_at: rv.due_at });
        opts.forEach(x => { x.disabled = true; });
        b.classList.add(ok ? 'ok' : 'no');
        if (!ok) opts[c.quiz.answer].classList.add('ok');
        root.querySelector('.quiz-fb').textContent = `${ok ? '맞아요.' : `아니에요. 정답: ‘${c.quiz.options[c.quiz.answer]}’.`} 다음 복습: ${dueLabel(rv.due_at)}`;
        if (after) after(ok);
      };
    });
  }

  /* ---------- 정보 신고 시트 ---------- */
  function openReport(card, trigger) {
    const back = h('div', 'sheet-back');
    back.innerHTML = `<form class="sheet" role="dialog" aria-modal="true" aria-labelledby="rp-title" novalidate>
        <h2 class="ds-head" id="rp-title">정보가 이상해요</h2>
        <p class="ds-muted small">어떤 점이 이상했나요? 카드 버전과 함께 기록돼요.</p>
        <fieldset><legend class="sr-only">신고 유형</legend>
          ${REPORT_CATS.map(t => `<label class="radio"><input type="radio" name="cat" value="${t}"> ${t}</label>`).join('')}
        </fieldset>
        <label class="note-label" for="rp-note">더 적을 내용 (선택)</label>
        <textarea id="rp-note" maxlength="500" placeholder="예: 숫자 판의 PER이 공시와 달라요"></textarea>
        <div class="row2"><button type="button" class="ds-btn" id="rp-cancel">닫기</button><button type="submit" class="ds-btn ds-btn--primary" id="rp-send" disabled>보내기</button></div>
      </form>`;
    document.body.appendChild(back);
    const form = back.querySelector('form'), send = back.querySelector('#rp-send');
    const chosen = () => { const c = form.querySelector('input[name="cat"]:checked'); return c ? c.value : ''; };
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (trigger.isConnected) trigger.focus(); };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;                       // 시트 안에서만 초점이 돈다
      const f = [...back.querySelectorAll('input, textarea, button:not([disabled])')], a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    form.addEventListener('change', () => { send.disabled = !chosen(); });
    form.onsubmit = e => {
      e.preventDefault(); if (!chosen()) return;
      State.report({ case_id: card.id, case_version: card.version, category: chosen(), note: back.querySelector('#rp-note').value.trim() });
      close();
      const line = trigger.parentElement;
      line.innerHTML = '<p class="ds-muted small" role="status" tabindex="-1">신고를 남겼어요. 고마워요 — 카드를 고칠 때 확인할게요.</p>';
      line.firstChild.focus();
    };
    back.querySelector('#rp-cancel').onclick = close;
    back.addEventListener('click', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey, true);
    back.querySelector('input[name="cat"]').focus();
    State.log('report_open', { case_id: card.id });
  }

  /* ---------- 오늘: 복습 문제 ---------- */
  function showReview(id) {
    const c = IFSAVE.CONCEPTS[id];
    const done = State.reviewsDoneToday().length, total = Math.min(DAILY_REVIEWS, done + dueToday().length);
    screen(`${todayTop(`복습 ${done + 1}/${total}`)}
      ${entryStrip(false)}
      <p class="q ds-head">복습 · ${c.title}</p>
      <div class="ds-card concept">${quizHtml(c)}
        <details class="peek"><summary>개념 다시 보기</summary><p>${c.body}</p></details>
      </div>
      <button type="button" class="ds-btn ds-btn--primary wide" id="next" disabled>계속 →</button>
      <p class="hint">복습은 하루 ${DAILY_REVIEWS}개까지예요. 맞히면 다음 간격(1·3·7·21일)으로, 틀리면 내일 다시 나와요.</p>`);
    bindQuiz(view.querySelector('.concept'), id, 'review', () => { const nx = $('#next'); nx.disabled = false; nx.focus({ preventScroll: true }); });
    $('#next').onclick = showToday;
    State.log('review_view', { concept: id });
  }

  /* ---------- 오늘: 마침 ---------- */
  function conceptsToday() {
    const t = State.dayKey(), ids = [];
    State.todayJudgments().forEach(j => { const c = caseById(j.case_id); if (c && j.result) ids.push(c.learning_points[0]); });
    State.get().quiz_log.forEach(q => { if (State.dayKey(q.at) === t) ids.push(q.concept); });
    return [...new Set(ids)].filter(id => IFSAVE.CONCEPTS[id]);
  }
  function showDone(left) {
    const S = State.get(), n = State.todayJudgments().length;
    const items = conceptsToday().map(id => {
      const c = IFSAVE.CONCEPTS[id], p = S.concept_progress[id], rv = S.review[id];
      return `<li><b>${c.title}</b><span class="cstate">${CONCEPT_STATE[p ? p.state : 'new']}</span>${rv ? `<small>다음 복습: ${dueLabel(rv.due_at)}</small>` : ''}</li>`;
    }).join('');
    screen(`${todayTop('마침')}
      ${entryStrip(false)}
      <section class="done">
        <h1 class="done-title ds-head">${n >= DAILY_CARDS ? '오늘은 여기까지' : '준비된 카드를 모두 봤어요'}</h1>
        <p class="ds-muted">${n ? `오늘 카드 ${n}장을 판단하고 결과를 되짚었어요.` : '오늘은 판단한 카드가 아직 없어요.'}</p>
        ${items ? `<div class="ds-card"><h5>오늘 되짚은 개념</h5><ul class="csum">${items}</ul></div>` : ''}
        ${left.length
          ? `<button type="button" class="ds-btn wide" id="more">한 장 더</button><p class="hint">한 장 더 본 것도 기록돼요. 내일 다시 3장이 준비돼요.</p>`
          : `<p class="exhausted">${n >= DAILY_CARDS ? '준비된 카드를 모두 봤어요. ' : ''}새 카드가 들어오면 여기서 이어져요.</p>`}
      </section>`);
    if (left.length) $('#more').onclick = () => { State.log('extra_card', { case_id: left[0].id, today: n }); showCard([left[0]], true); };
  }

  /* ---------- 일지: 연습 달력 ----------
     판단한 날 = 잉크 점, 복습 예정일 = 테두리 원(기한이 지난 복습은 오늘로 당겨 센다), 오늘 = 빨간 펜 링.
     결과 상태(앞섬·뒤짐·비슷)로 칠하지 않는다 — 달력은 연습 기록이지 적중 지도가 아니다 */
  let calShift = 0;   // 보고 있는 달: 이번 달에서 몇 달 앞(+)·뒤(−)
  function calendarHtml() {
    const S = State.get(), today = State.dayKey(), now = new Date();
    const practiced = new Set(S.judgments.map(j => State.dayKey(j.created_at)));
    const due = {};
    Object.entries(S.review).forEach(([id, r]) => {
      if (!IFSAVE.CONCEPTS[id]) return;
      const k = State.dayKey(r.due_at) < today ? today : State.dayKey(r.due_at);
      due[k] = (due[k] || 0) + 1;
    });
    // 넘길 수 있는 범위: 첫 판단이 있는 달 ~ 마지막 복습 예정일이 있는 달 (이번 달은 늘 포함)
    const mIdx = k => +k.slice(0, 4) * 12 + (+k.slice(5, 7) - 1), cur = now.getFullYear() * 12 + now.getMonth();
    const marked = [...practiced, ...Object.keys(due)].filter(k => /^\d{4}-\d\d-\d\d$/.test(k)).map(mIdx), min = Math.min(cur, ...marked), max = Math.max(cur, ...marked);
    calShift = Math.max(min - cur, Math.min(max - cur, calShift));
    const first = new Date(now.getFullYear(), now.getMonth() + calShift, 1), y = first.getFullYear(), m = first.getMonth();
    const days = new Date(y, m + 1, 0).getDate(), cells = [];
    let practicedDays = 0, dueCount = 0;
    for (let i = (first.getDay() + 6) % 7; i > 0; i--) cells.push('<td></td>');   // 월요일 시작
    for (let d = 1; d <= days; d++) {
      const k = State.dayKey(new Date(y, m, d)), done = practiced.has(k), dueN = due[k] || 0, isToday = k === today;
      if (done) practicedDays++;
      dueCount += dueN;
      const cls = ['cal-day', done && 'cal-day--done', dueN && 'cal-day--due', isToday && 'cal-day--today', k > today && 'cal-day--future'].filter(Boolean).join(' ');
      const sr = [isToday && '오늘', done && '연습한 날', dueN && `복습 예정 ${dueN}개`].filter(Boolean).join(', ');
      cells.push(`<td class="${cls}"><span class="cal-n">${d}</span><i class="cal-mk" aria-hidden="true"></i>${sr ? `<span class="sr-only">${sr}</span>` : ''}</td>`);
    }
    while (cells.length % 7) cells.push('<td></td>');
    const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
    return `<div class="cal-head">
        <button type="button" class="cal-nav" id="cal-prev" aria-label="이전 달"${cur + calShift <= min ? ' disabled' : ''}>‹</button>
        <h2 class="cal-title ds-head" id="cal-title" tabindex="-1">${y}년 ${m + 1}월</h2>
        <button type="button" class="cal-nav" id="cal-next" aria-label="다음 달"${cur + calShift >= max ? ' disabled' : ''}>›</button>
      </div>
      <table class="cal-grid" aria-labelledby="cal-title">
        <thead><tr>${WEEKDAYS.map(w => `<th scope="col">${w}</th>`).join('')}</tr></thead>
        <tbody>${weeks.join('')}</tbody>
      </table>
      <div class="cal-foot">
        <p class="cal-cap">${calShift ? `${m + 1}월` : '이달'} 연습 <b>${practicedDays}일</b> · 복습 <b>${dueCount}개</b></p>
        <p class="cal-key" aria-hidden="true"><span><i class="cal-mk cal-mk--done"></i>연습</span><span><i class="cal-mk cal-mk--due"></i>복습 예정</span><span><i class="cal-ring"></i>오늘</span></p>
      </div>`;
  }
  function renderCalendar(focusId) {
    const box = $('#cal'); if (!box) return;
    box.innerHTML = calendarHtml();
    [['#cal-prev', -1], ['#cal-next', 1]].forEach(([sel, step]) => {
      $(sel).onclick = () => {
        calShift += step;
        renderCalendar(sel.slice(1));
        const now = new Date();
        State.log('calendar_month', { month: State.dayKey(new Date(now.getFullYear(), now.getMonth() + calShift, 1)).slice(0, 7), shift: calShift });
      };
    });
    if (focusId) { const b = $('#' + focusId); (b && !b.disabled ? b : $('#cal-title')).focus({ preventScroll: true }); }
  }

  /* ---------- 일지 ---------- */
  function journalRow(j) {
    const c = caseById(j.case_id), r = j.result, d = new Date(j.created_at);
    const title = r && r.company ? `${r.company} (${r.ticker})` : c ? `${c.sector_public} · ${c.size_bucket}` : j.case_id;
    const state = r ? `<span class="jstate">${SHAPE[r.state]} ${RESULT[r.state]}</span>` : '<span class="jstate jstate--wait">결과 대기</span>';
    const self = SELF_CHECK[j.self_check];   // ○△✕ 개념 확인: 기록만 보인다(합산하지 않는다)
    return `<li class="jrow">
        <div class="jrow-head"><span class="jrow-date ds-num">${md(d)}</span><b class="jrow-title">${title}</b>${j.recognized ? '<span class="tag">알고 판단</span>' : ''}${self ? `<span class="jmark" role="img" aria-label="개념 확인: ${self[1]}" title="개념 확인: ${self[1]}">${self[0]}</span>` : ''}${state}</div>
        <div class="jrow-body">${DIR[j.direction]} · 근거 <b>${j.key_evidence}</b> · 확신 <b class="ds-num">${j.confidence}/5</b></div>
      </li>`;
  }
  /* 인사이트 카드: 재료는 State.stats().insights(횟수만). 한 카드 = 한 문장, 퍼센트·적중률 머리 숫자 없음 */
  function insightText(it) {
    const J = State.josa;
    if (it.kind === 'confidence') return `확신도 ${it.level}${J(String(it.level), '을', '를')} 준 판단 ${it.n}번 중 시장보다 앞선 것은 ${it.k}번이었어요.`;
    if (it.kind === 'evidence') return `'${it.label}'${J(it.label, '을', '를')} 근거로 한 판단 ${it.n}번 중 ${it.k}번이 시장보다 뒤졌어요.`;
    return `아는 회사 판단 ${it.n}번과 모르는 회사 판단 ${it.m}번의 앞섬 횟수는 ${it.k}번·${it.j}번이었어요.`;
  }
  function statsHtml(st) {
    const cards = st.insights.map(it => `<div class="ds-insight"><span class="ds-insight-kind">${INSIGHT_KIND[it.kind]}</span><p>${insightText(it)}</p></div>`).join('');
    return `${cards ? `<div class="ins-list">${cards}</div>` : `<p>같은 조건의 판단이 ${State.MIN_INSIGHT}번 이상 모이면 한 줄씩 묶어 보여 드려요.</p>`}
      <h5>확신도 보정</h5><p class="calib">${CALIBRATION[st.calibration]}</p>
      <p class="ds-muted small">몇십 장으로는 운과 실력을 가르기 어려워요. 횟수는 내 근거를 되돌아보는 실마리로만 보세요.</p>`;
  }
  function showJournal() {
    const S = State.get(), st = State.stats(STATS_LOCK);
    const rows = S.judgments.slice().reverse().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(journalRow).join('');   // 최신순
    calShift = 0;
    screen(`<div class="top"><span>일지</span><span class="ds-num">판단 ${S.judgments.length}장</span></div>
      <section class="ds-card cal" id="cal" aria-label="연습 달력"></section>
      ${rows ? `<ul class="jlist">${rows}</ul>` : '<p class="empty">아직 남긴 판단이 없어요. 오늘 탭에서 첫 카드를 판단해 보세요.</p>'}
      <details class="stats"><summary>${st.locked ? `통계 (${st.lock}장 뒤에 열려요 · 지금 ${st.total}장)` : `통계 (지금 ${st.total}장)`}</summary>
        <div class="stats-body">${st.locked
          ? `<p>판단이 ${st.lock}장 쌓이면 근거별 횟수와 확신도 보정을 글로 보여 드려요. 몇 장만으로는 운과 실력을 가를 수 없어서예요.</p>`
          : statsHtml(st)}</div>
      </details>
      <div class="row2"><button type="button" class="ds-btn" id="export">연구 로그 내보내기</button><button type="button" class="ds-btn" id="reset">세션 초기화</button></div>
      <p class="hint">적중률은 점수가 아니에요. 근거·확신도·개념이 먼저예요.</p>`);
    renderCalendar();
    view.querySelector('details.stats').addEventListener('toggle', e => State.log('stats_toggle', { open: e.target.open, unlocked: !st.locked, n: st.total }));
    $('#export').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([State.exportJSON()], { type: 'application/json' }));
      a.download = 'bokgi-proto-log.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#reset').onclick = () => {
      if (!window.confirm('판단·로그·복습 기록을 모두 지우고 첫 실행 상태로 돌릴까요?')) return;
      State.reset(); State.startSession(); go('today');
    };
  }

  /* ---------- 개념 ---------- */
  function showConcepts() {
    const S = State.get(), list = Object.entries(IFSAVE.CONCEPTS);
    screen(`<div class="top"><span>개념</span><span class="ds-num">${list.length}개</span></div>
      <ul class="clist">${list.map(([id, c]) => {
        const p = S.concept_progress[id], rv = S.review[id];
        return `<li><button type="button" class="crow" data-c="${id}"><b>${c.title}</b><span class="cstate">${CONCEPT_STATE[p ? p.state : 'new']}</span><small>${rv ? `복습 예정: ${dueLabel(rv.due_at)}` : '복습 예정 없음'}</small></button></li>`;
      }).join('')}</ul>
      <p class="hint">확인 문제를 풀면 복습 날짜가 정해져요 (1·3·7·21일).</p>`);
    view.querySelectorAll('.crow').forEach(b => { b.onclick = () => showConcept(b.dataset.c); });
  }
  function showConcept(id) {
    const c = IFSAVE.CONCEPTS[id], p = State.get().concept_progress[id];
    screen(`<div class="top"><button type="button" class="back" id="back">← 개념 목록</button><span>${CONCEPT_STATE[p ? p.state : 'new']}</span></div>
      <div class="ds-card concept"><h5>${c.title}</h5><p>${c.body}</p>${quizHtml(c)}</div>`);
    bindQuiz(view.querySelector('.concept'), id, 'concepts');
    $('#back').onclick = showConcepts;
    State.log('concept_view', { concept: id });
  }

  /* ---------- 내비 ---------- */
  function go(v) {
    cancelPending();
    nav.querySelectorAll('button').forEach(x => x.setAttribute('aria-current', String(x.dataset.v === v)));
    ({ today: showToday, journal: showJournal, concepts: showConcepts })[v]();
  }
  nav.querySelectorAll('button').forEach(b => { b.onclick = () => go(b.dataset.v); });

  if (!State.get().session) State.startSession();
  go('today');
})();

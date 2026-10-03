/* 상태와 로그. 프로토타입은 localStorage에 저장한다. 실제 구현에서는 /judgments, /research/events API로 보낸다.
   날짜(오늘·스트릭·복습일)는 모두 기기의 현지 날짜로 계산한다. */
(function () {
  const KEY = 'bokgi.proto.v1';
  const ONBOARD_KEY = 'bokgi.onboarded';
  const EVEN_PP = 1.0;               // 시장 대비 ±1%p 이내 = 비슷함. 적중·실패로 세지 않는다
  const INTERVALS = [1, 3, 7, 21];   // 복습 간격(일). level이 곧 이 배열의 위치

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const fresh = () => ({ judgments: [], events: [], concept_progress: {}, review: {}, quiz_log: [], reports: [], session: null });

  const S = Object.assign(fresh(), load());

  const uid = p => p + Date.now() + Math.random().toString(16).slice(2, 6);
  const pad = n => String(n).padStart(2, '0');
  /* 현지 날짜 키 'YYYY-MM-DD' */
  const dayKey = (d = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  /* d가 속한 날의 현지 자정 + plus일 (서머타임에도 날짜 단위로 움직인다) */
  const startOfDay = (d = new Date(), plus = 0) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate() + plus); };

  let onboardedMem = false;          // localStorage를 못 쓰는 환경에서도 한 번 본 안내는 다시 띄우지 않는다

  /* 조사: 앞말의 받침에 따라 고른다. josa('매출', '을', '를') → '을'.
     숫자·영문·기호는 읽는 소리로 본다: 27 → 칠(받침), 5 → 오, R → 알(받침), F → 에프, % → 퍼센트 */
  function josa(word, withFinal, withoutFinal) {
    const s = String(word).replace(/[\s'"‘’“”)\]]+$/, ''), ch = s.charAt(s.length - 1), code = ch.charCodeAt(0);
    let fin = false;
    if (code >= 0xAC00 && code <= 0xD7A3) fin = (code - 0xAC00) % 28 !== 0;
    else if (/[0-9]/.test(ch)) fin = '013678'.includes(ch);       // 영 일 삼 육 칠 팔
    else if (/[a-z]/i.test(ch)) fin = 'lmnr'.includes(ch.toLowerCase());   // 엘 엠 엔 알
    return fin ? withFinal : withoutFinal;
  }

  /* 근거 칩 → 근거 종류: 숫자가 든 낱말과 'vs'를 뺀다. 'PER 38 vs 27' → 'PER', '매출 +23%' → '매출', '가이던스 하향' → 그대로.
     칩 글자는 카드마다 다르고 사례는 한 번만 판단하므로, 같은 종류끼리 묶어야 횟수가 쌓인다 */
  const evidenceKind = e => {
    const full = String(e == null ? '' : e).trim();
    return full.split(/\s+/).filter(t => /[가-힣a-z]/i.test(t) && !/\d/.test(t) && t.toLowerCase() !== 'vs').join(' ') || full;
  };

  /* 통계 인사이트 (한 문장 카드의 재료). 횟수만 돌려준다 — 퍼센트·적중률은 만들지 않는다.
     같은 조건의 판단이 MIN_INSIGHT번 미만이면 그 카드는 뺀다. 문장은 화면 코드(app.js)가 만든다.
     confidence: 가장 자주 고른 확신도(같으면 높은 쪽)에서 시장보다 앞선 횟수
     evidence:   뒤짐이 가장 많은 근거 종류(같으면 판단 수가 적은 쪽)의 뒤짐 횟수. 뒤짐이 없으면 뺀다
     recognized: 아는 회사 / 모르는 회사 판단의 앞섬 횟수(두 쪽 모두 MIN_INSIGHT번 이상일 때만) */
  const MIN_INSIGHT = 3;
  function insights(done) {
    const out = [], count = (js, state) => js.filter(j => j.result.state === state).length;
    const byConf = {};
    done.filter(j => j.confidence).forEach(j => { (byConf[j.confidence] = byConf[j.confidence] || []).push(j); });
    const conf = Object.entries(byConf).sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0];
    if (conf && conf[1].length >= MIN_INSIGHT) out.push({ kind: 'confidence', level: +conf[0], n: conf[1].length, k: count(conf[1], 'ahead') });
    const byKind = {};
    done.forEach(j => { const k = evidenceKind(j.key_evidence); (byKind[k] = byKind[k] || []).push(j); });
    const ev = Object.entries(byKind).map(([label, js]) => ({ label, n: js.length, k: count(js, 'behind') }))
      .filter(e => e.n >= MIN_INSIGHT && e.k > 0)
      .sort((a, b) => b.k - a.k || a.n - b.n || a.label.localeCompare(b.label))[0];
    if (ev) out.push(Object.assign({ kind: 'evidence' }, ev));
    const known = done.filter(j => j.recognized), unknown = done.filter(j => !j.recognized);
    if (known.length >= MIN_INSIGHT && unknown.length >= MIN_INSIGHT)
      out.push({ kind: 'recognized', n: known.length, k: count(known, 'ahead'), m: unknown.length, j: count(unknown, 'ahead') });
    return out;
  }

  /* 간격 복습: 맞히면 level +1(새 개념은 0부터), 틀리면 0. 다음 복습일 = 오늘 + INTERVALS[level]일(그날 0시부터).
     아직 복습일이 안 된 개념을 다시 맞힌 경우에는 간격을 늘리지 않는다(같은 날 반복으로 간격이 부풀지 않게). */
  function schedule(conceptId, correct) {
    const prev = S.review[conceptId], now = new Date();
    if (correct && prev && Date.parse(prev.due_at) > now.getTime()) return prev;
    const level = correct ? Math.min((prev ? prev.level : -1) + 1, INTERVALS.length - 1) : 0;
    const r = { level, due_at: startOfDay(now, INTERVALS[level]).toISOString(), last_at: now.toISOString(), last_correct: correct };
    S.review[conceptId] = r;
    return r;
  }

  const State = {
    get: () => S,
    EVEN_PP, INTERVALS, MIN_INSIGHT, dayKey, josa, evidenceKind,

    reset() {
      Object.assign(S, fresh()); save(S);
      onboardedMem = false; try { localStorage.removeItem(ONBOARD_KEY); } catch (e) {}
    },
    onboarded() { if (onboardedMem) return true; try { return localStorage.getItem(ONBOARD_KEY) === '1'; } catch (e) { return false; } },
    setOnboarded() { onboardedMem = true; try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) {} },

    startSession() { S.session = { id: uid('s'), started_at: new Date().toISOString() }; save(S); },
    log(event, payload) {
      S.events.push({ id: uid('e'), session_id: S.session && S.session.id, event, payload, ts: new Date().toISOString() });
      save(S);
    },

    addJudgment(j) { j.id = uid('j'); j.created_at = new Date().toISOString(); S.judgments.push(j); save(S); return j; },
    undoLast() { const j = S.judgments.pop(); save(S); this.log('undo', { judgment_id: j && j.id, case_id: j && j.case_id }); return j; },
    todayJudgments() { const t = dayKey(); return S.judgments.filter(j => dayKey(j.created_at) === t); },
    /* 스트릭: 판단을 1장 이상 남긴 날이 연속된 수. 오늘 아직 안 했으면 어제까지로 센다. 정답 여부와 무관 */
    streak() {
      const days = new Set(S.judgments.map(j => dayKey(j.created_at)));
      let d = startOfDay(); if (!days.has(dayKey(d))) d = startOfDay(d, -1);
      let k = 0; while (days.has(dayKey(d))) { k++; d = startOfDay(d, -1); }
      return k;
    },

    /* 공개: 결과는 이 순간에만 받아서 판단 기록에 붙인다. 이후 화면(일지 등)은 기록에 붙은 값만 읽는다.
       state: ahead(앞섬) | behind(뒤짐) | even(비슷함, |시장 대비| ≤ 1%p). hit: even이면 null */
    reveal(judgmentId, outcome) {
      const j = S.judgments.find(x => x.id === judgmentId); if (!j) return null;
      const rel = +(outcome.return_pct - outcome.bench_return_pct).toFixed(1);
      const state = Math.abs(rel) <= EVEN_PP ? 'even' : rel > 0 ? 'ahead' : 'behind';
      j.revealed_at = new Date().toISOString();
      j.result = {
        relative_pp: rel, state,
        hit: state === 'even' ? null : (state === 'ahead') === (j.direction === 'outperform'),
        return_pct: outcome.return_pct, bench_return_pct: outcome.bench_return_pct, bench: outcome.bench,
        company: outcome.company, ticker: outcome.ticker, period: outcome.period
      };
      save(S); return j.result;
    },

    /* ○△✕ 자기 평가: 내 근거가 이 개념과 맞았나. o 맞았다 · tri 일부 · x 달랐다.
       판단 기록에 남기기만 하고 점수·비율로 합산하지 않는다 */
    selfCheck(judgmentId, value) {
      const j = S.judgments.find(x => x.id === judgmentId);
      if (!j || !['o', 'tri', 'x'].includes(value)) return null;
      j.self_check = value; j.self_check_at = new Date().toISOString();
      save(S); return j;
    },

    /* 확인 문제: 숙련도(신규 → 학습 중 → 이해, 틀리면 복습 필요) + 간격 복습 일정. via: reveal | review | concepts */
    quiz(conceptId, correct, via) {
      const c = S.concept_progress[conceptId] || { state: 'new', correct: 0, total: 0 };
      c.total++; if (correct) c.correct++;
      c.state = c.total >= 2 && c.correct / c.total >= 0.75 ? 'known' : (correct ? 'learning' : 'review');
      S.concept_progress[conceptId] = c;
      const r = schedule(conceptId, correct);
      S.quiz_log.push({ concept: conceptId, correct, via, at: new Date().toISOString() });
      save(S); return r;
    },
    /* 복습일이 된 개념 id (복습일이 이른 순) */
    dueReviews() {
      const now = Date.now();
      return Object.entries(S.review).filter(([, r]) => Date.parse(r.due_at) <= now)
        .sort((a, b) => Date.parse(a[1].due_at) - Date.parse(b[1].due_at)).map(([id]) => id);
    },
    reviewsDoneToday() { const t = dayKey(); return S.quiz_log.filter(q => q.via === 'review' && dayKey(q.at) === t); },

    /* 정보 신고 */
    report(r) {
      const rec = Object.assign({ id: uid('rp'), created_at: new Date().toISOString() }, r);
      S.reports.push(rec); save(S);
      this.log('report', { report_id: rec.id, case_id: rec.case_id, case_version: rec.case_version, category: rec.category, note: rec.note });
      return rec;
    },

    /* 통계: LOCK장 미만이면 잠금. 인사이트 재료(insights, 횟수만), 근거별 횟수, 확신도 보정(글로만 쓴다, 퍼센트를 돌려주지 않는다).
       보정: 비슷함을 뺀 판단에서 확신도(1→50% … 5→90%)의 평균과, 결과가 판단과 같은 방향이었던 비율의 차이 */
    stats(LOCK = 20) {
      const done = S.judgments.filter(j => j.result);
      const evidence = {};
      done.forEach(j => { evidence[j.key_evidence] = (evidence[j.key_evidence] || 0) + 1; });
      const decided = done.filter(j => typeof j.result.hit === 'boolean');
      let calibration = 'few';
      if (decided.length >= 10) {
        const expected = decided.reduce((s, j) => s + 0.5 + (j.confidence - 1) * 0.1, 0) / decided.length;
        const actual = decided.filter(j => j.result.hit).length / decided.length;
        calibration = expected - actual > 0.1 ? 'over' : expected - actual < -0.1 ? 'under' : 'fit';
      }
      return { total: done.length, locked: done.length < LOCK, lock: LOCK, evidence, calibration, decided: decided.length, insights: insights(done) };
    },
    exportJSON() { return JSON.stringify(S, null, 2); }
  };
  window.State = State;
})();

/* AI 스텁. 실제 구현에서는 서버 /ai/question, /ai/explain 을 호출하고
   서버가 NumberGuard → QuoteGuard → LeakFilter 를 거친 응답만 돌려준다 (docs/02 §4).
   클라이언트에 결과(outcome)를 넘기지 않는 구조를 프로토타입에서도 지킨다. */
window.AI = {
  persona: '펀드매니저',
  /* 공개 전: 반문만. 판단 전 블록과 사용자 근거만 받는다. (MVP 화면에서는 아직 호출하지 않음) */
  async question(card, judgmentDraft) {
    const ev = judgmentDraft.key_evidence || '그 근거';
    const conf = judgmentDraft.confidence || 0;
    const bank = [
      `${ev}을(를) 가장 중요하게 보셨군요. 같은 업종의 다른 회사도 비슷한 숫자라면, 이 회사만의 이유는 뭘까요?`,
      `${ev}이(가) 이미 가격에 반영돼 있다면 어떻게 알 수 있을까요? 카드에서 그 단서를 하나 찾아보세요.`,
      `확신도 ${conf || '?'}/5로 두셨는데, 어떤 정보가 나오면 반대로 판단하시겠어요?`
    ];
    await new Promise(r => setTimeout(r, 350));
    return { text: bank[(card.id.charCodeAt(3) + conf) % bank.length], labels: ['inference'] };
  },
  /* 공개 후: 근거 문서와 결과만으로 비교. 결과를 하나의 원인으로 단정하지 않는다.
     세 줄 틀(각 한 문장, 화면은 이 순서로 그린다 — 개념 줄이 늘 마지막):
       read    이번에 잘 읽은 것 — 📄 출처. 사용자가 고른 근거와 공개된 숫자만 되풀이한다
       change  다음에 바꿀 것   — 🔍 추론. 화면이 면책 한 줄을 바로 옆에 붙인다
       concept 개념 연결       — 📄 출처. 카드의 학습 포인트(learning_points[0]) 이름. term = 형광펜 칠할 개념 이름
     숫자 가드(서버 NumberGuard의 축소판): 문장 속 숫자는 공개 화면에 나온 숫자(기업·시장 수익률, 시장 대비, 시장 이름)와
     사용자가 고른 근거 칩의 숫자만 허용. 어기는 문장은 숫자 없는 문장으로 바꾼다. */
  async explain(card, judgment, outcome, concept) {
    await new Promise(r => setTimeout(r, 350));
    const sg = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1);   // 공개 화면 숫자와 같은 부호(−)
    const J = State.josa, r = judgment.result || {}, ev = judgment.key_evidence, q = `'${ev}'`;
    const rel = +(outcome.return_pct - outcome.bench_return_pct).toFixed(1);
    const dir = judgment.direction === 'outperform' ? '시장보다 앞섰다' : '시장보다 뒤졌다';
    const picked = `${q}${J(ev, '을', '를')} 핵심 근거로 짚어`;
    const read = r.state === 'even' ? `${picked} 두었고, 결과는 시장 대비 ${sg(rel)}%p로 시장과 거의 같았어요.`
      : r.hit ? `${picked} '${dir}'를 골랐고, 결과도 시장 대비 ${sg(rel)}%p로 고른 방향과 같았어요.`
      : `${picked} 두었기에, 시장 대비 ${sg(rel)}%p라는 결과와 나란히 되짚어 볼 수 있어요.`;
    const change = !judgment.risk_factor ? `다음에는 ${q}${J(ev, '과', '와')} 함께 가장 큰 위험 요인도 하나 골라, 반대로 움직일 가능성을 같이 적어 보세요.`
      : r.state === 'even' ? '시장과 거의 같게 움직인 사례라 근거의 힘을 가리기 어려우니, 다음에는 같은 근거가 시장 대비로 어떻게 이어지는지 여러 장에 걸쳐 살펴보세요.'
      : r.hit ? `방향이 같았던 한 번만으로 근거가 옳았다고 보기는 어려우니, 다음에도 ${q}${J(ev, '이', '가')} 이미 가격에 반영돼 있었는지부터 확인해 보세요.`
      : `왜 이렇게 움직였는지는 한 가지 이유로 말할 수 없지만, 다음에 ${q} 같은 근거를 쓸 때는 그 정보가 이미 가격에 반영돼 있었는지부터 확인해 보세요.`;
    const link = `이번 결과를 읽는 데 필요한 개념은 ${concept.title}${J(concept.title, '이에요', '예요')}.`;
    const nums = s => String(s).match(/\d+(?:\.\d+)?/g) || [];
    const allowed = new Set(nums([sg(outcome.return_pct), sg(outcome.bench_return_pct), sg(rel), outcome.bench, ev].join(' ')));
    const guard = (text, safe) => (nums(text).every(n => allowed.has(n)) ? text : safe);
    return {
      read: { label: 'source', text: guard(read, '이번에 고른 근거와 결과는 위 내 판단 표에서 나란히 볼 수 있어요.') },
      change: { label: 'inference', text: guard(change, '왜 이렇게 움직였는지는 한 가지 이유로 말할 수 없으니, 다음에는 근거가 이미 가격에 반영돼 있었는지부터 확인해 보세요.') },
      concept: { label: 'source', text: guard(link, '이번 결과를 읽는 데 필요한 개념은 아래 개념 카드에 있어요.'), term: concept.title }
    };
  }
};

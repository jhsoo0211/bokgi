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
    EVEN_PP, INTERVALS, dayKey,

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

    /* 통계: LOCK장 미만이면 잠금. 근거별 횟수와 확신도 보정(글로만 쓴다, 퍼센트를 돌려주지 않는다).
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
      return { total: done.length, locked: done.length < LOCK, lock: LOCK, evidence, calibration, decided: decided.length };
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
  /* 공개 후: 근거 문서와 결과만으로 비교. 결과를 하나의 원인으로 단정하지 않는다. */
  async explain(card, judgment, outcome, concept) {
    await new Promise(r => setTimeout(r, 350));
    const sg = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1);   // 공개 화면 숫자와 같은 부호(−)
    const dir = judgment.direction === 'outperform' ? '시장보다 앞섰다' : '시장보다 뒤졌다';
    return {
      sentences: [
        { text: `기업 ${sg(outcome.return_pct)}%, ${outcome.bench} ${sg(outcome.bench_return_pct)}%, 시장 대비 ${sg(outcome.return_pct - outcome.bench_return_pct)}%p입니다.`, label: 'source' },
        { text: `'${judgment.key_evidence}'를 근거로 '${dir}'를 고르셨습니다. 이번 사례에서 다시 볼 개념은 '${concept.title}'입니다.`, label: 'source' },
        { text: `왜 이렇게 움직였는지는 한 가지 이유로 말할 수 없습니다. 다음 카드에서 같은 근거를 쓸 때 시장 대비를 먼저 확인해 보세요.`, label: 'inference' }
      ]
    };
  }
};

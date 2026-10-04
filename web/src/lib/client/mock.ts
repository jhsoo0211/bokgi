/**
 * 목 API — 계약의 모든 엔드포인트를 브라우저 안에서 흉내 낸다(개발 서버 + NEXT_PUBLIC_USE_MOCK=1 전용).
 * 규칙은 prototype/app/js/state.js, 05 §4·§7, 그리고 패키지 A 서버의 계약 보충(src/server/README.md)을 따른다:
 * 세트 고정(하루 카드 3장), 같은 카드 재판단은 기존 판단, 공개는 반복해도 같은 응답(공개 때 채점해 붙임),
 * 세 상태(roundPp 뒤 ±1.0%p), 간격 복습(1·3·7·21일, 기한 전 정답은 그대로), 하루 복습 2개, 스트릭,
 * 한 장 더(today?extra=1), 온보딩 완료(onboarding_done 이벤트), 일지(결과 대기 행은 판단 전 값만, ?month=),
 * 통계 20장 잠금·인사이트(횟수만), 퀴즈 해설 문구('맞아요.' / '아니에요. 정답: ‘…’.') + answerIndex, 템플릿 해설·질문자.
 * 2차(2026-10-04, A2 서버와 같게): 정보 수준(PUT /api/me/prefs — 프리셋이면 묶음은 프리셋으로, custom인데 프리셋과 같으면 그 수준으로,
 * custom에 묶음이 없으면 422, undoSeconds를 빼면 그대로), 판단의 infoLevel·hiddenGroups, 오늘의 extraJudged(오늘 한 장 더 판단 수)·
 * conceptsToday(오늘 공개한 판단의 1순위 개념, 처음 공개한 순서, 한 번씩), 개념 목록은 갈래(결과→숫자→그때→내 판단) 다음 order 순,
 * 일지의 conceptTitle(공개된 행만)·infoLevel, 신고 clientReportId(같은 id 재전송은 같은 신고, 다른 카드에 같은 id면 409 report_conflict).
 * 모든 응답은 계약 스키마(.strict())로 한 번 더 걸러 보낸다 — 목이 계약에서 벗어나면 바로 깨진다.
 * 상태는 localStorage('bokgi.mock.v1')에 남아 새로고침해도 이어진다.
 */
import type { z } from "zod";
import * as C from "@/shared/contract";
import type { BokgiApi } from "./api";
import { ApiError } from "./errors";
import { buildMonth, dueCounts } from "./calendar";
import { addDays, BRANCHES, dayKeyOf, DIR, josa, localDayKey, monthOf, uuid } from "./format";
import { MOCK_CASES, MOCK_CONCEPTS, MOCK_REVEAL, MOCK_TEST_CASE, MOCK_TEST_REVEAL, MOCK_USER_ID, type MockConcept, type MockReveal } from "./mockData";
import type {
  ConceptState, ConceptToday, Direction, Explain, Gesture, InfoGroup, InfoLevel, JournalItem, PanelKind, Prefs, PublicCase, QuizBody,
  QuizResult, ReportBody, Result, Reveal, SelfCheck, Today, TodayCard, UiEvent,
} from "./types";

const KEY = "bokgi.mock.v1";
const ONBOARD_KEY = "bokgi.onboarded";
const DECK4_KEY = "bokgi.mock.deck4";
/** 시험용: '1'이면 PUT /api/me/prefs가 실패한다(설정 저장 실패 → 화면 되돌림 확인) */
const FAIL_PREFS_KEY = "bokgi.mock.failPrefs";
const EVENTS_KEEP = 400;

type MJudgment = {
  id: string; caseId: string; caseVersion: number; keyEvidenceId: string; keyEvidence: string;
  riskId: string | null; risk: string | null; direction: Direction; confidence: number; recognized: boolean;
  panelsViewed: PanelKind[]; gesture: Gesture | null; isExtra: boolean;
  /** 판단 때의 정보 수준과 숨겨져 있던 묶음('더 보기'로 펼쳤으면 []) — 예전에 저장된 상태에는 없을 수 있다 */
  infoLevel?: InfoLevel; hiddenGroups?: InfoGroup[];
  createdAt: string; localDate: string; revealedAt: string | null; selfCheck: SelfCheck | null;
  /** 공개 때 채점해 붙인다(서버 judgment_outcomes와 같다). 이후 화면은 이 값만 읽는다 */
  result: Result | null;
};
type MProgress = { state: ConceptState; level: number; dueOn: string | null; correct: number; total: number };
type MAttempt = { clientAttemptId: string; conceptId: string; via: QuizBody["via"]; localDate: string; at: string; result: QuizResult };
type MState = {
  v: 1;
  onboarded: boolean;
  /** 서버 users.info_level·panel_prefs·undo_seconds와 같은 자리(프리셋이면 묶음은 프리셋 값) */
  prefs: Prefs;
  judgments: MJudgment[];
  progress: Record<string, MProgress>;
  attempts: MAttempt[];
  sessions: Record<string, { cards: string[] }>;
  reports: (ReportBody & { id: string; createdAt: string })[];
  events: UiEvent[];
};

const defaultPrefs = (): Prefs => ({ infoLevel: C.INFO_LEVEL_DEFAULT, panelPrefs: C.presetPrefs(C.INFO_LEVEL_DEFAULT), undoSeconds: C.UNDO_SECONDS_DEFAULT });
const fresh = (): MState => ({ v: 1, onboarded: false, prefs: defaultPrefs(), judgments: [], progress: {}, attempts: [], sessions: {}, reports: [], events: [] });

function out<S extends z.ZodType>(schema: S, value: z.input<S>): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new Error(`[mock] 계약과 다른 응답: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return r.data;
}
function input<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError(422, "validation_failed", "요청 형식이 올바르지 않아요.");
  return r.data;
}
const notFound = () => new ApiError(404, "not_found", "찾을 수 없어요.");
const sg = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1);

function readStore(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* 저장소를 못 쓰면 메모리로만 */ }
}

function load(): MState {
  try {
    const raw = readStore(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<MState>) : null;
    if (s && s.v === 1) {
      // 1차 때 저장된 상태(또는 시험이 넣은 상태)에 prefs가 없거나 깨졌으면 기본값으로
      const prefs = C.PanelPrefs.safeParse(s.prefs?.panelPrefs).success && C.InfoLevel.safeParse(s.prefs?.infoLevel).success
        && C.UndoSeconds.safeParse(s.prefs?.undoSeconds).success ? (s.prefs as Prefs) : defaultPrefs();
      return { ...fresh(), ...s, prefs } as MState;
    }
  } catch { /* 깨진 값은 버린다 */ }
  return fresh();
}

/* ---------- 해설 템플릿 (prototype AI.explain 이식, 숫자 가드 포함) ---------- */
function templateExplain(j: MJudgment, o: MockReveal["outcome"], res: Result, conceptTitle: string): Explain {
  const ev = j.keyEvidence, q = `'${ev}'`, rel = res.relativePp, dir = DIR[j.direction];
  const picked = `${q}${josa(ev, "을", "를")} 핵심 근거로 짚어`;
  const good = res.state === "even" ? `${picked} 두었고, 결과는 시장 대비 ${sg(rel)}%p로 시장과 거의 같았어요.`
    : res.hit ? `${picked} '${dir}'를 골랐고, 결과도 시장 대비 ${sg(rel)}%p로 고른 방향과 같았어요.`
    : `${picked} 두었기에, 시장 대비 ${sg(rel)}%p라는 결과와 나란히 되짚어 볼 수 있어요.`;
  const change = !j.risk ? `다음에는 ${q}${josa(ev, "과", "와")} 함께 가장 큰 위험 요인도 하나 골라, 반대로 움직일 가능성을 같이 적어 보세요.`
    : res.state === "even" ? "시장과 거의 같게 움직인 사례라 근거의 힘을 가리기 어려우니, 다음에는 같은 근거가 시장 대비로 어떻게 이어지는지 여러 장에 걸쳐 살펴보세요."
    : res.hit ? `방향이 같았던 한 번만으로 근거가 옳았다고 보기는 어려우니, 다음에도 ${q}${josa(ev, "이", "가")} 이미 가격에 반영돼 있었는지부터 확인해 보세요.`
    : `왜 이렇게 움직였는지는 한 가지 이유로 말할 수 없지만, 다음에 ${q} 같은 근거를 쓸 때는 그 정보가 이미 가격에 반영돼 있었는지부터 확인해 보세요.`;
  const link = `이번 결과를 읽는 데 필요한 개념은 ${conceptTitle}${josa(conceptTitle, "이에요", "예요")}.`;
  // 숫자 가드: 공개 화면에 나온 숫자(회사·시장 수익률, 시장 대비, 시장 이름)와 고른 근거의 숫자만 허용
  const nums = (s: string) => s.match(/\d+(?:\.\d+)?/g) ?? [];
  const allowed = new Set(nums([sg(o.returnPct), sg(o.benchReturnPct), sg(rel), o.benchName, ev].join(" ")));
  const guard = (text: string, safe: string) => (nums(text).every((n) => allowed.has(n)) ? text : safe);
  return {
    persona: "펀드매니저",
    source: "template",
    lines: [
      { kind: "good", label: "source", text: guard(good, "이번에 고른 근거와 결과는 위 내 판단 표에서 나란히 볼 수 있어요.") },
      { kind: "change", label: "inference", text: guard(change, "왜 이렇게 움직였는지는 한 가지 이유로 말할 수 없으니, 다음에는 근거가 이미 가격에 반영돼 있었는지부터 확인해 보세요.") },
      { kind: "concept", label: "source", text: guard(link, "이번 결과를 읽는 데 필요한 개념은 아래 개념 카드에 있어요.") },
    ],
  };
}

/* ---------- 통계 인사이트 (prototype State.stats 이식: 횟수만, 퍼센트·적중률 없음) ---------- */
const MIN_INSIGHT = 3;
const evidenceKind = (e: string) => {
  const full = String(e).trim();
  return full.split(/\s+/).filter((t) => /[가-힣a-z]/i.test(t) && !/\d/.test(t) && t.toLowerCase() !== "vs").join(" ") || full;
};
type Done = { j: MJudgment; r: Result };
function insightSentences(done: Done[]): string[] {
  const outs: string[] = [];
  const count = (xs: Done[], state: Result["state"]) => xs.filter((d) => d.r.state === state).length;
  const byConf = new Map<number, Done[]>();
  done.forEach((d) => byConf.set(d.j.confidence, [...(byConf.get(d.j.confidence) ?? []), d]));
  const conf = [...byConf.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0];
  if (conf && conf[1].length >= MIN_INSIGHT) {
    const level = conf[0];
    outs.push(`확신도 ${level}${josa(String(level), "을", "를")} 준 판단 ${conf[1].length}번 중 시장보다 앞선 것은 ${count(conf[1], "ahead")}번이었어요.`);
  }
  const byKind = new Map<string, Done[]>();
  done.forEach((d) => { const k = evidenceKind(d.j.keyEvidence); byKind.set(k, [...(byKind.get(k) ?? []), d]); });
  const ev = [...byKind.entries()].map(([label, xs]) => ({ label, n: xs.length, k: count(xs, "behind") }))
    .filter((e) => e.n >= MIN_INSIGHT && e.k > 0)
    .sort((a, b) => b.k - a.k || a.n - b.n || a.label.localeCompare(b.label))[0];
  if (ev) outs.push(`'${ev.label}'${josa(ev.label, "을", "를")} 근거로 한 판단 ${ev.n}번 중 ${ev.k}번이 시장보다 뒤졌어요.`);
  const known = done.filter((d) => d.j.recognized), unknown = done.filter((d) => !d.j.recognized);
  if (known.length >= MIN_INSIGHT && unknown.length >= MIN_INSIGHT) {
    outs.push(`아는 회사 판단 ${known.length}번과 모르는 회사 판단 ${unknown.length}번의 앞섬 횟수는 ${count(known, "ahead")}번·${count(unknown, "ahead")}번이었어요.`);
  }
  return outs;
}
const CALIBRATION = {
  over: "확신도를 높게 고른 만큼 결과가 판단과 같은 방향이지는 않았어요 — 확신이 근거보다 앞서는 편이에요.",
  under: "고른 확신도에 비해 결과가 판단과 같은 방향인 때가 많았어요 — 확신도를 낮게 고르는 편이에요.",
  fit: "고른 확신도와 결과가 대체로 어울려요.",
};
function calibrationNote(done: Done[]): string | null {
  const decided = done.filter((d) => typeof d.r.hit === "boolean");
  if (decided.length < 10) return null;
  const expected = decided.reduce((s, d) => s + 0.5 + (d.j.confidence - 1) * 0.1, 0) / decided.length;
  const actual = decided.filter((d) => d.r.hit).length / decided.length;
  return expected - actual > 0.1 ? CALIBRATION.over : expected - actual < -0.1 ? CALIBRATION.under : CALIBRATION.fit;
}

/* ---------- 질문자 템플릿 (유형 6종, 판단 전 자료와 고른 근거·확신도만 쓴다) ---------- */
function templateQuestion(c: PublicCase, evidenceLabel: string, confidence: number): { templateType: number; text: string } {
  const ev = evidenceLabel;
  const bank = [
    `${ev}${josa(ev, "을", "를")} 가장 중요하게 보셨군요. 이 근거와 반대로 읽히는 정보가 카드에 있는지 찾아보세요.`,
    `${ev} 말고 다른 판(흐름·숫자·그때)에서 판단을 바꿀 만한 숫자가 있었나요?`,
    `${ev}${josa(ev, "이", "가")} 회사의 절대 상승을 말하나요, 시장보다 나은 이유를 말하나요?`,
    "판단 기간이 절반이라면 같은 판단을 하셨을까요?",
    "어떤 정보가 나오면 이 판단을 거두시겠어요?",
    `확신도 ${confidence}/5로 두셨는데, 그 확신은 어떤 정보에서 왔나요?`,
  ];
  const seed = [...c.id].reduce((s, ch) => s + ch.charCodeAt(0), 0) + confidence;
  const i = seed % bank.length;
  return { templateType: i + 1, text: bank[i] };
}

export function createMockApi(): BokgiApi {
  const st = load();
  const save = () => {
    if (st.events.length > EVENTS_KEEP) st.events.splice(0, st.events.length - EVENTS_KEEP);
    writeStore(KEY, JSON.stringify(st));
  };
  const today = () => localDayKey();
  const deck = (): PublicCase[] => (readStore(DECK4_KEY) === "1" ? [...MOCK_CASES, MOCK_TEST_CASE] : MOCK_CASES);
  const caseById = (id: string) => deck().find((c) => c.id === id);
  const revealOf = (id: string): MockReveal | undefined => (id === MOCK_TEST_CASE.id ? MOCK_TEST_REVEAL : MOCK_REVEAL[id]);
  const conceptById = (id: string): MockConcept | undefined => MOCK_CONCEPTS.find((c) => c.id === id);
  const judgmentOf = (id: string) => st.judgments.find((j) => j.id === id);

  const resultOf = (j: MJudgment): Result => {
    if (j.result) return j.result;
    const o = revealOf(j.caseId);
    if (!o) throw notFound();
    const relativePp = C.roundPp(o.outcome.returnPct - o.outcome.benchReturnPct);
    const state = C.resultState(relativePp);
    return { relativePp, state, hit: C.hitOf(state, j.direction) };
  };

  /** 서버 getToday와 같은 규칙. extra=true면 cards에 '한 장 더' 한 장(오늘 판단·미공개 한 장 더가 먼저) */
  const buildToday = (extra: boolean): Today => {
    const date = today();
    const byCase = new Map(st.judgments.map((j) => [j.caseId, j]));
    let ses = st.sessions[date];
    if (!ses) {
      const pick = deck().filter((c) => !byCase.has(c.id)).slice(0, C.SESSION_CARDS).map((c) => c.id);
      if (pick.length) { ses = { cards: pick }; st.sessions[date] = ses; save(); }
    }
    const setIds = (ses?.cards ?? []).filter((id) => byCase.has(id) || caseById(id));
    const card = (id: string): TodayCard => {
      const j = byCase.get(id);
      return { caseId: id, version: j ? j.caseVersion : (caseById(id)?.version ?? 1), judgmentId: j?.id ?? null, revealed: !!j?.revealedAt };
    };
    const setCards = setIds.map(card);
    const setDone = setCards.every((c) => c.judgmentId !== null);
    const remaining = deck().filter((c) => !byCase.has(c.id));
    let cards = setCards;
    if (extra) {
      const pendingExtra = st.judgments
        .filter((j) => j.isExtra && !j.revealedAt && j.localDate === date && !setIds.includes(j.caseId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      cards = pendingExtra ? [card(pendingExtra.caseId)] : setDone && remaining.length ? [card(remaining[0].id)] : [];
    }

    const doneReviews = st.attempts.filter((a) => a.via === "review" && a.localDate === date).length;
    const due = Object.entries(st.progress)
      .filter(([id, p]) => conceptById(id) && p.dueOn && p.dueOn <= date)
      .sort((a, b) => (a[1].dueOn ?? "").localeCompare(b[1].dueOn ?? "") || a[0].localeCompare(b[0]));
    const reviews = due.slice(0, Math.max(0, C.SESSION_REVIEWS_MAX - doneReviews))
      .map(([id, p]) => ({ conceptId: id, title: conceptById(id)?.title ?? id, dueOn: p.dueOn ?? date }));

    const days = new Set(st.judgments.map((j) => j.localDate));
    let d = days.has(date) ? date : addDays(date, -1);
    let streak = 0;
    while (days.has(d)) { streak++; d = addDays(d, -1); }

    // 오늘 공개한 판단의 1순위 학습 포인트 개념(처음 공개한 순서, 개념당 한 번)과 지금의 숙련도 — 서버 conceptsMetToday와 같다
    const conceptsToday: ConceptToday[] = [];
    st.judgments
      .filter((j): j is MJudgment & { revealedAt: string } => !!j.revealedAt && dayKeyOf(new Date(j.revealedAt)) === date)
      .sort((a, b) => a.revealedAt.localeCompare(b.revealedAt))
      .forEach((j) => {
        const c = conceptById(revealOf(j.caseId)?.learning[0]?.conceptId ?? "");
        if (!c || conceptsToday.some((x) => x.conceptId === c.id)) return;
        const p = st.progress[c.id];
        conceptsToday.push({ conceptId: c.id, title: c.title, state: p?.state ?? "new", dueOn: p?.dueOn ?? null });
      });

    return out(C.Today, {
      date, streak,
      entry: {
        conceptsKnown: MOCK_CONCEPTS.filter((c) => st.progress[c.id]?.state === "known").length,
        conceptsTotal: MOCK_CONCEPTS.length,
        reviewsDue: reviews.length,
        cardsLeft: setCards.filter((c) => !c.judgmentId).length,
      },
      cards, extraAllowed: setDone && remaining.length > 0, reviews,
      extraJudged: st.judgments.filter((j) => j.isExtra && j.localDate === date).length,
      conceptsToday,
    });
  };

  const api: BokgiApi = {
    async me() {
      return out(C.Me, { user: { id: MOCK_USER_ID, nickname: "체험", onboarded: st.onboarded || readStore(ONBOARD_KEY) === "1", tz: "Asia/Seoul", ...st.prefs } });
    },
    async prefs(body) {
      const b = input(C.PrefsBody, body);
      if (readStore(FAIL_PREFS_KEY) === "1") throw new ApiError(503, "unavailable", "잠시 뒤에 다시 시도해 주세요.");
      let level: InfoLevel = b.infoLevel;
      let panelPrefs = C.presetPrefs(level);
      if (level === "custom") {
        if (!b.panelPrefs) throw new ApiError(422, "validation_failed", "요청 형식이 올바르지 않아요.");
        level = C.levelForPrefs(b.panelPrefs);   // 프리셋과 같은 묶음이면 그 수준으로 저장(응답 수준이 보낸 값과 다를 수 있다)
        panelPrefs = level === "custom" ? { ...b.panelPrefs } : C.presetPrefs(level);
      }
      st.prefs = { infoLevel: level, panelPrefs, undoSeconds: b.undoSeconds ?? st.prefs.undoSeconds };
      save();
      return api.me();
    },
    async invite() { /* 목 모드는 초대 없이 들어온다 */ },
    async today(opts) { return buildToday(!!opts?.extra); },
    async getCase(id) {
      const c = caseById(id);
      if (!c) throw notFound();
      return out(C.PublicCase, c);
    },
    async createJudgment(body) {
      const b = input(C.JudgmentBody, body);
      const c = caseById(b.caseId);
      if (!c) throw notFound();
      if (b.caseVersion !== c.version) throw new ApiError(409, "stale_version", "카드가 바뀌었어요. 다시 불러와 주세요.");
      const ev = c.evidenceOptions.find((o) => o.id === b.keyEvidenceId);
      const rk = b.riskId ? c.riskOptions.find((o) => o.id === b.riskId) : null;
      if (!ev || (b.riskId && !rk)) throw new ApiError(422, "validation_failed", "요청 형식이 올바르지 않아요.");
      const existing = st.judgments.find((j) => j.caseId === b.caseId);
      if (existing) return out(C.JudgmentCreated, { judgmentId: existing.id, existing: true });
      const j: MJudgment = {
        id: uuid(), caseId: c.id, caseVersion: c.version, keyEvidenceId: ev.id, keyEvidence: ev.label,
        riskId: rk ? rk.id : null, risk: rk ? rk.label : null, direction: b.direction, confidence: b.confidence,
        recognized: b.recognized, panelsViewed: b.panelsViewed, gesture: b.gesture, isExtra: b.isExtra,
        infoLevel: b.infoLevel, hiddenGroups: [...new Set(b.hiddenGroups)],
        createdAt: new Date().toISOString(), localDate: today(), revealedAt: null, selfCheck: null, result: null,
      };
      st.judgments.push(j);
      save();
      return out(C.JudgmentCreated, { judgmentId: j.id, existing: false });
    },
    async reveal(judgmentId) {
      const j = judgmentOf(judgmentId);
      const c = j && caseById(j.caseId);
      const rv = j && revealOf(j.caseId);
      if (!j || !c || !rv) throw notFound();
      const res = resultOf(j);
      if (!j.revealedAt || !j.result) { j.revealedAt = j.revealedAt ?? new Date().toISOString(); j.result = res; save(); }
      const lp = rv.learning[0];
      const concept = conceptById(lp.conceptId);
      if (!concept) throw notFound();
      const reveal: Reveal = {
        judgmentId: j.id, caseId: c.id, version: j.caseVersion,
        judgment: { direction: j.direction, confidence: j.confidence, keyEvidence: j.keyEvidence, risk: j.risk, recognized: j.recognized, selfCheck: j.selfCheck },
        outcome: rv.outcome, result: res, keyPoints: rv.keyPoints,
        learning: {
          concept: { id: concept.id, branch: concept.branch, title: concept.title, body: concept.body, linkSentence: lp.linkSentence },
          quiz: { quizId: concept.quiz.quizId, question: concept.quiz.question, options: concept.quiz.options },
          selfCheckEnabled: c.difficulty >= C.SELF_CHECK_FROM_DIFFICULTY,
        },
        explain: templateExplain(j, rv.outcome, res, concept.title),
      };
      return out(C.Reveal, reveal);
    },
    async selfCheck(judgmentId, value) {
      const v = input(C.SelfCheckBody, { value });
      const j = judgmentOf(judgmentId);
      if (!j) throw notFound();
      if (!j.revealedAt) throw new ApiError(409, "not_revealed", "공개한 뒤에 고를 수 있어요.");
      j.selfCheck = v.value;
      save();
    },
    async quiz(conceptId, body) {
      const b = input(C.QuizBody, body);
      const c = conceptById(conceptId);
      if (!c || c.quiz.quizId !== b.quizId || b.optionIndex >= c.quiz.options.length) throw notFound();
      const again = st.attempts.find((a) => a.clientAttemptId === b.clientAttemptId);
      if (again) return out(C.QuizResult, { ...again.result, answerIndex: c.quiz.answer });
      const date = today();
      const correct = b.optionIndex === c.quiz.answer;
      const prev = st.progress[conceptId];
      const p: MProgress = prev ? { ...prev } : { state: "new", level: 0, dueOn: null, correct: 0, total: 0 };
      p.total++;
      if (correct) p.correct++;
      p.state = p.total >= 2 && p.correct / p.total >= 0.75 ? "known" : correct ? "learning" : "review";
      // 간격 복습: 맞히면 level +1(처음은 0), 틀리면 0. 아직 기한 전인 개념을 다시 맞히면 그대로 둔다
      if (!(correct && prev?.dueOn && prev.dueOn > date)) {
        const level = correct ? Math.min((prev?.dueOn ? prev.level : -1) + 1, C.REVIEW_INTERVALS.length - 1) : 0;
        p.level = level;
        p.dueOn = addDays(date, C.REVIEW_INTERVALS[level]);
      }
      st.progress[conceptId] = p;
      // 서버(A)와 같은 해설 문구: 정답은 채점 뒤에만 알린다
      const explanation = correct ? "맞아요." : `아니에요. 정답: ‘${c.quiz.options[c.quiz.answer]}’.`;
      const result: QuizResult = { correct, answerIndex: c.quiz.answer, explanation, level: p.level, state: p.state, nextDueOn: p.dueOn ?? addDays(date, 1) };
      st.attempts.push({ clientAttemptId: b.clientAttemptId, conceptId, via: b.via, localDate: date, at: new Date().toISOString(), result });
      save();
      return out(C.QuizResult, result);
    },
    async concepts() {
      // 서버와 같다: 갈래(결과 → 숫자 → 그때 → 내 판단) 다음 갈래 안 순서(order = 콘텐츠 나열 순서, 1부터)
      return out(C.ConceptList, {
        concepts: BRANCHES.flatMap((branch) => MOCK_CONCEPTS.filter((c) => c.branch === branch).map((c, i) => {
          const p = st.progress[c.id];
          return {
            id: c.id, branch: c.branch, title: c.title, body: c.body, linkSentence: null,
            state: p?.state ?? "new", level: p?.level ?? 0, dueOn: p?.dueOn ?? null,
            quiz: { quizId: c.quiz.quizId, question: c.quiz.question, options: c.quiz.options },
            order: i + 1,
          };
        })),
      });
    },
    async journal(month) {
      const date = today();
      if (month !== undefined && !/^\d{4}-\d{2}$/.test(month)) throw new ApiError(422, "invalid_month", "달 형식은 YYYY-MM이에요.");
      const m = month ?? monthOf(date);
      const items: JournalItem[] = [...st.judgments]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((j) => {
          const c = caseById(j.caseId);
          const revealed = !!j.revealedAt;
          const rv = revealed ? revealOf(j.caseId) : undefined;   // 결과 대기 행은 결과 자료(학습 포인트 포함)를 읽지 않는다
          const o = rv?.outcome;
          return {
            judgmentId: j.id, createdAt: j.createdAt, localDate: j.localDate,
            direction: j.direction, confidence: j.confidence, keyEvidence: j.keyEvidence, recognized: j.recognized, selfCheck: j.selfCheck,
            revealed, companyName: o ? o.companyName : null, ticker: o ? o.ticker : null, result: revealed ? resultOf(j) : null,
            conceptTitle: rv ? (conceptById(rv.learning[0]?.conceptId ?? "")?.title ?? null) : null,
            sectorPublic: c?.sectorPublic ?? "", sizeBucket: c?.sizeBucket ?? "",
            infoLevel: j.infoLevel ?? C.INFO_LEVEL_DEFAULT,
          };
        });
      const practiced = new Set(st.judgments.map((j) => j.localDate));
      const dueDates = Object.entries(st.progress).filter(([id, p]) => conceptById(id) && p.dueOn).map(([, p]) => p.dueOn as string);
      const cal = buildMonth(m, practiced, dueCounts(dueDates, date));
      const done: Done[] = st.judgments.filter((j) => j.revealedAt && (j.result || revealOf(j.caseId))).map((j) => ({ j, r: resultOf(j) }));
      const locked = done.length < C.STATS_UNLOCK_AT;
      return out(C.Journal, {
        items, count: items.length,
        calendar: { month: cal.month, days: cal.days, practicedDays: cal.practicedDays, reviewsDue: cal.reviewsDue },
        stats: { locked, unlockAt: C.STATS_UNLOCK_AT, insights: locked ? [] : insightSentences(done), calibrationNote: locked ? null : calibrationNote(done) },
      });
    },
    async explain(judgmentId) {
      const j = judgmentOf(judgmentId);
      const rv = j && revealOf(j.caseId);
      if (!j || !rv) throw notFound();
      if (!j.revealedAt) throw new ApiError(409, "not_revealed", "공개한 뒤에 볼 수 있어요.");
      const concept = conceptById(rv.learning[0].conceptId);
      if (!concept) throw notFound();
      return out(C.Explain, templateExplain(j, rv.outcome, resultOf(j), concept.title));
    },
    async question(body) {
      const b = input(C.QuestionBody, body);
      const c = caseById(b.caseId);
      const ev = c?.evidenceOptions.find((o) => o.id === b.evidenceId);
      if (!c || !ev) throw notFound();
      const t = templateQuestion(c, ev.label, b.confidence);
      return out(C.Question, { templateType: t.templateType, lines: [{ label: "inference", text: t.text }], source: "template" });
    },
    async report(body) {
      const b = input(C.ReportBody, body);
      if (!caseById(b.caseId)) throw notFound();
      // 서버와 같다: 같은 clientReportId 재전송은 같은 신고(두 번 세지 않음), 다른 카드에 같은 id를 쓰면 409
      const again = st.reports.find((r) => r.clientReportId === b.clientReportId);
      if (again) {
        if (again.caseId !== b.caseId) throw new ApiError(409, "report_conflict", "이미 다른 카드에 쓴 신고 번호예요.");
        return;
      }
      st.reports.push({ ...b, id: uuid(), createdAt: new Date().toISOString() });
      save();
    },
    async events(body) {
      const b = input(C.EventsBody, body);
      const allowed = new Set<string>(C.UI_EVENTS);
      if (b.events.some((e) => !allowed.has(e.event))) throw new ApiError(422, "unknown_event", "알 수 없는 이벤트예요.");
      const seen = new Set(st.events.map((e) => e.clientEventId));
      b.events.forEach((e) => { if (!seen.has(e.clientEventId)) st.events.push(e); });
      // 서버(A)와 같다: onboarding_done이 오면 첫 실행 안내를 마친 것으로 기록(기기 표시도 남긴다)
      if (b.events.some((e) => e.event === "onboarding_done")) { st.onboarded = true; writeStore(ONBOARD_KEY, "1"); }
      save();
    },
  };

  // 시험·수동 확인용 손잡이(목 모드에서만 존재)
  if (typeof window !== "undefined") {
    (window as unknown as { __bokgiMock?: unknown }).__bokgiMock = {
      state: (): MState => JSON.parse(JSON.stringify(st)) as MState,
      reset: () => { Object.assign(st, fresh()); save(); try { localStorage.removeItem(ONBOARD_KEY); } catch { /* 무시 */ } },
    };
  }
  return api;
}

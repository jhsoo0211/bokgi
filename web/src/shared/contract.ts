/**
 * 복기 API 계약 (클라이언트·서버 공용). 구현계획 05 §4 기준. 이 파일이 유일한 계약이다.
 * 규칙: 판단 전 자료(PublicCase)에는 결과급 값(회사명·티커·절대 날짜·수익률·원문 위치·학습 포인트)이 없다.
 * 모든 스키마는 .strict() — 모르는 키는 거절한다(결과 유출 방지).
 */
import { z } from "zod";

// ---------- 공통 ----------
export const ErrorEnvelope = z.object({ error: z.object({ code: z.string(), message: z.string() }).strict() }).strict();
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

export const Direction = z.enum(["outperform", "underperform"]);
export const ResultState = z.enum(["ahead", "behind", "even"]);
export const SelfCheck = z.enum(["o", "tri", "x"]);
export const PanelKind = z.enum(["flow", "numbers", "then"]);
export const ConceptBranch = z.enum(["outcome", "numbers", "then", "self"]);
export const ConceptState = z.enum(["new", "learning", "review", "known"]);
export const LabelKind = z.enum(["source", "inference", "uncertain"]);
export const ReportCategory = z.enum([
  "data_error", "identifiable", "missing_info", "outcome_explanation", "concept_unclear", "source_error", "ai_as_fact", "other",
]);

export const Index14 = z.array(z.number()).length(14);

// ---------- 정보 수준 (D16, 2026-10-04) ----------
/** 사용자가 고르는 세 판의 깊이. 서버는 PublicCase를 그대로 보내고 클라이언트가 묶음 단위로 가린다(05 §14). */
export const InfoLevel = z.enum(["basic", "standard", "advanced", "custom"]);
export type InfoLevel = z.infer<typeof InfoLevel>;
/** 켜고 끄는 묶음(02 §7.1 깊이 표). 순서는 설정 시트의 표시 순서. */
export const INFO_GROUPS = [
  "marketLine",      // 흐름 · 시장 비교선
  "volume",          // 흐름 · 거래량 추세
  "growthDetail",    // 숫자 · EPS 성장·가이던스
  "healthBasic",     // 숫자 · 부채비율
  "valuationDetail", // 숫자 · PBR·PSR
  "healthDetail",    // 숫자 · 순현금·FCF
  "allNotes",        // 그때 · 이슈 전부(끄면 공시·통계 우선 2개)
  "fxCommodity",     // 그때 · 환율·원자재 메모
  "riskChips",       // 위험 칩(선택 입력)
] as const;
export const InfoGroup = z.enum(INFO_GROUPS);
export type InfoGroup = z.infer<typeof InfoGroup>;
export const PanelPrefs = z.object({
  marketLine: z.boolean(), volume: z.boolean(), growthDetail: z.boolean(), healthBasic: z.boolean(), valuationDetail: z.boolean(),
  healthDetail: z.boolean(), allNotes: z.boolean(), fxCommodity: z.boolean(), riskChips: z.boolean(),
}).strict();
export type PanelPrefs = z.infer<typeof PanelPrefs>;
/** 프리셋. 초급 = 전부 끔, 중급(기본값) = 세부·환율 끔, 고급 = 전부 켬. 사용자 지정은 프리셋이 없다. */
export const INFO_PRESETS = {
  basic: { marketLine: false, volume: false, growthDetail: false, healthBasic: false, valuationDetail: false, healthDetail: false, allNotes: false, fxCommodity: false, riskChips: false },
  standard: { marketLine: true, volume: true, growthDetail: true, healthBasic: true, valuationDetail: false, healthDetail: false, allNotes: true, fxCommodity: false, riskChips: true },
  advanced: { marketLine: true, volume: true, growthDetail: true, healthBasic: true, valuationDetail: true, healthDetail: true, allNotes: true, fxCommodity: true, riskChips: true },
} as const satisfies Record<Exclude<InfoLevel, "custom">, PanelPrefs>;
export const INFO_LEVEL_DEFAULT: InfoLevel = "standard";
/** 프리셋 값(사용자 지정은 호출자가 prefs를 따로 가진다 → 기본값 프리셋을 돌려준다). */
export function presetPrefs(level: InfoLevel): PanelPrefs {
  return { ...(level === "custom" ? INFO_PRESETS.standard : INFO_PRESETS[level]) };
}
/** prefs가 프리셋과 같으면 그 수준, 아니면 custom — 토글을 하나라도 바꾸면 "사용자 지정"이 되는 규칙. */
export function levelForPrefs(prefs: PanelPrefs): InfoLevel {
  for (const level of ["basic", "standard", "advanced"] as const) {
    if (INFO_GROUPS.every((g) => INFO_PRESETS[level][g] === prefs[g])) return level;
  }
  return "custom";
}
/** 판단 때 숨겨져 있던 묶음(JudgmentBody.hiddenGroups 에 넣는다). */
export function hiddenGroupsOf(prefs: PanelPrefs): InfoGroup[] {
  return INFO_GROUPS.filter((g) => !prefs[g]);
}
/** 되돌리기 알림 시간(초). 화면 읽기 사용자는 길게(ecc 감사 2026-10-04). */
export const UndoSeconds = z.union([z.literal(2.5), z.literal(5), z.literal(10)]);
export type UndoSeconds = z.infer<typeof UndoSeconds>;
export const UNDO_SECONDS_DEFAULT: UndoSeconds = 2.5;

// ---------- 판단 전: PublicCase (toPublicCase() 의 결과이자 GET /api/cases/{id} 응답) ----------
export const FlowPanel = z.object({
  index14: Index14, market14: Index14, volumeTrend: z.enum(["증가", "유지", "감소"]), windowDays: z.number().int(),
}).strict();
export const NumbersPanel = z.object({
  growth: z.object({ revYoy: z.string(), opm: z.string(), epsYoy: z.string(), guidance: z.string() }).strict(),
  valuation: z.object({ per: z.string(), perSector: z.string(), pbr: z.string(), psr: z.string().nullable() }).strict(),
  health: z.object({ debtRatio: z.string(), netCash: z.string(), fcf: z.string() }).strict(),
  asOfRelative: z.string(),           // 예: "판단일 D-21(공시 기준)"
}).strict();
export const ThenPanel = z.object({
  rate: z.string(), rateTrend: z.enum(["상승기", "동결", "하락기"]), fxNote: z.string().nullable(), commodityNote: z.string().nullable(),
  notes: z.array(z.object({ when: z.string(), text: z.string(), sourceKind: z.enum(["공시", "보도", "통계"]) }).strict()).max(5),
}).strict();
export const EvidenceOption = z.object({ id: z.string(), label: z.string(), why: z.string(), panel: PanelKind }).strict();
export const RiskOption = z.object({ id: z.string(), label: z.string() }).strict();

export const PublicCase = z.object({
  id: z.string().uuid(), version: z.number().int(), yearPublic: z.number().int(), sectorPublic: z.string(),
  sizeBucket: z.enum(["소형", "중형", "대형"]), horizonDays: z.union([z.literal(90), z.literal(180), z.literal(365)]),
  difficulty: z.number().int().min(1).max(5),
  panels: z.object({ flow: FlowPanel, numbers: NumbersPanel, then: ThenPanel }).strict(),
  evidenceOptions: z.array(EvidenceOption).min(3).max(8), riskOptions: z.array(RiskOption).min(2).max(6),
}).strict();
export type PublicCase = z.infer<typeof PublicCase>;

// ---------- 인증 ----------
export const InviteBody = z.object({ code: z.string().min(4).max(64), nickname: z.string().min(1).max(20) }).strict();
export const Me = z.object({
  user: z.object({
    id: z.string().uuid(), nickname: z.string(), onboarded: z.boolean(), tz: z.string(),
    infoLevel: InfoLevel, panelPrefs: PanelPrefs, undoSeconds: UndoSeconds,
  }).strict(),
}).strict();
export type Me = z.infer<typeof Me>;
/**
 * PUT /api/me/prefs → Me. infoLevel이 custom이 아니면 panelPrefs는 무시하고 프리셋으로 정규화한다.
 * custom이면 panelPrefs가 필수(없으면 422)이고, 프리셋과 같은 값이면 서버가 그 수준으로 되돌려 저장한다(levelForPrefs).
 * undoSeconds를 생략하면 그대로 둔다.
 */
export const PrefsBody = z.object({ infoLevel: InfoLevel, panelPrefs: PanelPrefs.optional(), undoSeconds: UndoSeconds.optional() }).strict();

// ---------- 오늘 ----------
export const TodayCard = z.object({ caseId: z.string().uuid(), version: z.number().int(), judgmentId: z.string().uuid().nullable(), revealed: z.boolean() }).strict();
export const ReviewItem = z.object({ conceptId: z.string(), title: z.string(), dueOn: z.string() }).strict();
/** 오늘 공개한 카드에서 만난 개념(오늘 끝 요약·'복습 i/n' 머리줄용 — 기기 기록 대신 서버가 센다, 2026-10-04) */
export const ConceptToday = z.object({ conceptId: z.string(), title: z.string(), state: ConceptState, dueOn: z.string().nullable() }).strict();
export const Today = z.object({
  date: z.string(),                   // YYYY-MM-DD (서버 tz 기준)
  streak: z.number().int(),
  entry: z.object({ conceptsKnown: z.number().int(), conceptsTotal: z.number().int(), reviewsDue: z.number().int(), cardsLeft: z.number().int() }).strict(),
  cards: z.array(TodayCard).max(3), extraAllowed: z.boolean(), reviews: z.array(ReviewItem).max(2),
  extraJudged: z.number().int(),      // 오늘 '한 장 더'로 판단한 수(머리줄 '오늘 3/3 +k')
  conceptsToday: z.array(ConceptToday),
}).strict();
export type Today = z.infer<typeof Today>;

// ---------- 판단 ----------
export const Gesture = z.object({ via: z.enum(["swipe", "button", "key"]), dx: z.number().optional(), ms: z.number().optional(), v: z.number().optional(), flips: z.number().int().optional() }).strict();
export const JudgmentBody = z.object({
  caseId: z.string().uuid(), caseVersion: z.number().int(),
  keyEvidenceId: z.string(), riskId: z.string().nullable(), direction: Direction,
  confidence: z.number().int().min(1).max(5), recognized: z.boolean(),
  panelsViewed: z.array(PanelKind), gesture: Gesture.nullable(), isExtra: z.boolean().default(false),
  // 판단 때의 정보 수준과 숨겨져 있던 묶음(분석용, 02 §7.1). '더 보기'로 이 카드에서만 펼쳤으면 hiddenGroups는 빈 배열.
  infoLevel: InfoLevel.default(INFO_LEVEL_DEFAULT), hiddenGroups: z.array(InfoGroup).max(INFO_GROUPS.length).default([]),
}).strict();
export const JudgmentCreated = z.object({ judgmentId: z.string().uuid(), existing: z.boolean() }).strict();

export const Outcome = z.object({
  companyName: z.string(), ticker: z.string(), period: z.string(), startDate: z.string(), endDate: z.string(),
  returnPct: z.number(), benchReturnPct: z.number(), benchName: z.string(), pricePath: Index14, benchPath: Index14,
  sources: z.array(z.object({ kind: z.string(), label: z.string(), url: z.string().nullable() }).strict()),
}).strict();
export const Result = z.object({ relativePp: z.number(), state: ResultState, hit: z.boolean().nullable() }).strict();
export const QuizPublic = z.object({ quizId: z.string(), question: z.string(), options: z.array(z.string()).min(2).max(4) }).strict(); // 정답은 서버만
export const ConceptPublic = z.object({ id: z.string(), branch: ConceptBranch, title: z.string(), body: z.string(), linkSentence: z.string().nullable() }).strict();
export const ExplainLine = z.object({ kind: z.enum(["good", "change", "concept"]), label: LabelKind, text: z.string() }).strict();
export const Explain = z.object({ persona: z.string(), lines: z.array(ExplainLine).length(3), source: z.enum(["template", "llm"]) }).strict();
export const Reveal = z.object({
  judgmentId: z.string().uuid(), caseId: z.string().uuid(), version: z.number().int(),
  judgment: z.object({ direction: Direction, confidence: z.number().int(), keyEvidence: z.string(), risk: z.string().nullable(), recognized: z.boolean(), selfCheck: SelfCheck.nullable() }).strict(),
  outcome: Outcome, result: Result, keyPoints: z.array(z.string()).max(3),
  learning: z.object({ concept: ConceptPublic, quiz: QuizPublic, selfCheckEnabled: z.boolean() }).strict(),
  explain: Explain,
}).strict();
export type Reveal = z.infer<typeof Reveal>;
export const SelfCheckBody = z.object({ value: SelfCheck }).strict();

// ---------- 개념·복습 ----------
export const QuizBody = z.object({ quizId: z.string(), optionIndex: z.number().int().min(0).max(3), clientAttemptId: z.string().uuid(), via: z.enum(["reveal", "review", "concepts"]) }).strict();
/** answerIndex는 채점 뒤라 노출해도 된다(틀린 보기 표시용, 2026-10-04). */
export const QuizResult = z.object({ correct: z.boolean(), answerIndex: z.number().int().min(0).max(3), explanation: z.string(), level: z.number().int(), state: ConceptState, nextDueOn: z.string() }).strict();
/** order = 갈래 안 순서(콘텐츠 파일의 나열 순서, 1부터) — 개념 '길' 보기의 노드 순서. 잠금은 없다. */
export const ConceptListItem = ConceptPublic.extend({ state: ConceptState, level: z.number().int(), dueOn: z.string().nullable(), quiz: QuizPublic.nullable(), order: z.number().int().min(1) }).strict();
export const ConceptList = z.object({ concepts: z.array(ConceptListItem) }).strict();

// ---------- 일지 ----------
export const JournalItem = z.object({
  judgmentId: z.string().uuid(), createdAt: z.string(), localDate: z.string(),
  direction: Direction, confidence: z.number().int(), keyEvidence: z.string(), recognized: z.boolean(), selfCheck: SelfCheck.nullable(),
  // 공개 전 행: company/ticker/result/conceptTitle 은 null (결과 대기)
  revealed: z.boolean(), companyName: z.string().nullable(), ticker: z.string().nullable(), result: Result.nullable(),
  conceptTitle: z.string().nullable(),   // 그 카드의 1순위 학습 포인트 개념 제목(공개 뒤에만)
  sectorPublic: z.string(), sizeBucket: z.string(),
  infoLevel: InfoLevel,                   // 판단 때의 정보 수준(일지 행의 작은 표시: basic '핵심만', advanced '전부', custom '지정'; standard는 표시 없음)
}).strict();
export const CalendarDay = z.object({ date: z.string(), practiced: z.boolean(), due: z.boolean() }).strict();
export const Journal = z.object({
  items: z.array(JournalItem), count: z.number().int(),
  calendar: z.object({ month: z.string(), days: z.array(CalendarDay), practicedDays: z.number().int(), reviewsDue: z.number().int() }).strict(),
  stats: z.object({ locked: z.boolean(), unlockAt: z.number().int(), insights: z.array(z.string()).max(3), calibrationNote: z.string().nullable() }).strict(),
}).strict();

// ---------- AI ----------
export const QuestionBody = z.object({ caseId: z.string().uuid(), evidenceId: z.string(), confidence: z.number().int().min(1).max(5) }).strict();
export const QuestionLine = z.object({ label: LabelKind, text: z.string() }).strict();
export const Question = z.object({ templateType: z.number().int().min(1).max(6), lines: z.array(QuestionLine).max(2), source: z.enum(["template", "llm"]) }).strict();
export const ExplainBody = z.object({ judgmentId: z.string().uuid() }).strict();

// ---------- 신고·이벤트 ----------
/** clientReportId: 시간 초과 뒤 재전송이 신고를 둘 만들지 않게(unique (user_id, client_report_id), 재전송은 200·같은 reportId). */
export const ReportBody = z.object({ clientReportId: z.string().uuid(), caseId: z.string().uuid(), caseVersion: z.number().int(), category: ReportCategory, note: z.string().max(500).nullable() }).strict();
export const UiEvent = z.object({
  clientEventId: z.string().uuid(), event: z.string().max(40), caseId: z.string().uuid().nullable(), caseVersion: z.number().int().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(), ts: z.string(),
}).strict();
export const EventsBody = z.object({ events: z.array(UiEvent).max(50) }).strict();
/** 클라이언트가 보낼 수 있는 UI 이벤트 이름 (allow-list). 상태 변화(판단·공개·퀴즈·세션)는 서버가 기록한다. */
export const UI_EVENTS = ["card_view", "panel_view", "evidence_pick", "risk_pick", "confidence_pick", "recognize_toggle", "gate_blocked",
  "undo", "reveal_now", "report_open", "review_view", "concept_view", "stats_toggle", "calendar_month", "onboarding_done", "extra_card",
  // 2026-10-04 정보 수준·길 보기: 설정 시트 열기, 판 아래 '더 보기'(이 카드에서만 전부 펼침), 개념 탭 길/목록 전환
  "info_level_open", "panel_expand", "concept_path_view"] as const;

export const Health = z.object({ ok: z.boolean(), db: z.boolean(), version: z.string() }).strict();

/** 상대 성과(%p)는 표시·판정 모두 소수 첫째 자리로 반올림한 값을 쓴다(경계값에서 서버·클라이언트·카드 도구가 갈리지 않게). */
export function roundPp(relativePp: number): number {
  return Math.round(relativePp * 10) / 10;
}
/** 세 상태 경계(±1.0%p, 반올림 뒤)와 적중 정의 — 서버·클라이언트·카드 도구 공용 */
export function resultState(relativePp: number): z.infer<typeof ResultState> {
  const r = roundPp(relativePp);
  if (Math.abs(r) <= 1.0) return "even";
  return r > 0 ? "ahead" : "behind";
}
export function hitOf(state: z.infer<typeof ResultState>, direction: z.infer<typeof Direction>): boolean | null {
  if (state === "even") return null;
  return (state === "ahead") === (direction === "outperform");
}
/** 복습 간격(일): level 0→1일, 1→3일, 2→7일, 3+→21일 */
export const REVIEW_INTERVALS = [1, 3, 7, 21] as const;
export const SESSION_CARDS = 3;
export const SESSION_REVIEWS_MAX = 2;
export const STATS_UNLOCK_AT = 20;
export const SELF_CHECK_FROM_DIFFICULTY = 2;

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
  user: z.object({ id: z.string().uuid(), nickname: z.string(), onboarded: z.boolean(), tz: z.string() }).strict(),
}).strict();

// ---------- 오늘 ----------
export const TodayCard = z.object({ caseId: z.string().uuid(), version: z.number().int(), judgmentId: z.string().uuid().nullable(), revealed: z.boolean() }).strict();
export const ReviewItem = z.object({ conceptId: z.string(), title: z.string(), dueOn: z.string() }).strict();
export const Today = z.object({
  date: z.string(),                   // YYYY-MM-DD (서버 tz 기준)
  streak: z.number().int(),
  entry: z.object({ conceptsKnown: z.number().int(), conceptsTotal: z.number().int(), reviewsDue: z.number().int(), cardsLeft: z.number().int() }).strict(),
  cards: z.array(TodayCard).max(3), extraAllowed: z.boolean(), reviews: z.array(ReviewItem).max(2),
}).strict();
export type Today = z.infer<typeof Today>;

// ---------- 판단 ----------
export const Gesture = z.object({ via: z.enum(["swipe", "button", "key"]), dx: z.number().optional(), ms: z.number().optional(), v: z.number().optional(), flips: z.number().int().optional() }).strict();
export const JudgmentBody = z.object({
  caseId: z.string().uuid(), caseVersion: z.number().int(),
  keyEvidenceId: z.string(), riskId: z.string().nullable(), direction: Direction,
  confidence: z.number().int().min(1).max(5), recognized: z.boolean(),
  panelsViewed: z.array(PanelKind), gesture: Gesture.nullable(), isExtra: z.boolean().default(false),
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
export const QuizResult = z.object({ correct: z.boolean(), explanation: z.string(), level: z.number().int(), state: ConceptState, nextDueOn: z.string() }).strict();
export const ConceptListItem = ConceptPublic.extend({ state: ConceptState, level: z.number().int(), dueOn: z.string().nullable(), quiz: QuizPublic.nullable() }).strict();
export const ConceptList = z.object({ concepts: z.array(ConceptListItem) }).strict();

// ---------- 일지 ----------
export const JournalItem = z.object({
  judgmentId: z.string().uuid(), createdAt: z.string(), localDate: z.string(),
  direction: Direction, confidence: z.number().int(), keyEvidence: z.string(), recognized: z.boolean(), selfCheck: SelfCheck.nullable(),
  // 공개 전 행: company/ticker/result 는 null (결과 대기)
  revealed: z.boolean(), companyName: z.string().nullable(), ticker: z.string().nullable(), result: Result.nullable(),
  sectorPublic: z.string(), sizeBucket: z.string(),
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
export const ReportBody = z.object({ caseId: z.string().uuid(), caseVersion: z.number().int(), category: ReportCategory, note: z.string().max(500).nullable() }).strict();
export const UiEvent = z.object({
  clientEventId: z.string().uuid(), event: z.string().max(40), caseId: z.string().uuid().nullable(), caseVersion: z.number().int().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(), ts: z.string(),
}).strict();
export const EventsBody = z.object({ events: z.array(UiEvent).max(50) }).strict();
/** 클라이언트가 보낼 수 있는 UI 이벤트 이름 (allow-list). 상태 변화(판단·공개·퀴즈·세션)는 서버가 기록한다. */
export const UI_EVENTS = ["card_view", "panel_view", "evidence_pick", "risk_pick", "confidence_pick", "recognize_toggle", "gate_blocked",
  "undo", "reveal_now", "report_open", "review_view", "concept_view", "stats_toggle", "calendar_month", "onboarding_done", "extra_card"] as const;

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

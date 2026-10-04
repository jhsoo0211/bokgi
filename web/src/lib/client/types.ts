/**
 * 클라이언트가 쓰는 계약 타입. 값은 모두 src/shared/contract.ts(유일한 계약)에서 온다.
 */
import type { z } from "zod";
import type * as C from "@/shared/contract";

export type Direction = z.infer<typeof C.Direction>;
export type ResultState = z.infer<typeof C.ResultState>;
export type SelfCheck = z.infer<typeof C.SelfCheck>;
export type PanelKind = z.infer<typeof C.PanelKind>;
export type ConceptBranch = z.infer<typeof C.ConceptBranch>;
export type ConceptState = z.infer<typeof C.ConceptState>;
export type LabelKind = z.infer<typeof C.LabelKind>;
export type ReportCategory = z.infer<typeof C.ReportCategory>;

export type PublicCase = C.PublicCase;
export type EvidenceOption = z.infer<typeof C.EvidenceOption>;
export type RiskOption = z.infer<typeof C.RiskOption>;
export type Me = z.infer<typeof C.Me>;
export type InviteBody = z.infer<typeof C.InviteBody>;
export type TodayCard = z.infer<typeof C.TodayCard>;
export type ReviewItem = z.infer<typeof C.ReviewItem>;
export type Today = C.Today;
export type Gesture = z.infer<typeof C.Gesture>;
export type JudgmentBody = z.input<typeof C.JudgmentBody>;
export type JudgmentCreated = z.infer<typeof C.JudgmentCreated>;
export type Outcome = z.infer<typeof C.Outcome>;
export type Result = z.infer<typeof C.Result>;
export type QuizPublic = z.infer<typeof C.QuizPublic>;
export type ConceptPublic = z.infer<typeof C.ConceptPublic>;
export type ExplainLine = z.infer<typeof C.ExplainLine>;
export type Explain = z.infer<typeof C.Explain>;
export type Reveal = C.Reveal;
export type QuizBody = z.infer<typeof C.QuizBody>;
/** answerIndex는 채점 뒤의 정답 위치(계약 2026-10-04) — 틀렸을 때 정답 보기를 표시한다 */
export type QuizResult = z.infer<typeof C.QuizResult>;
export type ConceptListItem = z.infer<typeof C.ConceptListItem>;
export type ConceptList = z.infer<typeof C.ConceptList>;
export type JournalItem = z.infer<typeof C.JournalItem>;
export type CalendarDay = z.infer<typeof C.CalendarDay>;
export type Journal = z.infer<typeof C.Journal>;
export type QuestionBody = z.infer<typeof C.QuestionBody>;
export type Question = z.infer<typeof C.Question>;
export type ReportBody = z.infer<typeof C.ReportBody>;
export type UiEvent = z.infer<typeof C.UiEvent>;
export type EventsBody = z.infer<typeof C.EventsBody>;
export type UiEventName = (typeof C.UI_EVENTS)[number];

/* 정보 수준(D16) — 세 판의 깊이. 서버는 PublicCase를 그대로 주고 클라이언트가 묶음 단위로 가린다 */
export type InfoLevel = C.InfoLevel;
export type InfoGroup = C.InfoGroup;
export type PanelPrefs = C.PanelPrefs;
export type UndoSeconds = C.UndoSeconds;
export type PrefsBody = z.input<typeof C.PrefsBody>;
/** 오늘 공개한 카드에서 만난 개념(오늘 끝 요약) — 서버가 센다 */
export type ConceptToday = z.infer<typeof C.ConceptToday>;
/** 사용자 설정 묶음(Me.user에서 뽑은 것): 정보 수준·묶음·되돌리기 시간 */
export type Prefs = { infoLevel: InfoLevel; panelPrefs: PanelPrefs; undoSeconds: UndoSeconds };

export type GestureMeta = { via: "swipe" | "button" | "key"; dx: number; ms: number; v: number; flips: number };

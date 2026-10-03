/**
 * 클라이언트가 쓰는 계약 타입. 값은 모두 src/shared/contract.ts(유일한 계약)에서 온다.
 * `X`가 붙은 타입은 계약에 없는 선택(optional) 필드를 얹은 것이다 — 서버가 보내지 않아도 화면이 동작한다.
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

/** 선택: 채점 뒤 정답 위치. 없으면 explanation('아니에요. 정답: ‘…’.')에서 정답 보기를 찾는다 */
export type QuizResultX = QuizResult & { answerIndex?: number };

export type GestureMeta = { via: "swipe" | "button" | "key"; dx: number; ms: number; v: number; flips: number };

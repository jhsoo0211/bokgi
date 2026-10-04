/**
 * 한 번 연 앱 안에서만 유지하는 상태(탭을 오가도 남는다).
 * - draft: 카드별로 고르던 근거·위험·확신도·아는 회사·보던 판 (다른 탭에 다녀와도 지워지지 않는다 — ecc 남은 것).
 *   같은 탭에서 새로고침해도 남게 sessionStorage에도 둔다(탭을 닫으면 사라진다, 판단 전 고른 것만 — 결과 자료 없음).
 *   열쇠는 카드 id@버전이고, 읽을 때 카드 보기와 맞지 않는 값은 버린다(sanitizeDraft).
 * - viewed: card_view·review_view를 한 번만 기록
 * - inflight: 보내는 중인 판단. 화면을 새로 불러오기 전에 기다린다(탭 이탈로 보낸 판단이 '결과 대기'로 바로 보이게)
 * - 오늘 되짚은 개념·푼 복습 수·한 장 더 수: '오늘은 여기까지' 요약, '복습 i/n'·'오늘 3/3 +k' 머리줄용(계약에 없어 기기에 남긴다)
 */
import { SESSION_REVIEWS_MAX } from "@/shared/contract";
import type { PanelKind } from "./types";
import { DEFAULT_PANEL, PANELS } from "./format";

export type Draft = {
  evidenceId: string | null;
  riskId: string | null;
  confidence: number | null;      // 기본값 없음
  recognized: boolean;
  panel: PanelKind;
  panelsViewed: PanelKind[];
};

export const freshDraft = (): Draft => ({ evidenceId: null, riskId: null, confidence: null, recognized: false, panel: DEFAULT_PANEL, panelsViewed: [DEFAULT_PANEL] });

const DRAFT_KEY = "bokgi.drafts.v1";
const drafts = new Map<string, Draft>();
function readStored(): Record<string, Draft> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    const o: unknown = raw ? JSON.parse(raw) : null;
    return o && typeof o === "object" ? (o as Record<string, Draft>) : {};
  } catch { return {}; }
}
function writeStored(all: Record<string, Draft>): void {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(all)); } catch { /* 저장소를 못 쓰면 메모리로만 */ }
}
/** draft 열쇠: 카드가 새 버전이 되면 옛 고른 것을 쓰지 않는다 */
export const draftKey = (caseId: string, version: number): string => `${caseId}@${version}`;
export const getDraft = (key: string): Draft => drafts.get(key) ?? readStored()[key] ?? freshDraft();
export const saveDraft = (key: string, d: Draft): void => {
  drafts.set(key, d);
  const all = readStored();
  all[key] = d;
  writeStored(all);
};
export const dropDraft = (key: string): void => {
  drafts.delete(key);
  const all = readStored();
  if (key in all) { delete all[key]; writeStored(all); }
};
/** 저장돼 있던 draft를 지금 카드의 보기에 맞춘다(없는 근거·위험 id, 범위 밖 확신도, 모르는 판은 버린다) */
export function sanitizeDraft(d: Draft, evidenceIds: readonly string[], riskIds: readonly string[]): Draft {
  const kinds: readonly string[] = PANELS.map(([k]) => k);
  const isPanel = (k: unknown): k is PanelKind => typeof k === "string" && kinds.includes(k);
  const panel = isPanel(d.panel) ? d.panel : DEFAULT_PANEL;
  const seen = Array.isArray(d.panelsViewed) ? d.panelsViewed.filter(isPanel) : [];
  return {
    evidenceId: d.evidenceId && evidenceIds.includes(d.evidenceId) ? d.evidenceId : null,
    riskId: d.riskId && riskIds.includes(d.riskId) ? d.riskId : null,
    confidence: typeof d.confidence === "number" && Number.isInteger(d.confidence) && d.confidence >= 1 && d.confidence <= 5 ? d.confidence : null,
    recognized: d.recognized === true,
    panel,
    panelsViewed: seen.length ? [...new Set(seen)] : [panel],
  };
}

const viewed = new Set<string>();
/** 처음이면 true를 돌려주고 표시한다 */
export const firstView = (key: string): boolean => {
  if (viewed.has(key)) return false;
  viewed.add(key);
  return true;
};

let inflight: Promise<unknown> = Promise.resolve();
export function track<T>(p: Promise<T>): Promise<T> {
  inflight = Promise.allSettled([inflight, p]);
  return p;
}
export const settled = (): Promise<void> => inflight.then(() => undefined);

/* ---------- 오늘 기록 (기기 현지 날짜별) ---------- */
type DayLog = { date: string; concepts: string[]; reviewsDone: number; extras: string[] };
const DAY_KEY = "bokgi.today.v1";

function readDay(date: string): DayLog {
  try {
    const raw = localStorage.getItem(DAY_KEY);
    const d = raw ? (JSON.parse(raw) as DayLog) : null;
    if (d && d.date === date && Array.isArray(d.concepts)) return { ...d, extras: Array.isArray(d.extras) ? d.extras : [] };
  } catch { /* 없거나 깨졌으면 새로 */ }
  return { date, concepts: [], reviewsDone: 0, extras: [] };
}
function writeDay(d: DayLog): void {
  try { localStorage.setItem(DAY_KEY, JSON.stringify(d)); } catch { /* 저장소를 못 쓰면 요약만 빈다 */ }
}
export const dayLog = (date: string): DayLog => readDay(date);
export function markConceptSeen(date: string, conceptId: string): void {
  const d = readDay(date);
  if (!d.concepts.includes(conceptId)) { d.concepts.push(conceptId); writeDay(d); }
}
/** 한 장 더로 오늘 판단한 카드(머리줄 '오늘 3/3 +k'용 — 오늘 응답에는 세트 카드만 있다) */
export function markExtraJudged(date: string, caseId: string): void {
  const d = readDay(date);
  if (!d.extras.includes(caseId)) { d.extras.push(caseId); writeDay(d); }
}
export function markReviewDone(date: string): void {
  const d = readDay(date);
  d.reviewsDone += 1;
  writeDay(d);
}
/** 오늘 세션의 복습 칸(머리줄 진행 바): 푼 수와 그날 칸 수(하루 2개까지). reviewsLeft = 오늘 응답의 reviews 길이 */
export function sessionReviews(date: string, reviewsLeft: number): { done: number; total: number } {
  const done = Math.min(SESSION_REVIEWS_MAX, readDay(date).reviewsDone);
  return { done, total: Math.min(SESSION_REVIEWS_MAX, done + Math.max(0, reviewsLeft)) };
}

/* ---------- 첫 실행 안내 본 표시 (onboarding_done 이벤트 기록이 늦거나 실패해도 다시 띄우지 않게) ---------- */
const onboardKey = (userId: string) => `bokgi.onboarded.${userId}`;
export function localOnboarded(userId: string): boolean {
  try { return localStorage.getItem(onboardKey(userId)) === "1"; } catch { return false; }
}
export function setLocalOnboarded(userId: string): void {
  try { localStorage.setItem(onboardKey(userId), "1"); } catch { /* 무시 */ }
}

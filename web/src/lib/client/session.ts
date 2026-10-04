/**
 * 한 번 연 앱 안에서만 유지하는 상태(탭을 오가도 남는다).
 * - draft: 카드별로 고르던 근거·위험·확신도·아는 회사·보던 판 (다른 탭에 다녀와도 지워지지 않는다 — ecc 남은 것).
 *   같은 탭에서 새로고침해도 남게 sessionStorage에도 둔다(탭을 닫으면 사라진다, 판단 전 고른 것만 — 결과 자료 없음).
 *   열쇠는 카드 id@버전이고, 읽을 때 카드 보기와 맞지 않는 값은 버린다(sanitizeDraft).
 *   view = 그 카드에서 쓰는 정보 수준. 손대기 전에는 비어 있어(null) 설정을 그대로 따르고, 처음 고르는 순간 그때의 설정으로 고정된다
 *   — 판단 중에는 정보가 늘거나 줄지 않는다(02 §7.1, 바뀐 설정은 다음 카드부터). expanded = '더 보기'로 이 카드에서만 전부 펼침.
 * - viewed: card_view·review_view를 한 번만 기록
 * - inflight: 보내는 중인 판단. 화면을 새로 불러오기 전에 기다린다(탭 이탈로 보낸 판단이 '결과 대기'로 바로 보이게)
 * - 오늘 푼 복습 수: 머리줄 '복습 i/n'용. 계약 Today에 이 수가 없어(2026-10-04) 서버 자료로 정확히 셀 수 있을 때는 그것을,
 *   아니면 이 탭에서 푼 수(메모리, 새로고침하면 0)를 쓴다. 오늘 되짚은 개념·한 장 더 수는 서버(Today.conceptsToday·extraJudged)가 준다.
 */
import { INFO_GROUPS, InfoLevel, SESSION_REVIEWS_MAX } from "@/shared/contract";
import type { ConceptListItem, PanelKind, PanelPrefs, Today } from "./types";
import { DEFAULT_PANEL, PANELS } from "./format";

/** 한 카드에서 쓰는 정보 수준(그 카드를 처음 고를 때의 설정) */
export type CardView = { level: InfoLevel; prefs: PanelPrefs };

export type Draft = {
  evidenceId: string | null;
  riskId: string | null;
  confidence: number | null;      // 기본값 없음
  recognized: boolean;
  panel: PanelKind;
  panelsViewed: PanelKind[];
  view: CardView | null;          // null = 아직 손대지 않음(설정을 따른다)
  expanded: boolean;              // '더 보기' — 이 카드에서만 묶음 전부
};

export const freshDraft = (): Draft => ({
  evidenceId: null, riskId: null, confidence: null, recognized: false, panel: DEFAULT_PANEL, panelsViewed: [DEFAULT_PANEL], view: null, expanded: false,
});

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

function sanitizeView(v: unknown): CardView | null {
  if (!v || typeof v !== "object") return null;
  const { level, prefs } = v as { level?: unknown; prefs?: unknown };
  if (!InfoLevel.safeParse(level).success || !prefs || typeof prefs !== "object") return null;
  const p = prefs as Record<string, unknown>;
  if (!INFO_GROUPS.every((g) => typeof p[g] === "boolean")) return null;
  return { level: level as InfoLevel, prefs: Object.fromEntries(INFO_GROUPS.map((g) => [g, p[g] === true])) as PanelPrefs };
}

/** 저장돼 있던 draft를 지금 카드의 보기에 맞춘다(없는 근거·위험 id, 범위 밖 확신도, 모르는 판·깨진 정보 수준은 버린다) */
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
    view: sanitizeView(d.view),
    expanded: d.expanded === true,
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

/* ---------- 오늘 푼 복습 수(머리줄 '복습 i/n') ---------- */
const reviewsAnswered = new Map<string, number>();   // 날짜 → 이 탭에서 푼 복습 수(메모리만, 기기에 남기지 않는다)
export function noteReviewAnswered(date: string): void {
  reviewsAnswered.set(date, (reviewsAnswered.get(date) ?? 0) + 1);
}
/**
 * 오늘 푼 복습 수. 서버는 reviews를 (하루 2개 − 오늘 푼 수)개까지만 주므로, 개념 목록에서 기한이 된 개념이 그보다 많으면
 * 오늘 푼 수가 정확히 나온다(새로고침해도 맞다). 아니면 이 탭에서 푼 수로 센다.
 */
export function reviewsDoneToday(today: Today, concepts?: readonly ConceptListItem[]): number {
  const mem = Math.min(SESSION_REVIEWS_MAX, reviewsAnswered.get(today.date) ?? 0);
  if (!concepts) return mem;
  const due = concepts.filter((c) => c.dueOn !== null && c.dueOn <= today.date).length;
  return due > today.reviews.length ? SESSION_REVIEWS_MAX - Math.min(SESSION_REVIEWS_MAX, today.reviews.length) : mem;
}
/** 오늘 세션의 복습 칸(머리줄 진행 바): 푼 수와 그날 칸 수(하루 2개까지) */
export function sessionReviews(today: Today, concepts?: readonly ConceptListItem[]): { done: number; total: number } {
  const done = reviewsDoneToday(today, concepts);
  return { done, total: Math.min(SESSION_REVIEWS_MAX, done + Math.max(0, today.reviews.length)) };
}

/* ---------- 첫 실행 안내 본 표시 (onboarding_done 이벤트 기록이 늦거나 실패해도 다시 띄우지 않게) ---------- */
const onboardKey = (userId: string) => `bokgi.onboarded.${userId}`;
export function localOnboarded(userId: string): boolean {
  try { return localStorage.getItem(onboardKey(userId)) === "1"; } catch { return false; }
}
export function setLocalOnboarded(userId: string): void {
  try { localStorage.setItem(onboardKey(userId), "1"); } catch { /* 무시 */ }
}

/* ---------- 개념 탭 보기(길/목록) — 기기마다 기억하는 편의 설정 ---------- */
export type ConceptView = "path" | "list";
const CONCEPT_VIEW_KEY = "bokgi.concepts.view";
export function storedConceptView(): ConceptView {
  try { return localStorage.getItem(CONCEPT_VIEW_KEY) === "list" ? "list" : "path"; } catch { return "path"; }
}
export function storeConceptView(v: ConceptView): void {
  try { localStorage.setItem(CONCEPT_VIEW_KEY, v); } catch { /* 무시 */ }
}

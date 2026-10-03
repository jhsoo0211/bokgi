/**
 * 한 번 연 앱 안에서만 유지하는 상태(탭을 오가도 남는다).
 * - draft: 카드별로 고르던 근거·위험·확신도·아는 회사·보던 판 (다른 탭에 다녀와도 지워지지 않는다 — ecc 남은 것)
 * - viewed: card_view·review_view를 한 번만 기록
 * - inflight: 보내는 중인 판단. 화면을 새로 불러오기 전에 기다린다(탭 이탈로 보낸 판단이 '결과 대기'로 바로 보이게)
 * - 오늘 되짚은 개념·푼 복습 수·한 장 더 수: '오늘은 여기까지' 요약, '복습 i/n'·'오늘 3/3 +k' 머리줄용(계약에 없어 기기에 남긴다)
 */
import type { PanelKind } from "./types";
import { DEFAULT_PANEL } from "./format";

export type Draft = {
  evidenceId: string | null;
  riskId: string | null;
  confidence: number | null;      // 기본값 없음
  recognized: boolean;
  panel: PanelKind;
  panelsViewed: PanelKind[];
};

export const freshDraft = (): Draft => ({ evidenceId: null, riskId: null, confidence: null, recognized: false, panel: DEFAULT_PANEL, panelsViewed: [DEFAULT_PANEL] });

const drafts = new Map<string, Draft>();
export const getDraft = (caseId: string): Draft => drafts.get(caseId) ?? freshDraft();
export const saveDraft = (caseId: string, d: Draft): void => { drafts.set(caseId, d); };
export const dropDraft = (caseId: string): void => { drafts.delete(caseId); };

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

/* ---------- 첫 실행 안내 본 표시 (onboarding_done 이벤트 기록이 늦거나 실패해도 다시 띄우지 않게) ---------- */
const onboardKey = (userId: string) => `bokgi.onboarded.${userId}`;
export function localOnboarded(userId: string): boolean {
  try { return localStorage.getItem(onboardKey(userId)) === "1"; } catch { return false; }
}
export function setLocalOnboarded(userId: string): void {
  try { localStorage.setItem(onboardKey(userId), "1"); } catch { /* 무시 */ }
}

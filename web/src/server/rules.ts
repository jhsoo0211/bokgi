import "server-only";
import {
  INFO_GROUPS,
  INFO_PRESETS,
  PanelPrefs as PanelPrefsSchema,
  REVIEW_INTERVALS,
  SESSION_CARDS,
  UNDO_SECONDS_DEFAULT,
  UndoSeconds as UndoSecondsSchema,
  hitOf,
  levelForPrefs,
  presetPrefs,
  resultState,
  roundPp,
  type ConceptState as ConceptStateSchema,
  type Direction as DirectionSchema,
  type InfoGroup,
  type InfoLevel,
  type PanelPrefs,
  type ResultState as ResultStateSchema,
  type UndoSeconds,
} from "@/shared/contract";
import type { z } from "zod";
import { evidenceKind, josa } from "@/lib/server/ko";
import { addDays, localDate } from "@/lib/server/time";

type Direction = z.infer<typeof DirectionSchema>;
type ResultState = z.infer<typeof ResultStateSchema>;
type ConceptState = z.infer<typeof ConceptStateSchema>;

/**
 * 순수 규칙(시험 대상). 프로토타입 state.js의 동작을 서버로 옮긴 것.
 * 입출력은 날짜 문자열·숫자뿐이고 DB를 모른다.
 */

// ---------- 결과 세 상태 ----------

/** 시장 대비 %p를 계약의 roundPp(소수 첫째 자리)로 반올림 → 세 상태·적중. 비슷함(±1.0%p)은 hit=null (ADR-0002). */
export function scoreOutcome(returnPct: number, benchReturnPct: number, direction: Direction) {
  const rel = roundPp(returnPct - benchReturnPct);
  const relativePp = Object.is(rel, -0) ? 0 : rel;
  const state = resultState(relativePp);
  return { relativePp, state, hit: hitOf(state, direction) };
}

// ---------- 복습 일정 ----------

export interface ReviewPrev {
  level: number;
  /** null이면 아직 복습 일정이 없다(새 개념) */
  dueOn: string | null;
}

/**
 * 맞히면 level+1(새 개념은 0부터), 틀리면 0. 다음 복습일 = 오늘 + REVIEW_INTERVALS[level].
 * 아직 복습일이 안 된 개념을 다시 맞히면 간격을 늘리지 않는다(같은 날 반복으로 간격이 부풀지 않게).
 */
export function nextReview(prev: ReviewPrev | null, correct: boolean, today: string): { level: number; dueOn: string; kept: boolean } {
  if (correct && prev && prev.dueOn && prev.dueOn > today) return { level: prev.level, dueOn: prev.dueOn, kept: true };
  const prevLevel = prev && prev.dueOn ? prev.level : -1;
  const level = correct ? Math.min(prevLevel + 1, REVIEW_INTERVALS.length - 1) : 0;
  return { level, dueOn: addDays(today, REVIEW_INTERVALS[level]), kept: false };
}

/** 숙련도: 신규 → 학습 중 → 이해, 틀리면 복습 필요. 2번 이상 풀고 정답 비율 3/4 이상이면 이해. */
export function nextConceptState(prev: { correct: number; total: number }, correct: boolean): { state: ConceptState; correct: number; total: number } {
  const total = prev.total + 1;
  const c = prev.correct + (correct ? 1 : 0);
  const state: ConceptState = total >= 2 && c * 4 >= total * 3 ? "known" : correct ? "learning" : "review";
  return { state, correct: c, total };
}

// ---------- 세션·스트릭 ----------

/** 그날의 세트: 미판단 live 카드 중 deck_order 순으로 n장(결과 균형은 제작 도구가 덱 순서로 굳혔다). */
export function pickSessionCases(orderedLiveIds: string[], judged: ReadonlySet<string>, n: number = SESSION_CARDS): string[] {
  return orderedLiveIds.filter((id) => !judged.has(id)).slice(0, n);
}

/** 판단을 1장 이상 남긴 날이 연속된 수. 오늘 아직 안 했으면 어제까지로 센다. 정답 여부와 무관. */
export function streakFrom(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  let d = set.has(today) ? today : addDays(today, -1);
  let k = 0;
  while (set.has(d)) {
    k++;
    d = addDays(d, -1);
  }
  return k;
}

/** 그날 '한 장 더'로 판단한 수. localDate는 판단의 local_date(만들 때 사용자 tz로 정한 날짜). */
export function extraJudgedOn(rows: Iterable<{ isExtra: boolean; localDate: string }>, day: string): number {
  let n = 0;
  for (const r of rows) if (r.isExtra && r.localDate === day) n++;
  return n;
}

/**
 * 그날(사용자 tz) 공개한 판단만, 공개한 순서로. 공개 전 판단은 빠진다 — 오늘 만난 개념(conceptsToday)은
 * 학습 포인트(공개 뒤 자료)라서 공개하지 않은 카드의 것을 미리 내보내면 안 된다.
 */
export function revealedOn<T extends { revealedAt: Date | null }>(rows: readonly T[], day: string, tz: string): (T & { revealedAt: Date })[] {
  return rows
    .filter((r): r is T & { revealedAt: Date } => r.revealedAt !== null && localDate(r.revealedAt, tz) === day)
    .sort((a, b) => a.revealedAt.getTime() - b.revealedAt.getTime());
}

/** 처음 나온 것만 남긴다(순서 유지) */
export function uniqueBy<T>(rows: readonly T[], key: (r: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = key(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- 정보 수준 (D16) ----------

/**
 * PUT /api/me/prefs 정규화(계약 PrefsBody). 저장 모양은 users.info_level + panel_prefs(NULL = 그 수준의 프리셋).
 *  - custom이 아니면 보낸 panelPrefs는 무시하고 그 수준 + NULL
 *  - custom이면 panelPrefs가 필요하다(없으면 null → 호출자가 422)
 *  - custom인데 토글이 프리셋과 같으면 그 수준 + NULL로 되돌린다(levelForPrefs), 다르면 custom + 토글
 */
export function normalizePrefs(infoLevel: InfoLevel, panelPrefs: PanelPrefs | undefined): { infoLevel: InfoLevel; panelPrefs: PanelPrefs | null } | null {
  if (infoLevel !== "custom") return { infoLevel, panelPrefs: null };
  if (!panelPrefs) return null;
  const level = levelForPrefs(panelPrefs);
  return level === "custom" ? { infoLevel: "custom", panelPrefs: { ...panelPrefs } } : { infoLevel: level, panelPrefs: null };
}

/**
 * DB의 panel_prefs(jsonb) → 묶음 토글. 모르는 키는 버리고, 없는 묶음(계약에 묶음이 새로 생긴 경우)은 기본 수준(중급) 값으로 채운다.
 * 객체가 아니면 null.
 */
export function storedPrefs(raw: unknown): PanelPrefs | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return PanelPrefsSchema.parse(Object.fromEntries(INFO_GROUPS.map((g) => [g, typeof r[g] === "boolean" ? r[g] : INFO_PRESETS.standard[g]])));
}

/** 응답(Me.user.panelPrefs)에 쓸 토글: custom이면 저장된 토글, 아니면 그 수준의 프리셋 값. */
export function effectivePrefs(level: InfoLevel, raw: unknown): PanelPrefs {
  return (level === "custom" ? storedPrefs(raw) : null) ?? presetPrefs(level);
}

/** 판단 때 숨겨져 있던 묶음을 계약 순서로, 겹치지 않게(모르는 이름은 버린다 — 계약 검사를 지난 뒤라 실제로는 없다). */
export function canonicalGroups(groups: readonly string[]): InfoGroup[] {
  const set = new Set(groups);
  return INFO_GROUPS.filter((g) => set.has(g));
}

/** DB의 undo_seconds(numeric 3,1) → 계약 UndoSeconds(2.5·5·10). CHECK가 있어 다른 값은 없지만 있으면 기본값. */
export function undoSecondsOf(v: number): UndoSeconds {
  const parsed = UndoSecondsSchema.safeParse(v);
  return parsed.success ? parsed.data : UNDO_SECONDS_DEFAULT;
}

// ---------- 통계·인사이트 (횟수만, 퍼센트 없음) ----------

export interface DoneJudgment {
  confidence: number;
  keyEvidence: string;
  recognized: boolean;
  state: ResultState;
  hit: boolean | null;
}

export type InsightMaterial =
  | { kind: "confidence"; level: number; n: number; k: number }
  | { kind: "evidence"; label: string; n: number; k: number }
  | { kind: "recognized"; n: number; k: number; m: number; j: number };

/** 같은 조건의 판단이 이 수 미만이면 그 인사이트는 뺀다 */
export const MIN_INSIGHT = 3;

/**
 * 인사이트 재료(state.js insights 이식).
 * confidence: 가장 자주 고른 확신도(같으면 높은 쪽)에서 시장보다 앞선 횟수
 * evidence:   뒤짐이 가장 많은 근거 종류(같으면 판단 수가 적은 쪽)의 뒤짐 횟수. 뒤짐이 없으면 뺀다
 * recognized: 아는/모르는 회사 판단의 앞섬 횟수(두 쪽 모두 MIN_INSIGHT번 이상일 때만)
 */
export function insights(done: DoneJudgment[]): InsightMaterial[] {
  const out: InsightMaterial[] = [];
  const count = (js: DoneJudgment[], state: ResultState) => js.filter((j) => j.state === state).length;

  const byConf = new Map<number, DoneJudgment[]>();
  for (const j of done) if (j.confidence) byConf.set(j.confidence, [...(byConf.get(j.confidence) ?? []), j]);
  const conf = [...byConf.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0];
  if (conf && conf[1].length >= MIN_INSIGHT) out.push({ kind: "confidence", level: conf[0], n: conf[1].length, k: count(conf[1], "ahead") });

  const byKind = new Map<string, DoneJudgment[]>();
  for (const j of done) {
    const k = evidenceKind(j.keyEvidence);
    byKind.set(k, [...(byKind.get(k) ?? []), j]);
  }
  const ev = [...byKind.entries()]
    .map(([label, js]) => ({ label, n: js.length, k: count(js, "behind") }))
    .filter((e) => e.n >= MIN_INSIGHT && e.k > 0)
    .sort((a, b) => b.k - a.k || a.n - b.n || a.label.localeCompare(b.label, "ko"))[0];
  if (ev) out.push({ kind: "evidence", ...ev });

  const known = done.filter((j) => j.recognized);
  const unknown = done.filter((j) => !j.recognized);
  if (known.length >= MIN_INSIGHT && unknown.length >= MIN_INSIGHT)
    out.push({ kind: "recognized", n: known.length, k: count(known, "ahead"), m: unknown.length, j: count(unknown, "ahead") });
  return out;
}

/** 인사이트 한 문장(app.js insightText 이식). 비율·적중률 숫자는 쓰지 않는다. */
export function insightText(it: InsightMaterial): string {
  let s: string;
  if (it.kind === "confidence") s = `확신도 ${it.level}${josa(String(it.level), "을", "를")} 준 판단 ${it.n}번 중 시장보다 앞선 것은 ${it.k}번이었어요.`;
  else if (it.kind === "evidence") s = `'${it.label}'${josa(it.label, "을", "를")} 근거로 한 판단 ${it.n}번 중 ${it.k}번이 시장보다 뒤졌어요.`;
  else s = `아는 회사 판단 ${it.n}번과 모르는 회사 판단 ${it.m}번의 앞섬 횟수는 ${it.k}번·${it.j}번이었어요.`;
  return s.replace(/[%\uFF05]/g, ""); // 퍼센트 기호는 어떤 경로로도 나가지 않는다
}

export type Calibration = "few" | "over" | "under" | "fit";

export const CALIBRATION_TEXT: Record<Calibration, string> = {
  few: "비슷함을 뺀 판단이 10장 넘게 쌓이면 확신도 보정을 글로 알려 드려요.",
  over: "확신도를 높게 고른 만큼 결과가 판단과 같은 방향이지는 않았어요 — 확신이 근거보다 앞서는 편이에요.",
  under: "고른 확신도에 비해 결과가 판단과 같은 방향인 때가 많았어요 — 확신도를 낮게 고르는 편이에요.",
  fit: "고른 확신도와 결과가 대체로 어울려요.",
};

/** 확신도 보정(글로만): 비슷함을 뺀 판단 10장 이상에서 확신도(1→50% … 5→90%) 평균과 같은 방향 비율의 차이. */
export function calibration(done: DoneJudgment[]): Calibration {
  const decided = done.filter((j) => typeof j.hit === "boolean");
  if (decided.length < 10) return "few";
  const expected = decided.reduce((s, j) => s + 0.5 + (j.confidence - 1) * 0.1, 0) / decided.length;
  const actual = decided.filter((j) => j.hit).length / decided.length;
  return expected - actual > 0.1 ? "over" : expected - actual < -0.1 ? "under" : "fit";
}

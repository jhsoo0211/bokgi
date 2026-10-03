import "server-only";
import { numericTokens } from "./numberGuard";

/**
 * 누수 필터(규칙 단계). 판단 전 응답(질문자)에 판단 시점 이후 정보가 섞였는지 본다(기획안 §10.1, 05 §5).
 *  - 회사명·티커·제품명 등 낱말(사전은 server-only 모듈이 case_outcomes·case_internal로 런타임에 만든다)
 *  - 기준일(판단 시점) 이후의 절대 날짜 표현(YYYY-MM-DD, YYYY.MM, YYYY년 M월, YYYY Q1, YYYY년 1분기, 연도만)
 *  - 판단일 이후를 가리키는 상대 표현(D+n, 판단일 이후)
 *  - 결과 수치(공개 자료에 있는 숫자는 제외)
 * 하나라도 걸리면 호출자는 응답을 버리고 안전 문장으로 바꾼다. 판정 호출(LLM 1회)은 베타에서 쉰다(05 §11).
 */
export interface LeakDictionary {
  companies: string[];
  tickers: string[];
  terms: string[];
  /** 결과 수치(절댓값) */
  outcomeNumbers: number[];
  /** 판단 전 공개 자료의 숫자(절댓값) — 결과 수치와 겹쳐도 누수로 보지 않는다 */
  publicNumbers: number[];
  /** 'YYYY-MM-DD' (판단 시점). 이보다 뒤의 날짜 표현은 누수 */
  cutoff: string | null;
}

export type LeakKind = "company" | "ticker" | "term" | "date_after_cutoff" | "relative_future" | "outcome_number";
export interface LeakHit {
  kind: LeakKind;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compact = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, "");

function containsName(text: string, name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (/^[A-Za-z0-9.&\- ]+$/.test(n) && n.replace(/[^A-Za-z0-9]/g, "").length <= 3) {
    // 짧은 라틴 이름은 낱말 경계로(대소문자 무시)
    return new RegExp(`(?<![A-Za-z0-9])${escapeRe(n)}(?![A-Za-z0-9])`, "i").test(text);
  }
  return compact(text).includes(compact(n));
}

function containsTicker(text: string, ticker: string): boolean {
  const t = ticker.trim();
  if (!t) return false;
  return new RegExp(`(?<![A-Za-z0-9])${escapeRe(t)}(?![A-Za-z0-9])`).test(text);
}

interface Ymd {
  y: number;
  m: number | null;
  d: number | null;
}

function after(date: Ymd, cutoff: Ymd): boolean {
  if (date.y !== cutoff.y) return date.y > cutoff.y;
  if (date.m === null || cutoff.m === null) return false;
  if (date.m !== cutoff.m) return date.m > cutoff.m;
  if (date.d === null || cutoff.d === null) return false;
  return date.d > cutoff.d;
}

function parseCutoff(c: string): Ymd {
  const [y, m, d] = c.split("-").map(Number);
  return { y, m, d };
}

const validMonth = (m: number | null) => m === null || (m >= 1 && m <= 12);

/** 텍스트 속 절대 날짜 표현들 */
export function findDates(text: string): Ymd[] {
  const out: Ymd[] = [];
  const toN = (s: string | undefined) => (s === undefined ? null : Number(s));
  for (const m of text.matchAll(/(?<![\d.])((?:19|20)\d{2})\s*[-./]\s*(\d{1,2})(?:\s*[-./]\s*(\d{1,2}))?(?![\d])/g)) {
    const d: Ymd = { y: Number(m[1]), m: toN(m[2]), d: toN(m[3]) };
    if (validMonth(d.m)) out.push(d);
  }
  for (const m of text.matchAll(/(?<!\d)((?:19|20)\d{2})\s*년(?:\s*(\d{1,2})\s*월)?(?:\s*(\d{1,2})\s*일)?/g)) {
    out.push({ y: Number(m[1]), m: toN(m[2]), d: toN(m[3]) });
  }
  for (const m of text.matchAll(/(?<!\d)((?:19|20)\d{2})\s*년?\s*(?:[Qq]\s*([1-4])|([1-4])\s*분기)/g)) {
    const q = Number(m[2] ?? m[3]);
    out.push({ y: Number(m[1]), m: q * 3 - 2, d: null });
  }
  for (const m of text.matchAll(/[Qq]([1-4])\s*['’]?\s*((?:19|20)\d{2})(?!\d)/g)) {
    out.push({ y: Number(m[2]), m: Number(m[1]) * 3 - 2, d: null });
  }
  // 단위 없는 연도(예: "2024에는") — 소수·퍼센트의 일부가 아닌 4자리
  for (const m of text.matchAll(/(?<![\d.,])((?:19|20)\d{2})(?![\d.,%])/g)) {
    out.push({ y: Number(m[1]), m: null, d: null });
  }
  return out;
}

export function findLeaks(text: string, dict: LeakDictionary): LeakHit[] {
  const hits: LeakHit[] = [];
  const add = (kind: LeakKind) => {
    if (!hits.some((h) => h.kind === kind)) hits.push({ kind });
  };
  for (const c of dict.companies) if (containsName(text, c)) add("company");
  for (const t of dict.tickers) if (containsTicker(text, t)) add("ticker");
  for (const t of dict.terms) if (containsName(text, t)) add("term");

  if (dict.cutoff) {
    const cutoff = parseCutoff(dict.cutoff);
    if (findDates(text).some((d) => after(d, cutoff))) add("date_after_cutoff");
  }
  if (/D\s*\+\s*\d+/i.test(text) || /판단\s*(?:일|시점)\s*(?:이후|뒤|다음)/.test(text)) add("relative_future");

  const isPublic = (n: number) => dict.publicNumbers.some((p) => Math.abs(p - n) < 0.05);
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (!Number.isFinite(n) || isPublic(n)) continue;
    const unit = /^\s?(?:%|\uFF05|퍼센트|%p)/.test(text.slice((m.index ?? 0) + m[0].length));
    const significant = m[0].includes(".") || unit || n >= 10;
    if (!significant) continue;
    if (dict.outcomeNumbers.some((o) => Math.abs(o - n) <= (m[0].includes(".") || !Number.isInteger(o) ? 0.5 : 0) + 1e-9)) add("outcome_number");
  }
  return hits;
}

export function hasLeak(text: string, dict: LeakDictionary): boolean {
  return findLeaks(text, dict).length > 0;
}

export { numericTokens };

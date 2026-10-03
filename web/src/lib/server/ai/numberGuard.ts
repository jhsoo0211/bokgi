import "server-only";

/**
 * 숫자 발화 제한 — IfSave NumberGuard(backend .../aifeedback/NumberGuard.java) 의미 이식.
 * 문장의 숫자 토큰은 허용 집합(서버가 준 값)과 허용 오차 안에서 맞아야 한다.
 *  - 작은 수 0·1·2·3·6·12·36은 횟수·기간 표현으로 보고 넘기되, 바로 뒤에 %·배·원·달러 같은 단위가 오면 검사한다.
 *  - 1990~2099 정수는 바로 뒤에 '년'이 올 때만 연도로 보고 넘긴다(기준일 이후 연도는 누수 필터가 잡는다).
 *  - 허용 오차: 허용값이 소수(|값|<1000)면 ±0.5, 아니면 ±1.
 *  - 회사·자산 이름 속 숫자는 비교 전에 지운다(마스킹).
 * 복기에서 달라진 점: 부호(−·-)는 보지 않고 절댓값으로 비교한다(한국어 문장은 "2.3%p 뒤졌다"처럼 부호를 빼고 쓴다).
 * 어긴 문장은 통째로 숫자 없는 안전 문장으로 바꾼다(IfSave는 응답 전체를 버린다).
 */
export interface AllowedNumber {
  value: number;
  decimal: boolean;
}

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const IGNORE = new Set([0, 1, 2, 3, 6, 12, 36]);
const MEASURED_UNIT = /^[ \u00A0\u3000]?(?:[%\uFF05]|퍼센트|프로(?![그젝야])|배(?![당분송치경급열제우려고])|만원|억원|원(?![금화래인칙리유자])|달러)/;
const AMOUNT_TOL = 1;
const PCT_TOL = 0.5;

function parseToken(token: string): number | null {
  const raw = token.replace(/,/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** 텍스트 안의 모든 숫자 토큰(절댓값). 면제 규칙은 적용하지 않는다(허용 집합을 채우는 쪽이 쓴다). */
export function numericTokens(text: string | null | undefined): number[] {
  if (!text) return [];
  const out: number[] = [];
  for (const m of String(text).matchAll(NUMBER)) {
    const n = parseToken(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

/** 문자열·숫자들에서 허용 숫자 집합을 만든다. 문자열은 그 안의 숫자 토큰을, 숫자는 그 값(절댓값)을. */
export function allowedNumbers(...sources: (string | number | null | undefined)[]): AllowedNumber[] {
  const out: AllowedNumber[] = [];
  for (const s of sources) {
    if (s === null || s === undefined) continue;
    if (typeof s === "number") {
      if (Number.isFinite(s)) out.push({ value: Math.abs(s), decimal: !Number.isInteger(s) });
      continue;
    }
    for (const m of s.matchAll(NUMBER)) {
      const n = parseToken(m[0]);
      if (n !== null) out.push({ value: n, decimal: m[0].includes(".") });
    }
  }
  return out;
}

function mask(text: string, literals: readonly string[]): string {
  let out = text;
  for (const lit of literals) if (lit && lit.trim()) out = out.split(lit).join(" ");
  return out;
}

function matchesAny(n: number, allowed: readonly AllowedNumber[]): boolean {
  return allowed.some((a) => Math.abs(a.value - n) <= (a.decimal && a.value < 1000 ? PCT_TOL : AMOUNT_TOL) + 1e-9);
}

/** 문장 하나가 숫자 발화 제한을 지키는지 */
export function passesNumberGuard(text: string, allowed: readonly AllowedNumber[], contextLiterals: readonly string[] = []): boolean {
  const masked = mask(text, contextLiterals);
  for (const m of masked.matchAll(NUMBER)) {
    const token = m[0];
    const n = parseToken(token);
    if (n === null) continue;
    const end = (m.index ?? 0) + token.length;
    const after = masked.slice(end);
    if (IGNORE.has(n) && !MEASURED_UNIT.test(after)) continue;
    if (!token.includes(",") && Number.isInteger(n) && n >= 1990 && n <= 2099 && after.startsWith("년")) continue;
    if (!matchesAny(n, allowed)) return false;
  }
  return true;
}

/** 문장 나누기: 마침표·물음표·느낌표 뒤 공백에서만 자른다("5.25%"는 자르지 않는다). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 문장 단위로 검사해 어긴 문장을 안전 문장(숫자 없음)으로 바꾼다. 연속으로 바뀐 문장은 하나로 합친다.
 * replaced = 바뀐 문장 수.
 */
export function guardSentences(text: string, allowed: readonly AllowedNumber[], safe: string, contextLiterals: readonly string[] = []): { text: string; replaced: number } {
  const out: string[] = [];
  let replaced = 0;
  for (const s of splitSentences(text)) {
    if (passesNumberGuard(s, allowed, contextLiterals)) out.push(s);
    else {
      replaced++;
      if (out[out.length - 1] !== safe) out.push(safe);
    }
  }
  return { text: out.length ? out.join(" ") : safe, replaced };
}

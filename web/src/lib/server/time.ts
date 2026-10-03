import "server-only";

/**
 * 날짜는 하루 단위 문자열 'YYYY-MM-DD'로 다룬다. 하루 경계는 서버가 사용자 tz(기본 APP_TZ)로 정한다(05 §7).
 * 날짜 더하기는 달력 계산(UTC 자정)이라 서머타임과 무관하다.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTz(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** instant가 tz에서 속한 날짜 */
export function localDate(instant: Date, tz: string): string {
  const parts = formatter(isValidTz(tz) ? tz : "Asia/Seoul").formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isMonthString(s: string): boolean {
  return MONTH_RE.test(s);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** a - b (일) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** DB date 열에 넣을 값(UTC 자정) */
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** DB date 열에서 읽은 값 → 'YYYY-MM-DD' */
export function fromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** 'YYYY-MM'의 모든 날짜 */
export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

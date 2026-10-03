/**
 * 연습 달력 계산(프로토타입 calendarHtml 규칙). 목 서버의 일지 응답과, 서버가 ?month=를 모를 때의 클라이언트 대체 계산이 같이 쓴다.
 * 연습한 날 = 판단한 날(결과 대기 포함), 복습 예정 = 복습일(지난 복습은 오늘로 당겨 센다).
 * 결과 상태(앞섬·뒤짐·비슷)는 받지 않는다 — 달력은 연습 기록이지 적중 지도가 아니다.
 */
import type { CalendarDay } from "./types";
import { addMonths, monthIndex, monthOf, parseDayKey, dayKeyOf } from "./format";

export type MonthCalendar = { month: string; days: CalendarDay[]; practicedDays: number; reviewsDue: number };

/** 복습일 목록 → 날짜별 개수(지난 것은 오늘로) */
export function dueCounts(dueDates: Iterable<string>, today: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of dueDates) {
    const k = d < today ? today : d;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function buildMonth(month: string, practiced: ReadonlySet<string>, due: ReadonlyMap<string, number>): MonthCalendar {
  const first = parseDayKey(`${month}-01`);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const days: CalendarDay[] = [];
  let practicedDays = 0;
  let reviewsDue = 0;
  for (let d = 1; d <= last; d++) {
    const date = dayKeyOf(new Date(first.getFullYear(), first.getMonth(), d));
    const p = practiced.has(date);
    const n = due.get(date) ?? 0;
    if (p) practicedDays++;
    reviewsDue += n;
    days.push({ date, practiced: p, due: n > 0 });
  }
  return { month, days, practicedDays, reviewsDue };
}

/** 넘길 수 있는 범위: 첫 판단이 있는 달 ~ 마지막 복습 예정일이 있는 달 (이번 달은 늘 포함) */
export function monthRange(practiced: Iterable<string>, due: Iterable<string>, today: string): { min: string; max: string } {
  const cur = monthOf(today);
  let min = monthIndex(cur);
  let max = min;
  for (const k of practiced) min = Math.min(min, monthIndex(monthOf(k)));
  for (const k of due) max = Math.max(max, monthIndex(monthOf(k < today ? today : k)));
  const base = monthIndex(cur);
  return { min: addMonths(cur, min - base), max: addMonths(cur, max - base) };
}

/** 월요일 시작 격자: 앞뒤 빈칸(null) 포함, 7칸씩 */
export function monthGrid(days: CalendarDay[]): (CalendarDay | null)[][] {
  if (!days.length) return [];
  const lead = (parseDayKey(days[0].date).getDay() + 6) % 7;
  const cells: (CalendarDay | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

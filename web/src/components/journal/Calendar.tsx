/**
 * 연습 달력(일지 맨 위, 월요일 시작). 판단한 날 = 잉크 점, 복습 예정일 = 테두리 원, 오늘 = 빨간 펜 링.
 * 결과 상태(앞섬·뒤짐·비슷)로 칠하지 않는다 — 달력은 연습 기록이지 적중 지도가 아니다.
 */
import { monthGrid, type MonthCalendar } from "@/lib/client/calendar";
import { WEEKDAYS } from "@/lib/client/format";

type Props = {
  cal: MonthCalendar;
  today: string;
  isCurrent: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export function Calendar({ cal, today, isCurrent, canPrev, canNext, onPrev, onNext }: Props) {
  const y = +cal.month.slice(0, 4), m = +cal.month.slice(5, 7);
  return (
    <>
      <div className="cal-head">
        <button type="button" className="cal-nav" id="cal-prev" aria-label="이전 달" aria-describedby="cal-title" disabled={!canPrev} onClick={onPrev}>‹</button>
        <h2 className="cal-title ds-head" id="cal-title" tabIndex={-1}>{y}년 {m}월</h2>
        <button type="button" className="cal-nav" id="cal-next" aria-label="다음 달" aria-describedby="cal-title" disabled={!canNext} onClick={onNext}>›</button>
      </div>
      <table className="cal-grid" aria-labelledby="cal-title">
        <thead><tr>{WEEKDAYS.map((w) => <th key={w} scope="col">{w}</th>)}</tr></thead>
        <tbody>
          {monthGrid(cal.days).map((week, wi) => (
            <tr key={wi}>
              {week.map((d, di) => {
                if (!d) return <td key={di} />;
                const isToday = d.date === today;
                const cls = ["cal-day", d.practiced && "cal-day--done", d.due && "cal-day--due", isToday && "cal-day--today", d.date > today && "cal-day--future"].filter(Boolean).join(" ");
                const sr = [isToday && "오늘", d.practiced && "연습한 날", d.due && "복습 예정"].filter(Boolean).join(", ");
                return (
                  <td key={di} className={cls}>
                    <span className="cal-n">{+d.date.slice(8, 10)}</span>
                    <i className="cal-mk" aria-hidden="true" />
                    {sr && <span className="sr-only">{sr}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cal-foot">
        <p className="cal-cap">{isCurrent ? "이달" : `${m}월`} 연습 <b>{cal.practicedDays}일</b> · 복습 <b>{cal.reviewsDue}개</b></p>
        <p className="cal-key" aria-hidden="true">
          <span><i className="cal-mk cal-mk--done" />연습</span>
          <span><i className="cal-mk cal-mk--due" />복습 예정</span>
          <span><i className="cal-ring" />오늘</span>
        </p>
      </div>
    </>
  );
}

import { SESSION_CARDS } from "@/shared/contract";

/** 오늘 머리줄: 하루 진행(n/3, 한 장 더는 +k)만. 스트릭은 입장 띠 오른쪽에 한 번만 보인다 */
export function TodayTop({ judged, label }: { judged: number; label: string }) {
  const done = Math.min(judged, SESSION_CARDS);
  return (
    <>
      <div className="top">
        <span>
          오늘 <b className="ds-num">{done}/{SESSION_CARDS}</b>
          {judged > SESSION_CARDS && <span className="ds-num"> +{judged - SESSION_CARDS}</span>}
        </span>
        <span>{label}</span>
      </div>
      <div className="ds-bar" aria-hidden="true"><i style={{ width: `${(done / SESSION_CARDS) * 100}%` }} /></div>
    </>
  );
}

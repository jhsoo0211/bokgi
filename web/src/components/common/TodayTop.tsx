import { SESSION_CARDS, SESSION_REVIEWS_MAX } from "@/shared/contract";

export type SessionReviews = { done: number; total: number };

/**
 * 오늘 머리줄: 하루 진행(n/3, 한 장 더는 +k)만. 스트릭은 입장 띠 오른쪽에 한 번만 보인다.
 * 아래 진행 바는 오늘 세션의 칸(카드 3칸 + 그날 복습 0~2칸)을 나눠 그린다 — 듀오링고식 '세션 진행'을 빌리되
 * 잉크 한 색, 움직임·축하 연출 없음. 보조기술에는 progressbar 하나로 '카드 n/3 · 복습 i/m'을 알린다.
 * 오른쪽 끝(라벨 옆)은 곧 들어올 정보 수준 설정 버튼 자리다.
 */
export function TodayTop({ judged, label, reviews }: { judged: number; label: string; reviews?: SessionReviews }) {
  const done = Math.min(judged, SESSION_CARDS);
  const rTotal = Math.min(SESSION_REVIEWS_MAX, Math.max(0, reviews?.total ?? 0));
  const rDone = Math.min(rTotal, Math.max(0, reviews?.done ?? 0));
  const text = `카드 ${done}/${SESSION_CARDS}${rTotal ? ` · 복습 ${rDone}/${rTotal}` : ""}`;
  return (
    <>
      <div className="top">
        <span>
          오늘 <b className="ds-num">{done}/{SESSION_CARDS}</b>
          {judged > SESSION_CARDS && <span className="ds-num"> +{judged - SESSION_CARDS}</span>}
        </span>
        <span>{label}</span>
      </div>
      <div
        className="ds-bar seg" role="progressbar" aria-label="오늘 세션 진행"
        aria-valuemin={0} aria-valuemax={SESSION_CARDS + rTotal} aria-valuenow={done + rDone} aria-valuetext={text}
      >
        {Array.from({ length: SESSION_CARDS }, (_, i) => <i key={`c${i}`} className={i < done ? "on" : undefined} />)}
        {Array.from({ length: rTotal }, (_, i) => <i key={`r${i}`} className={`rv${i < rDone ? " on" : ""}`} />)}
      </div>
    </>
  );
}

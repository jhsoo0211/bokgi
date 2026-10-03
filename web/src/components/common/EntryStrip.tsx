import { SESSION_CARDS } from "@/shared/contract";
import type { Today } from "@/lib/client/types";

/**
 * 입장 띠(오늘 맨 위): 1줄 학습(개념 이해 n/N · 복습 예정 m개), 2줄 오늘 남은 카드, 오른쪽 스트릭(caption).
 * 누르는 곳이 아니다(카드는 바로 아래). 다음 카드의 개념·결과는 넣지 않는다(결과 암시 방지). 결과 상태로 칠하지 않는다.
 */
export function EntryStrip({ today, judged, extraMode }: { today: Today; judged: number; extraMode: boolean }) {
  const e = today.entry;
  const cards = judged >= SESSION_CARDS
    ? `오늘 끝${extraMode ? " · 한 장 더 보는 중" : today.extraAllowed ? " · 한 장 더 가능" : ""}`
    : e.cardsLeft ? null : "남은 카드 없음";
  return (
    <div className="ds-entry" role="group" aria-label="오늘 학습">
      <p className="ds-entry-lead">개념 이해 <b>{e.conceptsKnown}/{e.conceptsTotal}</b> · 복습 예정 <b>{e.reviewsDue}개</b></p>
      <p className="ds-entry-sub">{cards ?? <>오늘 남은 카드 <b>{e.cardsLeft}장</b></>}</p>
      <span className="ds-streak">스트릭 {today.streak}일</span>
    </div>
  );
}

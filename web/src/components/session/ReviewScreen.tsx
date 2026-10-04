"use client";

/**
 * 오늘: 복습 문제(복습일이 된 개념, 하루 2개까지). 답하면 '계속'이 열리고 초점이 옮겨 간다.
 * '계속'은 아래 탭 위에 붙는 주 행동 막대(.act-bar)에 둔다 — 답하기 전에는 닫혀 있어 문제를 건너뛰는 단추가 아니다.
 */
import { useEffect, useRef, useState } from "react";
import { EntryStrip } from "@/components/common/EntryStrip";
import { QuizBlock } from "@/components/common/QuizBlock";
import { TodayTop } from "@/components/common/TodayTop";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { logEvent } from "@/lib/client/events";
import { SESSION_REVIEWS_MAX } from "@/shared/contract";
import type { ConceptListItem, ReviewItem, Today } from "@/lib/client/types";

type Props = { today: Today; item: ReviewItem; concept: ConceptListItem | null; done: number; total: number; judged: number; onNext: () => void };

export function ReviewScreen({ today, item, concept, done, total, judged, onNext }: Props) {
  useScreenFocus();
  const [answered, setAnswered] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);
  const logged = useRef(false);

  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    logEvent("review_view", { payload: { conceptId: item.conceptId } });
  }, [item.conceptId]);

  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true });
  }, [answered]);

  const quiz = concept?.quiz ?? null;
  return (
    <>
      <h1 id="screen-title" className="sr-only">복습 문제</h1>
      <TodayTop judged={judged} label={`복습 ${done + 1}/${total}`} reviews={{ done, total }} />
      <EntryStrip today={today} judged={judged} extraMode={false} />
      <h2 className="q ds-head">복습 · {item.title}</h2>
      <div className="ds-card concept">
        {quiz ? <QuizBlock conceptId={item.conceptId} quiz={quiz} via="review" onAnswered={() => setAnswered(true)} />
          : <p>이 개념의 확인 문제를 불러오지 못했어요. 계속을 눌러 넘어가 주세요.</p>}
        {concept && (
          <details className="peek">
            <summary>개념 다시 보기</summary>
            <p>{concept.body}</p>
          </details>
        )}
      </div>
      <p className="hint">복습은 하루 {SESSION_REVIEWS_MAX}개까지예요. 맞히면 다음 간격(1·3·7·21일)으로, 틀리면 내일 다시 나와요.</p>
      <div className="act-bar">
        <button type="button" className="ds-btn ds-btn--primary wide" id="next" ref={nextRef} disabled={!answered && !!quiz} onClick={onNext}>계속 →</button>
      </div>
    </>
  );
}

"use client";

/**
 * 오늘 끝: 오늘 되짚은 개념 요약(서버 Today.conceptsToday — 오늘 공개한 카드의 1순위 개념, 공개 순서)
 * → 내일 돌아올 이유 한 줄(내일 복습 n개·새 카드 — 비난·재촉 없이 사실만)
 * → '한 장 더'(허용될 때, 기록됨) 또는 카드가 바닥났다는 안내. 결과색·형광펜·점수 없음.
 */
import { useState } from "react";
import { EntryStrip } from "@/components/common/EntryStrip";
import { TodayTop, type SessionReviews } from "@/components/common/TodayTop";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { CONCEPT_STATE, dueLabel } from "@/lib/client/format";
import { SESSION_CARDS } from "@/shared/contract";
import type { Today } from "@/lib/client/types";

type Props = { today: Today; judged: number; tomorrowReviews: number; reviews: SessionReviews; onMore: () => Promise<string | null> };

/** 내일 한 줄: 복습 수와 새 카드(남은 카드가 있을 때만 — 없는 것을 약속하지 않는다) */
function tomorrowLine(reviews: number, newCards: boolean) {
  if (reviews > 0 && newCards) return <>내일은 복습 <b>{reviews}개</b>와 새 카드가 준비돼요.</>;
  if (reviews > 0) return <>내일은 복습 <b>{reviews}개</b>가 준비돼요.</>;
  if (newCards) return <>내일은 새 카드가 준비돼요.</>;
  return null;
}

export function DoneScreen({ today, judged, tomorrowReviews, reviews, onMore }: Props) {
  useScreenFocus();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const summary = today.conceptsToday;
  const tomorrow = tomorrowLine(tomorrowReviews, today.extraAllowed);

  const more = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const failed = await onMore();   // 성공하면 화면이 바뀐다
    if (failed) { setErr(failed); setBusy(false); }
  };

  return (
    <>
      <TodayTop judged={judged} label="마침" reviews={reviews} />
      <EntryStrip today={today} judged={judged} extraMode={false} />
      <section className="done">
        <h1 id="screen-title" className="done-title ds-head">{judged >= SESSION_CARDS ? "오늘은 여기까지" : "준비된 카드를 모두 봤어요"}</h1>
        <p className="ds-muted">{judged ? `오늘 카드 ${judged}장을 판단하고 결과를 되짚었어요.` : "오늘은 판단한 카드가 아직 없어요."}</p>
        {summary.length > 0 && (
          <div className="ds-card">
            <h2 className="ds-card-title">오늘 되짚은 개념</h2>
            <ul className="csum">
              {summary.map((c) => (
                <li key={c.conceptId} data-c={c.conceptId}>
                  <b>{c.title}</b>
                  <span className="cstate">{CONCEPT_STATE[c.state]}</span>
                  {c.dueOn && <small>다음 복습: {dueLabel(c.dueOn, today.date)}</small>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {tomorrow && <p className="comeback">{tomorrow}</p>}
        {today.extraAllowed ? (
          <>
            <button type="button" className="ds-btn wide" id="more" aria-disabled={busy ? true : undefined} onClick={() => { void more(); }}>한 장 더</button>
            <p className="hint">한 장 더 본 것도 일지에 기록돼요.</p>
            {err && <p className="hint" role="alert">{err}</p>}
          </>
        ) : (
          <p className="exhausted">{judged >= SESSION_CARDS ? "준비된 카드를 모두 봤어요. " : ""}새 카드가 들어오면 여기서 이어져요.</p>
        )}
      </section>
    </>
  );
}

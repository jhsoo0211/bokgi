"use client";

/**
 * ○△✕ 자기 평가 — "내 근거는 이 개념과 맞았나요?"(원칙 준수가 아니라 개념 확인). '사후에 중요했던 것' 바로 아래.
 * 고르면 빨간 펜 고리, 다시 고를 수 있다(삭제는 없다). 서버(PUT /self-check)가 기록하고 일지 행에 작은 표시로만 보인다.
 * 점수·비율·집계로 만들지 않는다.
 */
import { useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { SELF_CHECK, SELF_CHECK_FB, SELF_CHECK_ORDER } from "@/lib/client/format";
import type { SelfCheck } from "@/lib/client/types";

export function SelfCheckBox({ judgmentId, initial }: { judgmentId: string; initial: SelfCheck | null }) {
  const [value, setValue] = useState<SelfCheck | null>(initial);
  const [failed, setFailed] = useState(false);
  // 빠르게 ○ → △를 누르면 두 요청이 겹친다. 마지막 요청만 화면을 바꾸고, 실패하면 서버가 마지막으로 받은 값으로 되돌린다
  // (click-path-audit: 앞 요청의 늦은 실패가 뒤 요청의 성공을 지우지 않게)
  const seq = useRef(0);
  const okSeq = useRef(0);
  const confirmed = useRef<SelfCheck | null>(initial);

  const pick = async (v: SelfCheck) => {
    if (value === v) return;
    const my = ++seq.current;
    setValue(v);
    setFailed(false);
    try {
      await api.selfCheck(judgmentId, v);
      if (my > okSeq.current) { okSeq.current = my; confirmed.current = v; }
    } catch {
      if (my !== seq.current) return;
      setValue(confirmed.current);
      setFailed(true);
    }
  };

  return (
    <div className="selfcheck" id="selfcheck">
      <p className="selfcheck-q" id="sc-q">내 근거는 이 개념과 맞았나요?</p>
      <div className="ds-selfcheck" role="group" aria-labelledby="sc-q">
        {SELF_CHECK_ORDER.map((v) => (
          <button key={v} type="button" data-v={v} aria-pressed={value === v} onClick={() => { void pick(v); }}>
            <span aria-hidden="true">{SELF_CHECK[v][0]}</span> {SELF_CHECK[v][1]}
          </button>
        ))}
      </div>
      <p className="selfcheck-fb" aria-live="polite">{failed ? "기록하지 못했어요. 다시 눌러 주세요." : value ? SELF_CHECK_FB[value] : ""}</p>
    </div>
  );
}

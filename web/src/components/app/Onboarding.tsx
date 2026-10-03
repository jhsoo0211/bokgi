"use client";

/** 첫 실행 안내 3장 → [시작]. 2·3장은 '다음' 버튼에 초점을 이어 준다(키보드로 Enter만 이어 누르면 된다) */
import { useState } from "react";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { ONBOARDING } from "@/lib/client/format";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  return <Slide key={i} i={i} onNext={() => (i < ONBOARDING.length - 1 ? setI(i + 1) : onDone())} />;
}

function Art({ kind }: { kind: (typeof ONBOARDING)[number]["art"] }) {
  if (kind === "chip") return <span className="ds-chip ds-chip--on">근거</span>;
  if (kind === "cards") return <><span className="mini-card" /><span className="mini-card" /><span className="mini-card" /></>;
  return <span className="masked">회사 ○○○ · 티커 ••••</span>;
}

function Slide({ i, onNext }: { i: number; onNext: () => void }) {
  useScreenFocus(i > 0 ? "#onb-next" : undefined);
  const s = ONBOARDING[i];
  const last = i === ONBOARDING.length - 1;
  return (
    <section className="onb" aria-labelledby="screen-title">
      <p className="onb-step ds-num">{i + 1} / {ONBOARDING.length}</p>
      <div className="onb-art" aria-hidden="true"><Art kind={s.art} /></div>
      <h1 className="onb-title ds-head" id="screen-title">{s.title}</h1>
      <p className="onb-body">{s.body}</p>
      <div className="onb-dots" aria-hidden="true">{ONBOARDING.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
      <button type="button" className="ds-btn ds-btn--primary wide" id="onb-next" aria-describedby="screen-title" onClick={onNext}>{last ? "시작" : "다음"}</button>
    </section>
  );
}

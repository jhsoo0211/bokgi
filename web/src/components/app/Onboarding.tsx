"use client";

/**
 * 첫 실행 안내 4장. 1~3장은 [다음](2·3장은 '다음' 버튼에 초점을 이어 준다 — 키보드로 Enter만 이어 누르면 된다).
 * 넷째 장 "어느 정도 아세요?"(D16)는 큰 단추 셋(처음이에요 · 기본 지표는 알아요 · 재무제표를 읽어요) — 고르면 PUT /api/me/prefs를
 * 보내고 그 응답(Me)으로 안내를 마친다. 시험·점수가 아니라 세 판에서 볼 정보의 깊이를 정하는 것이고, 나중에 언제든 바꾼다.
 * 넷째 장에서는 기본값(중급)에 초점을 둔다 — Enter만 이어 누른 사용자는 기본값으로 시작한다.
 * 틀은 div다 — 화면 틀(#view, region)이 이미 같은 h1을 이름으로 쓰므로 section+aria-labelledby를 겹치면
 * 같은 이름의 랜드마크가 둘이 된다(axe landmark-unique). 장 수는 ONBOARDING 배열 길이를 따른다.
 */
import { useState } from "react";
import { useApp } from "@/components/app/AppContext";
import { useScreenFocus } from "@/hooks/useScreenFocus";
import { api, errorText, isApiError } from "@/lib/client/api";
import { LEVEL_NAME, LEVEL_PRESETS, ONBOARDING } from "@/lib/client/format";
import type { InfoLevel, Me } from "@/lib/client/types";

type Props = { onDone: (user: Me["user"]) => void };

export function Onboarding({ onDone }: Props) {
  const [i, setI] = useState(0);
  return <Slide key={i} i={i} onNext={() => setI(Math.min(i + 1, ONBOARDING.length - 1))} onDone={onDone} />;
}

function Art({ kind }: { kind: (typeof ONBOARDING)[number]["art"] }) {
  if (kind === "chip") return <span className="ds-chip ds-chip--on">근거</span>;
  if (kind === "cards") return <><span className="mini-card" /><span className="mini-card" /><span className="mini-card" /></>;
  if (kind === "level") return <>{[1, 2, 3].map((n) => <span key={n} className="mini-sheet">{Array.from({ length: n + 1 }, (_, k) => <i key={k} />)}</span>)}</>;
  return <span className="masked">회사 ○○○ · 티커 ••••</span>;
}

function Slide({ i, onNext, onDone }: { i: number; onNext: () => void; onDone: (user: Me["user"]) => void }) {
  const isLevel = ONBOARDING[i].art === "level";
  useScreenFocus(isLevel ? '.onb-opt[data-level="standard"]' : i > 0 ? "#onb-next" : undefined);
  const s = ONBOARDING[i];
  return (
    <div className={isLevel ? "onb onb--level" : "onb"}>
      <p className="onb-step ds-num">{i + 1} / {ONBOARDING.length}</p>
      <div className="onb-art" aria-hidden="true"><Art kind={s.art} /></div>
      <h1 className="onb-title ds-head" id="screen-title">{s.title}</h1>
      <p className="onb-body">{s.body}</p>
      {isLevel && <LevelChoice onDone={onDone} />}
      <div className="onb-dots" aria-hidden="true">{ONBOARDING.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
      {!isLevel && <button type="button" className="ds-btn ds-btn--primary wide" id="onb-next" aria-describedby="screen-title" onClick={onNext}>다음</button>}
    </div>
  );
}

/** 넷째 장의 세 단추. 저장이 끝나야 안내를 마친다(실패하면 문구를 띄우고 다시 고를 수 있다) */
function LevelChoice({ onDone }: { onDone: (user: Me["user"]) => void }) {
  const { onUnauthorized } = useApp();
  const [busy, setBusy] = useState<InfoLevel | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const choose = async (level: InfoLevel) => {
    if (busy) return;
    setBusy(level);
    setErr(null);
    try {
      const me = await api.prefs({ infoLevel: level });
      onDone(me.user);
    } catch (e) {
      if (isApiError(e, 401)) { onUnauthorized(); return; }
      setErr(`저장하지 못했어요. ${errorText(e)}`);
      setBusy(null);
    }
  };

  return (
    <>
      <div className="onb-opts" role="group" aria-labelledby="screen-title" aria-describedby="onb-later">
        {LEVEL_PRESETS.map((p) => (
          <button
            key={p.level} type="button" className="onb-opt" data-level={p.level}
            aria-disabled={busy ? true : undefined} onClick={() => { void choose(p.level); }}
          >
            <b>{p.who}</b>
            <span>{LEVEL_NAME[p.level]} · {p.what}</span>
          </button>
        ))}
      </div>
      <p className="onb-later" id="onb-later">나중에 언제든 바꿀 수 있어요 — 오늘 화면 위 ‘정보 수준’에서.</p>
      <p className="onb-status" role="status">{busy ? "저장하는 중…" : ""}</p>
      {err && <p className="form-err" role="alert">{err}</p>}
    </>
  );
}

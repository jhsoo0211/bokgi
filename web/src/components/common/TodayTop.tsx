"use client";

/**
 * 오늘 머리줄: 하루 진행(n/3, 한 장 더는 +k) · 지금 단계 라벨 · 정보 수준 단추. 스트릭은 입장 띠 오른쪽에 한 번만 보인다.
 * 아래 진행 바는 오늘 세션의 칸(카드 3칸 + 그날 복습 0~2칸)을 나눠 그린다 — 듀오링고식 '세션 진행'을 빌리되
 * 잉크 한 색, 움직임·축하 연출 없음. 보조기술에는 progressbar 하나로 '카드 n/3 · 복습 i/m'을 알린다.
 * 정보 수준 단추("정보 수준 · 기본")는 공용 Sheet의 설정 시트를 연다(info_level_open). 카드를 고르는 중이면(cardInProgress)
 * 시트에 "바뀐 설정은 다음 카드부터 적용돼요"가 붙는다. 저장은 앱 틀의 savePrefs(낙관적, 실패하면 되돌리고 아래 줄에 알림).
 */
import { useState } from "react";
import { useApp } from "@/components/app/AppContext";
import { logEvent } from "@/lib/client/events";
import { LEVEL_SHORT } from "@/lib/client/format";
import { INFO_GROUPS, SESSION_CARDS, SESSION_REVIEWS_MAX } from "@/shared/contract";
import type { Prefs } from "@/lib/client/types";
import { InfoLevelSheet } from "./InfoLevelSheet";

export type SessionReviews = { done: number; total: number };

type Props = { judged: number; label: string; reviews?: SessionReviews; cardInProgress?: boolean };

const samePrefs = (a: Prefs, b: Prefs) =>
  a.infoLevel === b.infoLevel && a.undoSeconds === b.undoSeconds && INFO_GROUPS.every((g) => a.panelPrefs[g] === b.panelPrefs[g]);

export function TodayTop({ judged, label, reviews, cardInProgress = false }: Props) {
  const { prefs, savePrefs, prefsError } = useApp();
  const [sheet, setSheet] = useState(false);
  const done = Math.min(judged, SESSION_CARDS);
  const rTotal = Math.min(SESSION_REVIEWS_MAX, Math.max(0, reviews?.total ?? 0));
  const rDone = Math.min(rTotal, Math.max(0, reviews?.done ?? 0));
  const text = `카드 ${done}/${SESSION_CARDS}${rTotal ? ` · 복습 ${rDone}/${rTotal}` : ""}`;

  const open = () => {
    setSheet(true);
    logEvent("info_level_open", { payload: { level: prefs.infoLevel, during: cardInProgress ? "card" : label } });
  };

  return (
    <>
      <div className="top">
        <span>
          오늘 <b className="ds-num">{done}/{SESSION_CARDS}</b>
          {judged > SESSION_CARDS && <span className="ds-num"> +{judged - SESSION_CARDS}</span>}
        </span>
        <span className="top-r">
          <span>{label}</span>
          <button type="button" className="lvl-btn" id="info-level" aria-haspopup="dialog" onClick={open}>
            정보 수준 · {LEVEL_SHORT[prefs.infoLevel]}
          </button>
        </span>
      </div>
      {prefsError && <p className="top-err" role="alert">{prefsError}</p>}
      <div
        className="ds-bar seg" role="progressbar" aria-label="오늘 세션 진행"
        aria-valuemin={0} aria-valuemax={SESSION_CARDS + rTotal} aria-valuenow={done + rDone} aria-valuetext={text}
      >
        {Array.from({ length: SESSION_CARDS }, (_, i) => <i key={`c${i}`} className={i < done ? "on" : undefined} />)}
        {Array.from({ length: rTotal }, (_, i) => <i key={`r${i}`} className={`rv${i < rDone ? " on" : ""}`} />)}
      </div>
      {sheet && (
        <InfoLevelSheet
          current={prefs}
          cardInProgress={cardInProgress}
          onClose={() => setSheet(false)}
          onSave={(p) => {
            setSheet(false);
            if (!samePrefs(p, prefs)) savePrefs(p);
          }}
        />
      )}
    </>
  );
}

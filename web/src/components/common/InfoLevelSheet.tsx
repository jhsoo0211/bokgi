"use client";

/**
 * 정보 수준 설정 시트(D16, 02 §7.1): 수준(초급 「핵심만」·중급 「기본」·고급 「전부」 + 사용자 지정일 때만 넷째 칸) → 묶음 아홉 개(INFO_GROUPS 순서,
 * 판 이름으로 작은 머리) → 되돌리기 시간(2.5·5·10초). 묶음을 하나라도 바꾸면 levelForPrefs로 수준이 다시 정해진다(프리셋과 다르면 사용자 지정).
 * 카드를 고르는 중에 열면 "바뀐 설정은 다음 카드부터 적용돼요" — 판단 중에는 정보가 늘거나 줄지 않는다.
 * 저장은 부른 쪽(savePrefs, 낙관적)이 한다. 틀·초점 가두기·Esc·초점 복귀는 공용 Sheet.
 */
import { useState, type FormEvent } from "react";
import { INFO_GROUPS, levelForPrefs, presetPrefs } from "@/shared/contract";
import { GROUP_LABEL, LEVEL_NAME, LEVEL_PRESETS, UNDO_CHOICES } from "@/lib/client/format";
import type { InfoGroup, InfoLevel, PanelPrefs, Prefs, UndoSeconds } from "@/lib/client/types";
import { Sheet } from "./Sheet";

type Props = { current: Prefs; cardInProgress: boolean; onSave: (p: Prefs) => void; onClose: () => void };

const fmtSec = (s: UndoSeconds) => `${s}초`;
/** 묶음 행: 판이 바뀌는 첫 행에만 작은 머리(흐름·숫자·그때·고르기) */
const GROUP_ROWS = INFO_GROUPS.map((g, i) => ({ g, head: i === 0 || GROUP_LABEL[INFO_GROUPS[i - 1]].panel !== GROUP_LABEL[g].panel ? GROUP_LABEL[g].panel : null }));

export function InfoLevelSheet({ current, cardInProgress, onSave, onClose }: Props) {
  const [level, setLevel] = useState<InfoLevel>(current.infoLevel);
  const [prefs, setPrefs] = useState<PanelPrefs>(current.panelPrefs);
  const [undo, setUndo] = useState<UndoSeconds>(current.undoSeconds);

  const choose = (lv: Exclude<InfoLevel, "custom">) => {
    setLevel(lv);
    setPrefs(presetPrefs(lv));
  };
  const toggle = (g: InfoGroup, on: boolean) => {
    const next = { ...prefs, [g]: on };
    setPrefs(next);
    setLevel(levelForPrefs(next));   // 프리셋과 같아지면 그 수준, 아니면 사용자 지정
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ infoLevel: level, panelPrefs: level === "custom" ? prefs : presetPrefs(level), undoSeconds: undo });
  };

  return (
    <Sheet labelledBy="lv-title" onClose={onClose} initialFocus='input[name="lvl"]:checked' className="sheet--lv">
      <form className="sheet-form" id="lv-form" noValidate onSubmit={submit}>
        <h2 className="ds-head" id="lv-title">정보 수준</h2>
        <p className="ds-muted small">세 판(흐름·숫자·그때)에서 볼 정보의 깊이예요. 판은 늘 셋이고, 근거 칩은 모든 수준에서 다 보여요.</p>
        <fieldset className="lv-levels">
          <legend className="lv-legend">수준</legend>
          {LEVEL_PRESETS.map((p) => (
            <label key={p.level} className="radio lv-radio">
              <input type="radio" name="lvl" value={p.level} checked={level === p.level} onChange={() => choose(p.level)} />
              <span><b>{LEVEL_NAME[p.level]}</b><small>{p.who} · {p.what}</small></span>
            </label>
          ))}
          {level === "custom" && (
            <label className="radio lv-radio">
              <input type="radio" name="lvl" value="custom" checked readOnly />
              <span><b>{LEVEL_NAME.custom}</b><small>아래에서 고른 묶음만 보여요</small></span>
            </label>
          )}
        </fieldset>
        <fieldset className="lv-groups">
          <legend className="lv-legend">묶음 <small>하나라도 바꾸면 사용자 지정이 돼요</small></legend>
          {GROUP_ROWS.map(({ g, head }) => {
            const l = GROUP_LABEL[g];
            return (
              <div key={g} className="lv-row">
                {head && <p className="lv-panel" aria-hidden="true">{head}</p>}
                <label className="check lv-toggle">
                  <input type="checkbox" name="grp" value={g} data-g={g} checked={prefs[g]} onChange={(e) => toggle(g, e.target.checked)} />
                  <span>
                    <span className="sr-only">{l.panel} · </span>{l.label}
                    {l.note && <small> ({l.note})</small>}
                  </span>
                </label>
              </div>
            );
          })}
        </fieldset>
        <fieldset className="lv-undo">
          <legend className="lv-legend">되돌리기 시간</legend>
          <div className="lv-undo-opts">
            {UNDO_CHOICES.map((s) => (
              <label key={s} className="radio lv-sec">
                <input type="radio" name="undo" value={s} checked={undo === s} onChange={() => setUndo(s)} /> {fmtSec(s)}
              </label>
            ))}
          </div>
          <p className="ds-muted small lv-undo-note">판단 뒤 되돌리기 알림이 떠 있는 시간이에요. 화면 읽기 프로그램을 쓰면 길게 두세요.</p>
        </fieldset>
        {cardInProgress && <p className="lv-next" id="lv-next">바뀐 설정은 다음 카드부터 적용돼요.</p>}
        <div className="row2">
          <button type="button" className="ds-btn" id="lv-cancel" onClick={onClose}>닫기</button>
          <button type="submit" className="ds-btn ds-btn--primary" id="lv-save">저장</button>
        </div>
      </form>
    </Sheet>
  );
}

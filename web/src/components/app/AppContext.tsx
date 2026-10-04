"use client";

import { createContext, useContext } from "react";
import { INFO_LEVEL_DEFAULT, presetPrefs, UNDO_SECONDS_DEFAULT } from "@/shared/contract";
import type { Prefs } from "@/lib/client/types";

/** 아래 탭 세 화면 */
export type View = "today" | "journal" | "concepts";

export type AppCtx = {
  /** 세션이 끊겼을 때(401) 초대 코드 화면으로 */
  onUnauthorized: () => void;
  /** 다른 탭 화면으로(빈 상태의 '오늘 카드로' 같은 안내 단추용 — 아래 탭을 누른 것과 같다) */
  navigate: (v: View) => void;
  /** 지금 사용자의 정보 수준·묶음·되돌리기 시간(Me.user에서, PUT /api/me/prefs 뒤에는 그 응답으로) */
  prefs: Prefs;
  /** 설정 저장(낙관적: 화면은 바로 바꾸고, 실패하면 되돌리며 prefsError를 띄운다). 서버가 정규화한 응답으로 다시 맞춘다 */
  savePrefs: (next: Prefs) => void;
  /** 설정 저장 실패 문구(머리줄 아래에 보인다) — 없으면 null */
  prefsError: string | null;
};

export const DEFAULT_PREFS: Prefs = { infoLevel: INFO_LEVEL_DEFAULT, panelPrefs: presetPrefs(INFO_LEVEL_DEFAULT), undoSeconds: UNDO_SECONDS_DEFAULT };

export const AppContext = createContext<AppCtx>({
  onUnauthorized: () => {}, navigate: () => {}, prefs: DEFAULT_PREFS, savePrefs: () => {}, prefsError: null,
});
export const useApp = (): AppCtx => useContext(AppContext);

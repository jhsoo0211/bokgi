"use client";

import { createContext, useContext } from "react";

/** 아래 탭 세 화면 */
export type View = "today" | "journal" | "concepts";

export type AppCtx = {
  /** 세션이 끊겼을 때(401) 초대 코드 화면으로 */
  onUnauthorized: () => void;
  /** 다른 탭 화면으로(빈 상태의 '오늘 카드로' 같은 안내 단추용 — 아래 탭을 누른 것과 같다) */
  navigate: (v: View) => void;
};

export const AppContext = createContext<AppCtx>({ onUnauthorized: () => {}, navigate: () => {} });
export const useApp = (): AppCtx => useContext(AppContext);

"use client";

import { createContext, useContext } from "react";

export type AppCtx = {
  /** 세션이 끊겼을 때(401) 초대 코드 화면으로 */
  onUnauthorized: () => void;
};

export const AppContext = createContext<AppCtx>({ onUnauthorized: () => {} });
export const useApp = (): AppCtx => useContext(AppContext);

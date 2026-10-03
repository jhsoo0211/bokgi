"use client";

import { useLayoutEffect } from "react";

/**
 * 새 화면이 뜰 때(프로토타입 screen()): 맨 위로 스크롤하고, 바뀌는 화면 안에 초점이 있었으면(또는 초점이 없으면)
 * 새 화면 틀(#view)로 초점을 옮긴다 — 다음 Tab이 아래 탭이 아니라 새 화면 첫 칸에서 시작하게.
 * 아래 탭을 눌러 왔으면 초점은 탭에 그대로 둔다. `selector`를 주면 틀 대신 그 요소로(온보딩 2·3장의 '다음' 버튼).
 */
export function useScreenFocus(selector?: string): void {
  useLayoutEffect(() => {
    const view = document.getElementById("view");
    const active = document.activeElement;
    const refocus = !active || active === document.body || (view !== null && view.contains(active));
    if (view) view.scrollTop = 0;
    window.scrollTo(0, 0);
    if (!refocus) return;
    const target = selector ? document.querySelector<HTMLElement>(selector) : null;
    (target ?? view)?.focus({ preventScroll: true });
  }, [selector]);
}

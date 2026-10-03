"use client";

/**
 * SwipeStack — prototype/app/js/swipe.js의 React 이식. 규칙(docs/06 §6)은 그대로다:
 * 임계 max(80px, 너비×0.30) 또는 속도 0.6px/ms, 회전 ±12°, 위·아래 스와이프 기능 없음,
 * 스와이프 거리로 확신도를 추정하지 않음(제스처 메타 dx·ms·v·flips는 기록만), 이탈 220ms(모션 감소면 애니메이션 없이 즉시).
 * 게이트(canSwipe)가 닫혀 있으면 임계를 넘어도 되돌아오고 onBlocked를 부른다. 버튼·키보드는 commitByButton.
 * 끄는 동안의 변형은 DOM에 직접 쓴다(포인터 이동마다 다시 그리지 않게). 맨 위 카드에만 handlers를 붙인다.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Direction, GestureMeta } from "@/lib/client/types";

const THRESH = 0.3, MINPX = 80, VEL = 0.6, OUT_MS = 220;

export type SwipeOptions = {
  /** 이탈이 시작되는 순간(게이트 잠금 — 날아가는 220ms 동안 이중 판단 방지) */
  onCommitStart: (direction: Direction, meta: GestureMeta, index: number) => void;
  /** 카드가 날아간 뒤 */
  onCommit: (direction: Direction, meta: GestureMeta, index: number) => void;
  canSwipe: () => boolean;
  onBlocked: () => void;
  reduced: boolean;
};

type Drag = { on: boolean; sx: number; sy: number; dx: number; dy: number; t0: number; flips: number; last: number; w: number };

export function useSwipeStack(opts: SwipeOptions) {
  const [idx, setIdx] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag>({ on: false, sx: 0, sy: 0, dx: 0, dy: 0, t0: 0, flips: 0, last: 0, w: 0 });
  const flying = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flying.current) clearTimeout(flying.current);
    flying.current = null;
  }, []);

  const limit = () => Math.max(MINPX, drag.current.w * THRESH);
  const setStamps = (el: HTMLElement, r: number, l: number) => {
    const sr = el.querySelector<HTMLElement>(".sc-stamp--r"), sl = el.querySelector<HTMLElement>(".sc-stamp--l");
    if (sr) sr.style.opacity = String(r);
    if (sl) sl.style.opacity = String(l);
  };

  const commit = (direction: Direction, meta: GestureMeta) => {
    const el = topRef.current;
    if (!el || flying.current) return;
    const index = idx;
    opts.onCommitStart(direction, meta, index);
    if (!opts.reduced) {
      const out = (direction === "outperform" ? 1 : -1) * ((stageRef.current?.clientWidth ?? 348) + 120);
      el.style.transform = `translate(${out}px, -20px) rotate(${direction === "outperform" ? 14 : -14}deg)`;
      el.style.opacity = "0";
    }
    flying.current = setTimeout(() => {
      flying.current = null;
      setIdx(index + 1);
      opts.onCommit(direction, meta, index);
    }, opts.reduced ? 0 : OUT_MS);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (flying.current) return;
    const d = drag.current;
    d.on = true; d.sx = e.clientX; d.sy = e.clientY; d.dx = 0; d.dy = 0;
    d.t0 = performance.now(); d.flips = 0; d.last = 0;
    d.w = stageRef.current?.clientWidth ?? 0;
    e.currentTarget.classList.add("drag");
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.on) return;
    d.dx = e.clientX - d.sx;
    d.dy = e.clientY - d.sy;
    const s = Math.sign(d.dx);
    if (s && d.last && s !== d.last) d.flips++;
    if (s) d.last = s;
    const rot = Math.max(-12, Math.min(12, d.dx / 20));
    e.currentTarget.style.transform = `translate(${d.dx}px, ${d.dy * 0.3}px) rotate(${rot}deg)`;
    const p = Math.min(1, Math.abs(d.dx) / limit());
    const open = opts.canSwipe();
    const shown = open ? p : Math.min(p, 0.25);
    setStamps(e.currentTarget, d.dx > 0 ? shown : 0, d.dx < 0 ? shown : 0);
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.on) return;
    d.on = false;
    e.currentTarget.classList.remove("drag");
    const dt = performance.now() - d.t0;
    const v = Math.abs(d.dx) / Math.max(1, dt);
    const passed = Math.abs(d.dx) > limit() || v > VEL;
    if (passed && opts.canSwipe()) {
      commit(d.dx > 0 ? "outperform" : "underperform", { via: "swipe", dx: Math.round(d.dx), ms: Math.round(dt), v: +v.toFixed(2), flips: d.flips });
    } else {
      e.currentTarget.style.transform = "";
      setStamps(e.currentTarget, 0, 0);
      if (passed) opts.onBlocked();
    }
    d.dx = 0;
    d.dy = 0;
  };

  return {
    idx,
    stageRef,
    topRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end },
    /** 버튼·키보드 판단: 게이트가 닫혀 있으면 onBlocked */
    commitByButton(direction: Direction, via: "button" | "key") {
      if (!opts.canSwipe()) { opts.onBlocked(); return; }
      commit(direction, { via, dx: 0, ms: 0, v: 0, flips: 0 });
    },
    /** 되돌리기: 마지막 카드로 복귀(판단 기록은 호출자가 지운다) */
    undo() { setIdx((i) => Math.max(0, i - 1)); },
  };
}

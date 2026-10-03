"use client";

import { useEffect, useState } from "react";

export type PausableTimeout = {
  start(ms: number, fn: () => void): void;
  pause(): void;
  resume(): void;
  cancel(): void;
};

/** 렌더와 무관한 타이머 객체. pause()는 남은 시간을 기억하고 resume()은 그만큼만 더 기다린다 */
function createPausableTimeout(): PausableTimeout {
  let id: ReturnType<typeof setTimeout> | null = null;
  let remaining = 0;
  let startedAt = 0;
  let fn: (() => void) | null = null;
  let paused = false;
  const run = () => {
    if (!fn || paused) return;
    startedAt = performance.now();
    id = setTimeout(() => {
      const f = fn;
      id = null;
      fn = null;
      f?.();
    }, Math.max(0, remaining));
  };
  const clear = () => {
    if (id) clearTimeout(id);
    id = null;
  };
  return {
    start(ms, f) { clear(); fn = f; remaining = ms; paused = false; run(); },
    pause() {
      if (paused) return;
      paused = true;
      if (id) { clear(); remaining -= performance.now() - startedAt; }
    },
    resume() {
      if (!paused) return;
      paused = false;
      run();
    },
    cancel() { clear(); fn = null; paused = false; },
  };
}

/**
 * 멈출 수 있는 타이머(되돌리기 2.5초). 알림에 초점이나 포인터가 있는 동안 멈추는 데 쓴다(WCAG 2.2.1 — ecc 감사 '남은 것').
 * 돌려주는 객체는 렌더마다 같다. 화면이 사라지면 저절로 취소된다.
 */
export function usePausableTimeout(): PausableTimeout {
  const [timer] = useState(createPausableTimeout);
  useEffect(() => () => timer.cancel(), [timer]);
  return timer;
}

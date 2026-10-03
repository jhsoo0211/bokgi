/**
 * UI 이벤트 기록(계약 UI_EVENTS allow-list). 상태 변화(판단·공개·퀴즈·자기 평가·신고)는 서버가 기록하므로 여기서 보내지 않는다.
 * 실제 API: 모아서 2초마다(또는 50개가 차면) POST /api/events, 페이지를 떠날 때는 keepalive로 남은 것을 보낸다.
 * 목 모드: 바로 보낸다(시험이 상태를 곧바로 읽을 수 있게).
 */
import { api, USE_MOCK } from "./api";
import { uuid } from "./format";
import type { UiEvent, UiEventName } from "./types";

const MAX_BATCH = 50;
const FLUSH_MS = 2000;
const buf: UiEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let bound = false;

function send(events: UiEvent[], keepalive = false): void {
  if (!events.length) return;
  api.events({ events }, { keepalive }).catch(() => { /* 기록 실패는 화면을 막지 않는다 */ });
}

export function flushEvents(keepalive = false): void {
  if (timer) { clearTimeout(timer); timer = null; }
  while (buf.length) send(buf.splice(0, MAX_BATCH), keepalive);
}

function bindPageHide(): void {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("pagehide", () => flushEvents(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushEvents(true); });
}

export function logEvent(
  event: UiEventName,
  opts: { caseId?: string | null; caseVersion?: number | null; payload?: Record<string, unknown> | null } = {},
): void {
  const e: UiEvent = {
    clientEventId: uuid(), event, caseId: opts.caseId ?? null, caseVersion: opts.caseVersion ?? null,
    payload: opts.payload ?? null, ts: new Date().toISOString(),
  };
  if (USE_MOCK) { send([e]); return; }
  bindPageHide();
  buf.push(e);
  if (buf.length >= MAX_BATCH) flushEvents();
  else if (!timer) timer = setTimeout(() => flushEvents(), FLUSH_MS);
}

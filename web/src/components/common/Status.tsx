"use client";

import { useScreenFocus } from "@/hooks/useScreenFocus";

/** 불러오는 동안(짧으면 글자도 띄우지 않는다 — app.css .loading) */
export function Loading() {
  useScreenFocus();
  return (
    <>
      <h1 id="screen-title" className="sr-only">불러오는 중</h1>
      <p className="loading" role="status">불러오는 중…</p>
    </>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  useScreenFocus();
  return (
    <div className="err" role="alert">
      <h1 id="screen-title" className="err-title ds-head">잠시 문제가 생겼어요</h1>
      <p>{message}</p>
      {onRetry && <button type="button" className="ds-btn wide" onClick={onRetry}>다시 시도</button>}
    </div>
  );
}

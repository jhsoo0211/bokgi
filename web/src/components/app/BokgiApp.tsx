"use client";

/**
 * 복기 앱 틀(380px 모바일 화면, 아래 탭 오늘·일지·개념). 화면 자료는 모두 클라이언트가 /api(또는 목)에서 받는다 —
 * 서버가 그리는 HTML·RSC에는 카드 자료가 없다(카나리 시험 대상이 늘 비어 있게).
 * 시작: /api/me → 401이면 초대 코드, 처음이면 안내 4장(넷째 장 = 정보 수준, 고르면 PUT /api/me/prefs → 완료는 onboarding_done 이벤트로
 * 서버가 기록, 기기에도 표시) → 오늘. 탭을 누르면 그 화면을 새로 그린다(프로토타입 go()). 오늘 탭을 떠나면 되돌리기 창 안의 판단은 공개 없이 보내진다.
 * 정보 수준·되돌리기 시간은 Me.user가 원본이다. 설정 시트에서 저장하면 화면을 바로 바꾸고(낙관적) PUT 응답(서버가 정규화한 값)으로 다시 맞춘다.
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ConceptsScreen } from "@/components/concepts/ConceptsScreen";
import { ErrorBox, Loading } from "@/components/common/Status";
import { JournalScreen } from "@/components/journal/JournalScreen";
import { TodayFlow } from "@/components/session/TodayFlow";
import { api, errorText, initApi, isApiError } from "@/lib/client/api";
import { flushEvents, logEvent } from "@/lib/client/events";
import { localOnboarded, setLocalOnboarded } from "@/lib/client/session";
import type { Me, Prefs } from "@/lib/client/types";
import { AppContext, DEFAULT_PREFS, type AppCtx, type View } from "./AppContext";
import { InviteScreen } from "./InviteScreen";
import { Onboarding } from "./Onboarding";

type User = Me["user"];
type Boot =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "invite" }
  | { kind: "onboarding"; user: User }
  | { kind: "ready"; user: User };

const NAV: readonly (readonly [View, string])[] = [["today", "오늘"], ["journal", "일지"], ["concepts", "개념"]];

const prefsOf = (u: User): Prefs => ({ infoLevel: u.infoLevel, panelPrefs: u.panelPrefs, undoSeconds: u.undoSeconds });

/** /api/me → 초대 코드(401) · 안내(처음) · 오늘 */
async function bootState(): Promise<Boot> {
  try {
    await initApi();
    const { user } = await api.me();
    return user.onboarded || localOnboarded(user.id) ? { kind: "ready", user } : { kind: "onboarding", user };
  } catch (e) {
    return isApiError(e, 401) ? { kind: "invite" } : { kind: "error", message: errorText(e) };
  }
}

export function BokgiApp() {
  const [boot, setBoot] = useState<Boot>({ kind: "loading" });
  const [view, setView] = useState<View>("today");
  const [visit, setVisit] = useState(0);   // 탭을 누를 때마다 화면을 새로
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const prefsSeq = useRef(0);   // 설정을 빠르게 두 번 저장하면 마지막 요청만 화면을 바꾼다

  const start = () => {
    bootState().then(setBoot);
  };
  const onMount = useEffectEvent(() => start());
  useEffect(() => { onMount(); }, []);

  /** 넷째 장에서 정보 수준을 저장한 뒤(응답 Me) 안내를 마친다 */
  const finishOnboarding = (user: User) => {
    setLocalOnboarded(user.id);   // 서버 기록이 늦거나 실패해도 다시 띄우지 않게
    logEvent("onboarding_done", { payload: { infoLevel: user.infoLevel } });   // 서버가 users.onboarded_at을 채운다(A 계약 보충)
    flushEvents();
    setView("today");
    setBoot({ kind: "ready", user });
  };

  const go = (v: View) => {
    setView(v);
    setVisit((n) => n + 1);
  };

  const onUnauthorized = () => setBoot({ kind: "invite" });

  const savePrefs = (next: Prefs) => {
    if (boot.kind !== "ready") return;
    const before = boot.user;
    const my = ++prefsSeq.current;
    setPrefsError(null);
    setBoot({ kind: "ready", user: { ...before, ...next } });   // 낙관적: 바로 바꾼다
    api.prefs({ infoLevel: next.infoLevel, panelPrefs: next.infoLevel === "custom" ? next.panelPrefs : undefined, undoSeconds: next.undoSeconds })
      .then((me) => {
        // 서버가 정규화한 값(프리셋과 같은 사용자 지정 → 그 수준)으로 맞춘다 — 보낸 값이 아니라 응답으로 그린다
        if (my === prefsSeq.current) setBoot((b) => (b.kind === "ready" ? { kind: "ready", user: me.user } : b));
      }, (e: unknown) => {
        if (my !== prefsSeq.current) return;
        if (isApiError(e, 401)) { onUnauthorized(); return; }
        setBoot((b) => (b.kind === "ready" ? { kind: "ready", user: { ...b.user, ...prefsOf(before) } } : b));
        setPrefsError(`정보 수준을 저장하지 못했어요. ${errorText(e)}`);
      });
  };

  const ctx: AppCtx = {
    onUnauthorized, navigate: go, savePrefs, prefsError,
    prefs: boot.kind === "ready" || boot.kind === "onboarding" ? prefsOf(boot.user) : DEFAULT_PREFS,
  };

  return (
    <AppContext value={ctx}>
      <main className="phone">
        <div id="view" className="screen" tabIndex={-1} role="region" aria-labelledby="screen-title">
          {boot.kind === "loading" && <Loading />}
          {boot.kind === "error" && <ErrorBox message={boot.message} onRetry={() => { setBoot({ kind: "loading" }); start(); }} />}
          {boot.kind === "invite" && <InviteScreen onDone={() => { setBoot({ kind: "loading" }); start(); }} />}
          {boot.kind === "onboarding" && <Onboarding onDone={finishOnboarding} />}
          {boot.kind === "ready" && (
            view === "today" ? <TodayFlow key={`today-${visit}`} />
              : view === "journal" ? <JournalScreen key={`journal-${visit}`} />
              : <ConceptsScreen key={`concepts-${visit}`} />
          )}
        </div>
        <nav id="nav" aria-label="주 메뉴" hidden={boot.kind !== "ready"}>
          {NAV.map(([v, t]) => (
            <button key={v} type="button" data-v={v} aria-current={view === v} onClick={() => go(v)}>{t}</button>
          ))}
        </nav>
      </main>
    </AppContext>
  );
}

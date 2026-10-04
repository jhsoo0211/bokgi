"use client";

/**
 * 오늘 탭의 흐름(프로토타입 showToday):
 *   공개를 기다리는 판단(되돌리기 창 중 떠났던 것, 한 장 더 포함) → 바로 공개
 *   → 오늘 세트에서 남은 카드 → 카드 스택(판단 전 화면)
 *   → 복습일이 된 개념(하루 2개까지) → 복습 문제
 *   → 오늘 끝(한 장 더: GET /api/session/today?extra=1 — A 계약 보충)
 * 판단 전 화면(prereveal/)과 공개 화면(reveal/)을 바꿔 끼우는 조정자다. 화면을 새로 고르기 전에 보내는 중인 판단을 기다린다.
 * 머리줄 '오늘 3/3 +k'는 세트에서 판단한 수 + Today.extraJudged, 오늘 끝의 '오늘 되짚은 개념'은 Today.conceptsToday(서버가 센다 —
 * 다른 기기에서도 맞다). '복습 i/n'은 계약에 오늘 푼 수가 없어 session.sessionReviews(서버 자료로 셀 수 있으면 그것, 아니면 이 탭에서 푼 수).
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useApp } from "@/components/app/AppContext";
import { ErrorBox, Loading } from "@/components/common/Status";
import type { SessionReviews } from "@/components/common/TodayTop";
import { CardScreen } from "@/components/prereveal/CardScreen";
import { RevealScreen } from "@/components/reveal/RevealScreen";
import { api, errorText, isApiError } from "@/lib/client/api";
import { logEvent } from "@/lib/client/events";
import { addDays } from "@/lib/client/format";
import { sessionReviews, settled } from "@/lib/client/session";
import type { ConceptListItem, PublicCase, Reveal, ReviewItem, Today } from "@/lib/client/types";
import { SESSION_REVIEWS_MAX } from "@/shared/contract";
import { DoneScreen } from "./DoneScreen";
import { ReviewScreen } from "./ReviewScreen";

type Screen =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "cards"; today: Today; judged: number; cards: PublicCase[]; extra: boolean; reviews: SessionReviews }
  | { kind: "reveal"; reveal: Reveal; judged: number; reviews: SessionReviews; nextLabel: string }
  | { kind: "review"; today: Today; judged: number; item: ReviewItem; concept: ConceptListItem | null; reviews: SessionReviews }
  | { kind: "done"; today: Today; judged: number; tomorrowReviews: number; reviews: SessionReviews };

const caseCache = new Map<string, PublicCase>();
async function getCase(id: string, version: number): Promise<PublicCase> {
  const hit = caseCache.get(`${id}@${version}`);
  if (hit) return hit;
  const c = await api.getCase(id);
  caseCache.set(`${c.id}@${c.version}`, c);
  return c;
}

/** 오늘 판단한 카드 수: 세트에서 판단한 것 + 오늘 '한 장 더'로 판단한 것(서버 extraJudged). 세트 응답(extra 아님)으로 센다 */
const judgedToday = (t: Today) => t.cards.filter((c) => c.judgmentId).length + t.extraJudged;
const NO_EXTRA = "지금은 한 장 더를 볼 수 없어요.";

async function revealScreen(judgmentId: string, today: Today, judged: number): Promise<Screen> {
  const reveal = await api.reveal(judgmentId);
  const remaining = today.cards.filter((c) => !c.judgmentId && c.caseId !== reveal.caseId).length;
  return { kind: "reveal", reveal, judged, reviews: sessionReviews(today), nextLabel: remaining > 0 ? "다음 카드 →" : "계속 →" };
}

/** 지금 오늘 탭에 보여 줄 화면을 고른다 */
async function nextScreen(): Promise<Screen> {
  await settled();
  const today = await api.today();
  const judged = judgedToday(today);
  const waiting = today.cards.find((c) => c.judgmentId && !c.revealed);
  if (waiting?.judgmentId) return revealScreen(waiting.judgmentId, today, judged);
  const left = today.cards.filter((c) => !c.judgmentId);
  if (left.length) {
    const cards = await Promise.all(left.map((c) => getCase(c.caseId, c.version)));
    return { kind: "cards", today, judged, cards, extra: false, reviews: sessionReviews(today) };
  }
  // 세트를 다 판단했으면: 공개 전에 떠난 '한 장 더'가 있는지(있으면 extra 응답의 첫 카드가 그것)
  const ex = await api.today({ extra: true });
  const pendingExtra = ex.cards.find((c) => c.judgmentId && !c.revealed);
  if (pendingExtra?.judgmentId) return revealScreen(pendingExtra.judgmentId, ex, judged);
  const list = (await api.concepts()).concepts;
  if (today.reviews.length) {
    const item = today.reviews[0];
    return { kind: "review", today, judged, item, concept: list.find((c) => c.id === item.conceptId) ?? null, reviews: sessionReviews(today, list) };
  }
  // 돌아올 이유 한 줄: 내일 복습할 개념 수(지난 것 포함, 하루 2개까지 — 내일 입장 띠와 같은 수)
  const tomorrow = addDays(today.date, 1);
  const tomorrowReviews = Math.min(SESSION_REVIEWS_MAX, list.filter((c) => c.dueOn !== null && c.dueOn <= tomorrow).length);
  return { kind: "done", today, judged, tomorrowReviews, reviews: sessionReviews(today, list) };
}

export function TodayFlow() {
  const { onUnauthorized } = useApp();
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const seq = useRef(0);   // 늦게 도착한 응답이 다른 화면을 덮어쓰지 않게

  const show = (my: number, p: Promise<Screen>) => {
    p.then((s) => { if (my === seq.current) setScreen(s); }, (e: unknown) => {
      if (my !== seq.current) return;
      if (isApiError(e, 401)) onUnauthorized();
      else setScreen({ kind: "error", message: errorText(e) });
    });
  };
  const go = () => show(++seq.current, nextScreen());

  const onFirst = useEffectEvent((p: Promise<Screen>) => show(++seq.current, p));
  useEffect(() => { onFirst(nextScreen()); }, []);

  const onFinalized = (judgmentId: string) => {
    if (screen.kind !== "cards") return;
    show(++seq.current, revealScreen(judgmentId, screen.today, screen.judged + 1));
  };

  const onMore = async (): Promise<string | null> => {
    if (screen.kind !== "done") return null;
    const { judged } = screen;
    const my = ++seq.current;
    try {
      const ex = await api.today({ extra: true });
      const c = ex.cards[0];
      if (!c) return NO_EXTRA;
      if (c.judgmentId) {   // 이미 판단해 둔 한 장 더(공개 전)
        if (!c.revealed) show(my, revealScreen(c.judgmentId, ex, judged));
        return c.revealed ? NO_EXTRA : null;
      }
      logEvent("extra_card", { caseId: c.caseId, caseVersion: c.version, payload: { today: judged } });
      const card = await getCase(c.caseId, c.version);
      if (my === seq.current) setScreen({ kind: "cards", today: ex, judged, cards: [card], extra: true, reviews: screen.reviews });
      return null;
    } catch (e) {
      if (isApiError(e, 401)) { onUnauthorized(); return null; }
      return errorText(e);
    }
  };

  switch (screen.kind) {
    case "loading":
      return <Loading />;
    case "error":
      return <ErrorBox message={screen.message} onRetry={go} />;
    case "cards":
      return <CardScreen key={screen.cards[0].id} cards={screen.cards} extra={screen.extra} today={screen.today} judged={screen.judged} reviews={screen.reviews} onFinalized={onFinalized} />;
    case "reveal":
      return <RevealScreen key={screen.reveal.judgmentId} reveal={screen.reveal} judged={screen.judged} reviews={screen.reviews} nextLabel={screen.nextLabel} onNext={go} />;
    case "review":
      return <ReviewScreen key={screen.item.conceptId} today={screen.today} item={screen.item} concept={screen.concept} reviews={screen.reviews} judged={screen.judged} onNext={go} />;
    case "done":
      return <DoneScreen today={screen.today} judged={screen.judged} tomorrowReviews={screen.tomorrowReviews} reviews={screen.reviews} onMore={onMore} />;
  }
}

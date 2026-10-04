import "server-only";
import { SESSION_CARDS, SESSION_REVIEWS_MAX, type Today } from "@/shared/contract";
import type { z } from "zod";
import type { AuthedUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { fromDbDate, localDate, toDbDate } from "@/lib/server/time";
import { loadLeadConcepts } from "./outcomes";
import { extraJudgedOn, pickSessionCases, revealedOn, streakFrom, uniqueBy } from "./rules";

/**
 * 오늘(05 §4·§7): 날짜는 서버가 users.tz(기본 APP_TZ)로 계산한다. 첫 조회에 미판단 live 카드 3장을 deck_order 순으로 골라
 * daily_sessions에 고정한다(동시에 두 번 조회해도 ON CONFLICT DO NOTHING 뒤 다시 읽으므로 같은 세트).
 * 세트·카드 목록은 결과 테이블을 읽지 않는다 — 카드 id·버전과 사용자의 판단 여부만 본다.
 *
 * extra=true(한 장 더): 세트를 다 판단했고 남은 카드가 있으면 cards에 세트 밖 카드 1장을 준다.
 * 이미 판단했지만 공개하지 않은 '한 장 더' 카드가 오늘 있으면 그 카드를 먼저 준다.
 *
 * extraJudged: 오늘(판단의 local_date) is_extra 판단 수.
 * conceptsToday: 오늘(사용자 tz) '공개한' 판단들의 1순위 학습 포인트 개념을 공개 순서로, 개념당 한 번 + 지금의 숙련도·복습일.
 *   학습 포인트는 공개 뒤 자료라 공개한 판단의 카드만 outcomes.loadLeadConcepts에 넘긴다(공개 전 카드의 개념은 나오지 않는다).
 */
type TodayT = z.infer<typeof Today>;

export async function getToday(user: AuthedUser, opts: { extra?: boolean; now?: Date } = {}): Promise<TodayT> {
  const prisma = db();
  const now = opts.now ?? new Date();
  const today = localDate(now, user.tz);
  const todayDb = toDbDate(today);

  const judged = await prisma.judgment.findMany({
    where: { userId: user.id },
    select: { id: true, caseId: true, caseVersion: true, revealedAt: true, localDate: true, isExtra: true, createdAt: true },
  });
  const byCase = new Map(judged.map((j) => [j.caseId, j]));
  const judgedSet = new Set(byCase.keys());

  const live = await prisma.case.findMany({ where: { status: "live" }, orderBy: { deckOrder: "asc" }, select: { id: true, version: true } });
  const liveVersion = new Map(live.map((c) => [c.id, c.version]));

  let session = await prisma.dailySession.findUnique({ where: { userId_localDate: { userId: user.id, localDate: todayDb } } });
  if (!session) {
    const pick = pickSessionCases(live.map((c) => c.id), judgedSet, SESSION_CARDS);
    if (pick.length > 0) {
      await prisma.dailySession.createMany({ data: [{ userId: user.id, localDate: todayDb, caseIds: pick }], skipDuplicates: true });
      session = await prisma.dailySession.findUnique({ where: { userId_localDate: { userId: user.id, localDate: todayDb } } });
    }
  }
  const setIds = (session?.caseIds ?? []).filter((id) => byCase.has(id) || liveVersion.has(id));

  const card = (caseId: string) => {
    const j = byCase.get(caseId);
    return { caseId, version: j ? j.caseVersion : (liveVersion.get(caseId) ?? 1), judgmentId: j ? j.id : null, revealed: Boolean(j?.revealedAt) };
  };
  const setCards = setIds.map(card);
  const setDone = setCards.every((c) => c.judgmentId !== null);
  const remaining = live.filter((c) => !judgedSet.has(c.id));
  const extraAllowed = setDone && remaining.length > 0;

  let cards = setCards;
  if (opts.extra) {
    const pendingExtra = judged
      .filter((j) => j.isExtra && !j.revealedAt && fromDbDate(j.localDate) === today && !setIds.includes(j.caseId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (pendingExtra) cards = [card(pendingExtra.caseId)];
    else cards = setDone && remaining.length > 0 ? [card(remaining[0].id)] : [];
  }

  const [reviewsDoneToday, conceptsKnown, conceptsTotal] = await Promise.all([
    prisma.quizAttempt.count({ where: { userId: user.id, via: "review", localDate: todayDb } }),
    prisma.conceptProgress.count({ where: { userId: user.id, state: "known", concept: { active: true } } }),
    prisma.concept.count({ where: { active: true } }),
  ]);
  const reviewSlots = Math.max(0, SESSION_REVIEWS_MAX - reviewsDoneToday);
  const due =
    reviewSlots === 0
      ? []
      : await prisma.conceptProgress.findMany({
          where: { userId: user.id, dueOn: { lte: todayDb }, concept: { active: true } },
          orderBy: [{ dueOn: "asc" }, { conceptId: "asc" }],
          take: reviewSlots,
          include: { concept: { select: { title: true } } },
        });
  const reviews = due.map((p) => ({ conceptId: p.conceptId, title: p.concept.title, dueOn: p.dueOn ? fromDbDate(p.dueOn) : today }));

  return {
    date: today,
    streak: streakFrom(judged.map((j) => fromDbDate(j.localDate)), today),
    entry: {
      conceptsKnown,
      conceptsTotal,
      reviewsDue: reviews.length,
      cardsLeft: setCards.filter((c) => c.judgmentId === null).length,
    },
    cards,
    extraAllowed,
    reviews,
    extraJudged: extraJudgedOn(judged.map((j) => ({ isExtra: j.isExtra, localDate: fromDbDate(j.localDate) })), today),
    conceptsToday: await conceptsMetToday(user, judged, today),
  };
}

/** 오늘 공개한 판단의 1순위 개념(공개 순서, 개념당 한 번)과 지금의 숙련도·복습일. 공개 전 판단은 처음부터 걸러 넘기지 않는다. */
async function conceptsMetToday(
  user: AuthedUser,
  judged: { caseId: string; caseVersion: number; revealedAt: Date | null }[],
  today: string,
): Promise<TodayT["conceptsToday"]> {
  const revealed = revealedOn(judged, today, user.tz);
  if (revealed.length === 0) return [];
  const lead = await loadLeadConcepts(revealed.map((j) => ({ caseId: j.caseId, version: j.caseVersion })));
  const met = uniqueBy(
    revealed.flatMap((j) => {
      const c = lead.get(`${j.caseId}:${j.caseVersion}`);
      return c ? [c] : [];
    }),
    (c) => c.conceptId,
  );
  if (met.length === 0) return [];
  const progress = await db().conceptProgress.findMany({
    where: { userId: user.id, conceptId: { in: met.map((c) => c.conceptId) } },
    select: { conceptId: true, state: true, dueOn: true },
  });
  const byId = new Map(progress.map((p) => [p.conceptId, p]));
  return met.map((c) => {
    const p = byId.get(c.conceptId);
    return { conceptId: c.conceptId, title: c.title, state: p?.state ?? "new", dueOn: p?.dueOn ? fromDbDate(p.dueOn) : null };
  });
}

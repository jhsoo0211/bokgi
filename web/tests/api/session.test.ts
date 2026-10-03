import { beforeAll, describe, expect, it } from "vitest";
import { Today } from "@/shared/contract";
import { POST as quiz } from "@/app/api/concepts/[id]/quiz/route";
import { POST as createJudgment } from "@/app/api/judgments/route";
import { GET as today } from "@/app/api/session/today/route";
import { db } from "@/lib/server/db";
import { addDays, localDate, toDbDate } from "@/lib/server/time";
import { getToday } from "@/server/session";
import { C001, C002, C003, CANARY_CASE, call, createUser, judgmentBody, resetUserData, uuid } from "./helpers";

beforeAll(resetUserData);

const seoulToday = () => localDate(new Date(), "Asia/Seoul");

describe("GET /api/session/today", () => {
  it("첫 조회에 미판단 카드 3장을 덱 순서로 고정하고, 다시 조회해도 같다", async () => {
    const u = await createUser("오늘1");
    const r1 = await call<Today>(today, { cookie: u.cookie });
    expect(r1.status).toBe(200);
    expect(Today.safeParse(r1.json).success).toBe(true);
    expect(r1.json.date).toBe(seoulToday());
    expect(r1.json.cards.map((c) => c.caseId)).toEqual([CANARY_CASE, C001, C002]);
    expect(r1.json.cards.every((c) => c.judgmentId === null && !c.revealed && c.version === 1)).toBe(true);
    expect(r1.json.entry).toEqual({ conceptsKnown: 0, conceptsTotal: 4, reviewsDue: 0, cardsLeft: 3 });
    expect(r1.json.streak).toBe(0);
    expect(r1.json.extraAllowed).toBe(false);
    const r2 = await call<Today>(today, { cookie: u.cookie });
    expect(r2.json.cards).toEqual(r1.json.cards);
    expect(await db().dailySession.count({ where: { userId: u.userId } })).toBe(1);
  });

  it("동시에 처음 조회해도 같은 세트, daily_sessions 1행", async () => {
    const u = await createUser("오늘2");
    const rs = await Promise.all([1, 2, 3].map(() => call<Today>(today, { cookie: u.cookie })));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(new Set(rs.map((r) => JSON.stringify(r.json.cards))).size).toBe(1);
    expect(await db().dailySession.count({ where: { userId: u.userId } })).toBe(1);
  });

  it("세트를 다 판단하면 한 장 더 허용, ?extra=1은 세트 밖 카드 1장", async () => {
    const u = await createUser("오늘3");
    await call(today, { cookie: u.cookie });
    for (const id of [CANARY_CASE, C001, C002]) await call(createJudgment, { cookie: u.cookie, body: judgmentBody(id) });
    const after = await call<Today>(today, { cookie: u.cookie });
    expect(after.json.cards.every((c) => c.judgmentId !== null)).toBe(true);
    expect(after.json.entry.cardsLeft).toBe(0);
    expect(after.json.extraAllowed).toBe(true);
    expect(after.json.streak).toBe(1);
    const extra = await call<Today>(today, { cookie: u.cookie, path: "/api/session/today?extra=1" });
    expect(extra.json.cards).toEqual([{ caseId: C003, version: 1, judgmentId: null, revealed: false }]);
    // 한 장 더를 판단하면 남은 카드가 없다
    await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C003, { isExtra: true }) });
    const done = await call<Today>(today, { cookie: u.cookie });
    expect(done.json.extraAllowed).toBe(false);
    expect(done.json.cards).toHaveLength(3);
  });

  it("스트릭: 판단한 날이 연속된 수(사용자 tz의 날짜)", async () => {
    const u = await createUser("스트릭");
    const t = seoulToday();
    await db().judgment.create({ data: { ...rawJudgment(u.userId, C002), localDate: toDbDate(addDays(t, -1)) } });
    await db().judgment.create({ data: { ...rawJudgment(u.userId, C003), localDate: toDbDate(addDays(t, -2)) } });
    let r = await call<Today>(today, { cookie: u.cookie });
    expect(r.json.streak).toBe(2); // 오늘 아직 안 했으면 어제까지
    await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001) });
    r = await call<Today>(today, { cookie: u.cookie });
    expect(r.json.streak).toBe(3);
  });

  it("tz가 다른 사용자는 그 tz로 하루를 정한다", async () => {
    const u = await createUser("엘에이");
    await db().user.update({ where: { id: u.userId }, data: { tz: "America/Los_Angeles" } });
    const user = { id: u.userId, nickname: "엘에이", tz: "America/Los_Angeles", onboardedAt: null, tokenHash: "" };
    const instant = new Date("2026-10-03T15:30:00Z"); // 서울 10/4 00:30, LA 10/3 08:30
    const r = await getToday(user, { now: instant });
    expect(r.date).toBe("2026-10-03");
    const seoul = await getToday({ ...user, tz: "Asia/Seoul" }, { now: instant });
    expect(seoul.date).toBe("2026-10-04");
  });

  it("복습: 기한이 된 개념(지난 것부터) 최대 2개, 오늘 복습 2개를 풀면 0", async () => {
    const u = await createUser("복습");
    const t = seoulToday();
    const rows = [
      { conceptId: "base-rate", dueOn: addDays(t, -3) },
      { conceptId: "abs-vs-relative", dueOn: addDays(t, -1) },
      { conceptId: "debt-and-cycle", dueOn: t },
      { conceptId: "growth-vs-valuation", dueOn: addDays(t, 2) },
    ];
    for (const r of rows) await db().conceptProgress.create({ data: { userId: u.userId, conceptId: r.conceptId, state: "learning", level: 1, dueOn: toDbDate(r.dueOn), quizCorrect: 1, quizTotal: 1 } });
    const r1 = await call<Today>(today, { cookie: u.cookie });
    expect(r1.json.reviews.map((r) => r.conceptId)).toEqual(["base-rate", "abs-vs-relative"]);
    expect(r1.json.reviews[0]).toMatchObject({ title: "기저확률과 노이즈", dueOn: addDays(t, -3) });
    expect(r1.json.entry.reviewsDue).toBe(2);

    await call(quiz, { cookie: u.cookie, params: { id: "base-rate" }, body: { quizId: "base-rate-q1", optionIndex: 1, clientAttemptId: uuid(), via: "review" } });
    const r2 = await call<Today>(today, { cookie: u.cookie });
    expect(r2.json.reviews.map((r) => r.conceptId)).toEqual(["abs-vs-relative"]);
    await call(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: { quizId: "abs-vs-relative-q1", optionIndex: 0, clientAttemptId: uuid(), via: "review" } });
    const r3 = await call<Today>(today, { cookie: u.cookie });
    expect(r3.json.reviews).toEqual([]);
    expect(r3.json.entry.reviewsDue).toBe(0);
  });

  it("로그인하지 않으면 401", async () => {
    expect((await call(today, {})).status).toBe(401);
  });
});

function rawJudgment(userId: string, caseId: string) {
  return {
    userId,
    caseId,
    caseVersion: 1,
    keyEvidenceId: "ev-rev",
    keyEvidence: "매출",
    direction: "outperform" as const,
    confidence: 3,
    localDate: toDbDate(seoulToday()),
  };
}

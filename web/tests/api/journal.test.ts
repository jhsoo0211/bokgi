import { beforeAll, describe, expect, it } from "vitest";
import { Journal } from "@/shared/contract";
import type { z } from "zod";
type JournalT = z.infer<typeof Journal>;

import { GET as journal } from "@/app/api/journal/route";
import { POST as createJudgment } from "@/app/api/judgments/route";
import { POST as reveal } from "@/app/api/judgments/[id]/reveal/route";
import { db } from "@/lib/server/db";
import { addDays, localDate, monthOf, toDbDate } from "@/lib/server/time";
import { C001, C002, call, createUser, judgmentBody, resetUserData, uuid } from "./helpers";

beforeAll(resetUserData);

const today = () => localDate(new Date(), "Asia/Seoul");

describe("GET /api/journal", () => {
  it("결과 대기 행은 판단 전 값만(company·ticker·result = null), 공개 뒤 행은 결과까지", async () => {
    const u = await createUser("일지1");
    const a = await call<{ judgmentId: string }>(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { recognized: true }) });
    await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C002) });
    let r = await call<JournalT>(journal, { cookie: u.cookie });
    expect(r.status).toBe(200);
    expect(Journal.safeParse(r.json).success).toBe(true);
    expect(r.json.count).toBe(2);
    for (const it of r.json.items) {
      expect(it).toMatchObject({ revealed: false, companyName: null, ticker: null, result: null });
    }
    expect(r.text).not.toMatch(/어도비|ADBE|마이크론|"MU"|2023-09-15|2022-09-30/);

    await call(reveal, { method: "POST", cookie: u.cookie, params: { id: a.json.judgmentId } });
    r = await call<JournalT>(journal, { cookie: u.cookie });
    const shown = r.json.items.find((i) => i.judgmentId === a.json.judgmentId);
    expect(shown).toMatchObject({ revealed: true, companyName: "어도비", ticker: "ADBE", result: { relativePp: -2.3, state: "behind", hit: false }, recognized: true, keyEvidence: "매출 +23%", sectorPublic: "소프트웨어", sizeBucket: "대형" });
    const waiting = r.json.items.find((i) => i.judgmentId !== a.json.judgmentId);
    expect(waiting).toMatchObject({ revealed: false, companyName: null, ticker: null, result: null });
    expect(JSON.stringify(waiting)).not.toMatch(/마이크론|"MU"/);
  });

  it("최신순", async () => {
    const u = await createUser("일지2");
    await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001) });
    await new Promise((r) => setTimeout(r, 10));
    await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C002) });
    const r = await call<JournalT>(journal, { cookie: u.cookie });
    expect(r.json.items[0].createdAt >= r.json.items[1].createdAt).toBe(true);
  });

  it("연습 달력: 판단한 날 점, 복습 예정(지난 것은 오늘로), 달 파라미터", async () => {
    const u = await createUser("일지3");
    const t = today();
    await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001) });
    await db().conceptProgress.create({ data: { userId: u.userId, conceptId: "base-rate", state: "learning", level: 0, dueOn: toDbDate(addDays(t, -5)) } });
    const r = await call<JournalT>(journal, { cookie: u.cookie });
    expect(r.json.calendar.month).toBe(monthOf(t));
    const day = r.json.calendar.days.find((d) => d.date === t);
    expect(day).toEqual({ date: t, practiced: true, due: true });
    expect(r.json.calendar.practicedDays).toBe(1);
    expect(r.json.calendar.reviewsDue).toBe(1);
    const other = await call<JournalT>(journal, { cookie: u.cookie, path: "/api/journal?month=2020-01" });
    expect(other.json.calendar.month).toBe("2020-01");
    expect(other.json.calendar.days).toHaveLength(31);
    expect(other.json.calendar.practicedDays).toBe(0);
    const bad = await call(journal, { cookie: u.cookie, path: "/api/journal?month=2020-13" });
    expect(bad.status).toBe(422);
  });

  it("통계: 공개된 판단 20장 미만이면 잠김(문장 없음)", async () => {
    const u = await createUser("일지4");
    const r = await call<JournalT>(journal, { cookie: u.cookie });
    expect(r.json.stats).toEqual({ locked: true, unlockAt: 20, insights: [], calibrationNote: null });
  });

  it("20장이 넘으면 인사이트 문장(횟수만, 퍼센트 없음)과 보정 문장", async () => {
    const u = await createUser("일지5");
    const labels = ["매출 +23%", "부채비율 88%", "PER 38 vs 27"];
    for (let i = 0; i < 24; i++) {
      // 통계 시험용 카드(retired라 오늘 덱에는 들어가지 않는다)
      const caseId = uuid();
      await db().case.create({
        data: {
          id: caseId, version: 1, yearPublic: 2020, sectorPublic: "통계", sizeBucket: "중형", horizonDays: 180, difficulty: 2, status: "retired", deckOrder: 1000 + i,
          evidenceOptions: [{ id: "a", label: "a", why: "a", panel: "numbers" }, { id: "b", label: "b", why: "b", panel: "numbers" }, { id: "c", label: "c", why: "c", panel: "numbers" }],
          riskOptions: [{ id: "x", label: "x" }, { id: "y", label: "y" }],
        },
      });
      await db().caseOutcome.create({
        data: { caseId, version: 1, companyName: `통계회사${i}`, ticker: `ST${i}`, startDate: toDbDate("2020-01-02"), endDate: toDbDate("2020-07-01"), period: "2020 Q1 → 2020 Q3", returnPct: 1, benchReturnPct: 1, benchName: "지수", pricePath: Array(14).fill(100), benchPath: Array(14).fill(100), sources: [] },
      });
      const state = (["ahead", "behind", "even"] as const)[i % 3];
      await db().judgment.create({
        data: {
          userId: u.userId, caseId, caseVersion: 1, localDate: toDbDate(today()), keyEvidenceId: "a", keyEvidence: labels[i % 3], direction: "outperform",
          confidence: i % 2 === 0 ? 5 : 4, recognized: i % 4 === 0, revealedAt: new Date(),
          outcome: { create: { relativePp: state === "ahead" ? 5 : state === "behind" ? -5 : 0.5, state, hit: state === "even" ? null : state === "ahead" } },
        },
      });
    }
    const r = await call<JournalT>(journal, { cookie: u.cookie });
    expect(r.json.stats.locked).toBe(false);
    expect(r.json.stats.insights.length).toBeGreaterThan(0);
    expect(r.json.stats.insights.length).toBeLessThanOrEqual(3);
    for (const s of r.json.stats.insights) expect(s).not.toMatch(/[%％]/);
    expect(r.json.stats.insights[0]).toMatch(/^확신도 [45]를 준 판단 \d+번 중 시장보다 앞선 것은 \d+번이었어요\.$/);
    expect(r.json.stats.calibrationNote).not.toBeNull();
    expect(r.json.stats.calibrationNote).not.toMatch(/[%％]/);
    expect(r.text).not.toMatch(/적중률|hitRate/);
  });
});

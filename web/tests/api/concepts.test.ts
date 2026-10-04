import { beforeAll, describe, expect, it } from "vitest";
import { ConceptList, QuizResult } from "@/shared/contract";
import type { z } from "zod";
type ConceptListT = z.infer<typeof ConceptList>;
type QuizResultT = z.infer<typeof QuizResult>;

import { GET as listConcepts } from "@/app/api/concepts/route";
import { POST as quiz } from "@/app/api/concepts/[id]/quiz/route";
import { db } from "@/lib/server/db";
import { addDays, fromDbDate, localDate, toDbDate } from "@/lib/server/time";
import { call, createUser, resetUserData, uuid } from "./helpers";

beforeAll(resetUserData);

const t = () => localDate(new Date(), "Asia/Seoul");
const body = (over: Record<string, unknown> = {}) => ({ quizId: "abs-vs-relative-q1", optionIndex: 1, clientAttemptId: uuid(), via: "concepts", ...over });

describe("GET /api/concepts", () => {
  it("개념 전체 + 상태 + 문제(정답 없음)", async () => {
    const u = await createUser("개념1");
    const r = await call<ConceptListT>(listConcepts, { cookie: u.cookie });
    expect(r.status).toBe(200);
    expect(ConceptList.safeParse(r.json).success).toBe(true);
    // 갈래(결과 → 숫자 → 그때 → 내 판단) → 갈래 안 순서
    expect(r.json.concepts.map((c) => c.id)).toEqual(["abs-vs-relative", "base-rate", "growth-vs-valuation", "debt-and-cycle"]);
    expect(r.json.concepts[0]).toMatchObject({ state: "new", level: 0, dueOn: null, linkSentence: null, quiz: { quizId: "abs-vs-relative-q1" } });
    expect(r.text).not.toMatch(/answerIndex|answer_index/);
  });

  it("order = 갈래 안 순서(개념 파일의 나열 순서, 1부터)", async () => {
    const u = await createUser("개념길");
    const r = await call<ConceptListT>(listConcepts, { cookie: u.cookie });
    // 예시 개념 파일: abs-vs-relative(결과) · growth-vs-valuation(숫자) · debt-and-cycle(숫자) · base-rate(결과)
    expect(r.json.concepts.map((c) => [c.id, c.branch, c.order])).toEqual([
      ["abs-vs-relative", "outcome", 1],
      ["base-rate", "outcome", 2],
      ["growth-vs-valuation", "numbers", 1],
      ["debt-and-cycle", "numbers", 2],
    ]);
    const rows = await db().concept.findMany({ select: { id: true, ord: true } });
    for (const c of r.json.concepts) expect(c.order).toBe(rows.find((x) => x.id === c.id)?.ord);
  });
});

describe("POST /api/concepts/{id}/quiz", () => {
  it("서버 채점: 정답이면 level 0·내일·학습 중", async () => {
    const u = await createUser("퀴즈1");
    const r = await call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: body() });
    expect(r.status).toBe(200);
    expect(QuizResult.safeParse(r.json).success).toBe(true);
    expect(r.json).toEqual({ correct: true, answerIndex: 1, explanation: "맞아요. 시장 대비로 읽으면 시장보다 뒤진 결과예요.", level: 0, state: "learning", nextDueOn: addDays(t(), 1) });
  });

  it("오답이면 level 0·복습 필요, 해설에 정답", async () => {
    const u = await createUser("퀴즈2");
    const r = await call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: body({ optionIndex: 0 }) });
    expect(r.json).toMatchObject({ correct: false, level: 0, state: "review", nextDueOn: addDays(t(), 1) });
    expect(r.json.explanation).toContain("정답: ‘하회 — 시장을 못 따라갔으니까’");
  });

  it("answerIndex는 저장된 정답 번호(맞혀도·틀려도·재전송에도 같다)", async () => {
    const u = await createUser("퀴즈정답");
    for (const quizId of ["abs-vs-relative-q1", "abs-vs-relative-q2"]) {
      const stored = await db().quiz.findUniqueOrThrow({ where: { id: quizId }, select: { answerIndex: true } });
      for (const optionIndex of [0, 1]) {
        const b = body({ quizId, optionIndex });
        const r = await call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: b });
        expect(r.status).toBe(200);
        expect(r.json.answerIndex).toBe(stored.answerIndex);
        expect(r.json.correct).toBe(optionIndex === stored.answerIndex);
        const replay = await call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: b });
        expect(replay.json).toEqual(r.json);
      }
    }
  });

  it("같은 clientAttemptId는 같은 응답(멱등), 시도·진행은 한 번만", async () => {
    const u = await createUser("퀴즈3");
    const b = body();
    const r1 = await call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: b });
    const r2 = await call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: b });
    expect(r2.json).toEqual(r1.json);
    expect(await db().quizAttempt.count({ where: { userId: u.userId } })).toBe(1);
    const p = await db().conceptProgress.findUniqueOrThrow({ where: { userId_conceptId: { userId: u.userId, conceptId: "abs-vs-relative" } } });
    expect(p).toMatchObject({ quizTotal: 1, quizCorrect: 1 });
  });

  it("같은 시도를 동시에 보내도 1행", async () => {
    const u = await createUser("퀴즈4");
    const b = body();
    const rs = await Promise.all([1, 2, 3].map(() => call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: b })));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(new Set(rs.map((r) => JSON.stringify(r.json))).size).toBe(1);
    expect(await db().quizAttempt.count({ where: { userId: u.userId } })).toBe(1);
    const p = await db().conceptProgress.findUniqueOrThrow({ where: { userId_conceptId: { userId: u.userId, conceptId: "abs-vs-relative" } } });
    expect(p.quizTotal).toBe(1);
  });

  it("다른 시도를 동시에 보내면 둘 다 반영된다(진행 갱신을 잃지 않는다)", async () => {
    const u = await createUser("퀴즈5");
    await Promise.all([body(), body({ quizId: "abs-vs-relative-q2", optionIndex: 0 })].map((b) => call(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: b })));
    const p = await db().conceptProgress.findUniqueOrThrow({ where: { userId_conceptId: { userId: u.userId, conceptId: "abs-vs-relative" } } });
    expect(p).toMatchObject({ quizTotal: 2, quizCorrect: 2, state: "known" });
  });

  it("기한 전 정답은 level 유지, 기한이 된 날 정답은 level+1", async () => {
    const u = await createUser("퀴즈6");
    const key = { userId_conceptId: { userId: u.userId, conceptId: "base-rate" } };
    await db().conceptProgress.create({ data: { userId: u.userId, conceptId: "base-rate", state: "learning", level: 1, dueOn: toDbDate(addDays(t(), 2)), quizCorrect: 1, quizTotal: 1 } });
    const early = await call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "base-rate" }, body: body({ quizId: "base-rate-q1", optionIndex: 1 }) });
    expect(early.json).toMatchObject({ correct: true, level: 1, nextDueOn: addDays(t(), 2) });
    await db().conceptProgress.update({ where: key, data: { dueOn: toDbDate(t()) } });
    const due = await call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "base-rate" }, body: body({ quizId: "base-rate-q2", optionIndex: 0 }) });
    expect(due.json).toMatchObject({ correct: true, level: 2, nextDueOn: addDays(t(), 7) });
    const wrong = await call<QuizResultT>(quiz, { cookie: u.cookie, params: { id: "base-rate" }, body: body({ quizId: "base-rate-q1", optionIndex: 0 }) });
    expect(wrong.json).toMatchObject({ correct: false, level: 0, nextDueOn: addDays(t(), 1) });
    const p = await db().conceptProgress.findUniqueOrThrow({ where: key });
    expect(fromDbDate(p.dueOn as Date)).toBe(addDays(t(), 1));
  });

  it("목록의 상태·복습 예정에 반영된다", async () => {
    const u = await createUser("퀴즈7");
    await call(quiz, { cookie: u.cookie, params: { id: "debt-and-cycle" }, body: body({ quizId: "debt-and-cycle-q1", optionIndex: 0 }) });
    const r = await call<ConceptListT>(listConcepts, { cookie: u.cookie });
    const c = r.json.concepts.find((x) => x.id === "debt-and-cycle");
    expect(c).toMatchObject({ state: "learning", level: 0, dueOn: addDays(t(), 1), quiz: { quizId: "debt-and-cycle-q2" } });
  });

  it("다른 개념의 문제 404, 보기 번호 범위 밖 422, 시도 id를 다른 개념에 재사용하면 409", async () => {
    const u = await createUser("퀴즈8");
    expect((await call(quiz, { cookie: u.cookie, params: { id: "base-rate" }, body: body() })).status).toBe(404);
    expect((await call(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: body({ optionIndex: 3 }) })).status).toBe(422);
    expect((await call(quiz, { cookie: u.cookie, params: { id: "NO SUCH" }, body: body() })).status).toBe(404);
    const b = body();
    await call(quiz, { cookie: u.cookie, params: { id: "abs-vs-relative" }, body: b });
    const reuse = await call(quiz, { cookie: u.cookie, params: { id: "base-rate" }, body: { ...b, quizId: "base-rate-q1" } });
    expect(reuse.status).toBe(409);
  });
});

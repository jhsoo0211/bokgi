/**
 * 카나리 시험(ADR-0001 결정 3, 05 §8): 가짜 회사명·티커·날짜·수익률을 가진 카드(tests/fixtures/canary)로
 * 판단 전 응답 원문(카드·오늘·결과 대기 일지·질문자·개념 목록)과 오류 본문에서 카나리 값을 찾는다 → 0건이어야 한다.
 * 필드명이 아니라 값을 찾는다. 대조군: 공개 응답에는 카나리 값이 나와야 한다(시험이 실제로 값을 잡는지 확인).
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Journal, Reveal, Today } from "@/shared/contract";
import type { z } from "zod";
type JournalT = z.infer<typeof Journal>;
type TodayT = z.infer<typeof Today>;
import { POST as explain } from "@/app/api/ai/explain/route";
import { POST as question } from "@/app/api/ai/question/route";
import { GET as getCase } from "@/app/api/cases/[id]/route";
import { GET as listConcepts } from "@/app/api/concepts/route";
import { GET as journal } from "@/app/api/journal/route";
import { POST as createJudgment } from "@/app/api/judgments/route";
import { POST as reveal } from "@/app/api/judgments/[id]/reveal/route";
import { PUT as selfCheck } from "@/app/api/judgments/[id]/self-check/route";
import { POST as reports } from "@/app/api/reports/route";
import { GET as today } from "@/app/api/session/today/route";
import { CANARY_CASE, CANARY_STRINGS, call, createUser, expectNoCanary, judgmentBody, resetUserData, uuid } from "./helpers";

beforeAll(resetUserData);

/** 카나리 카드의 1순위 학습 포인트(공개 뒤 자료) — 공개 전 일지·오늘 응답에 나오면 안 된다 */
const CANARY_CONCEPT_ID = "abs-vs-relative";
const CANARY_CONCEPT_TITLE = "절대수익과 시장 대비";

describe("카나리: 판단 전 응답 어디에도 결과급 값이 없다", () => {
  it("GET /api/cases/{카나리}", async () => {
    const u = await createUser("카나리1");
    const r = await call(getCase, { cookie: u.cookie, params: { id: CANARY_CASE } });
    expect(r.status).toBe(200);
    expectNoCanary(r.text, "GET /api/cases");
    expect(r.text).not.toMatch(/CANARY-제품|카나리 지수/);
  });

  it("GET /api/session/today (카나리 카드가 세트에 있을 때, 한 장 더 포함)", async () => {
    const u = await createUser("카나리2");
    const r = await call<{ cards: { caseId: string }[] }>(today, { cookie: u.cookie });
    expect(r.json.cards.map((c) => c.caseId)).toContain(CANARY_CASE);
    expectNoCanary(r.text, "GET /api/session/today");
    const extra = await call(today, { cookie: u.cookie, path: "/api/session/today?extra=1" });
    expectNoCanary(extra.text, "GET /api/session/today?extra=1");
  });

  it("GET /api/journal — 결과 대기 행(학습 포인트 개념 제목도 없다)", async () => {
    const u = await createUser("카나리3");
    const j = await call<{ judgmentId: string }>(createJudgment, { cookie: u.cookie, body: judgmentBody(CANARY_CASE, { infoLevel: "basic", hiddenGroups: ["marketLine"] }) });
    expect(j.status).toBe(201);
    expectNoCanary(j.text, "POST /api/judgments");
    const r = await call<JournalT>(journal, { cookie: u.cookie });
    expect(r.status).toBe(200);
    expectNoCanary(r.text, "GET /api/journal(결과 대기)");
    expect(r.json.items[0]).toMatchObject({ revealed: false, companyName: null, ticker: null, result: null, conceptTitle: null, infoLevel: "basic" });
    expect(r.text).not.toContain(CANARY_CONCEPT_TITLE);
    expect(r.text).not.toContain(CANARY_CONCEPT_ID);
  });

  it("GET /api/session/today — 공개 전에는 conceptsToday가 비어 있다(카나리 학습 포인트가 새지 않는다)", async () => {
    const u = await createUser("카나리9");
    await call(today, { cookie: u.cookie });
    const j = await call<{ judgmentId: string }>(createJudgment, { cookie: u.cookie, body: judgmentBody(CANARY_CASE) });
    expect(j.status).toBe(201);
    for (const path of ["/api/session/today", "/api/session/today?extra=1"]) {
      const r = await call<TodayT>(today, { cookie: u.cookie, path });
      expect(r.status).toBe(200);
      expect(r.json.conceptsToday).toEqual([]);
      expectNoCanary(r.text, `GET ${path}(판단 뒤 공개 전)`);
      expect(r.text).not.toContain(CANARY_CONCEPT_TITLE);
      expect(r.text).not.toContain(CANARY_CONCEPT_ID);
    }
  });

  it("POST /api/ai/question — 모든 칩 × 확신도 1~5, 같은 카드 반복 질문까지", async () => {
    const u = await createUser("카나리4");
    for (const evidenceId of ["ev-a", "ev-b", "ev-c", "ev-d"]) {
      for (const confidence of [1, 2, 3, 4, 5]) {
        const r = await call(question, { cookie: u.cookie, body: { caseId: CANARY_CASE, evidenceId, confidence } });
        expect(r.status).toBe(200);
        expectNoCanary(r.text, `POST /api/ai/question(${evidenceId}, ${confidence})`);
      }
    }
  });

  it("GET /api/concepts — 사례 연결 문장(공개 뒤 자료)은 목록에 없다", async () => {
    const u = await createUser("카나리5");
    const r = await call(listConcepts, { cookie: u.cookie });
    expectNoCanary(r.text, "GET /api/concepts");
  });

  it("오류 본문", async () => {
    const owner = await createUser("카나리6");
    const other = await createUser("카나리7");
    const j = await call<{ judgmentId: string }>(createJudgment, { cookie: owner.cookie, body: judgmentBody(CANARY_CASE) });
    const id = j.json.judgmentId;
    const errors = [
      await call(createJudgment, { cookie: other.cookie, body: judgmentBody(CANARY_CASE, { keyEvidenceId: "ev-zzz" }) }),
      await call(createJudgment, { cookie: other.cookie, body: judgmentBody(CANARY_CASE, { caseVersion: 7 }) }),
      await call(createJudgment, { cookie: other.cookie, body: { ...judgmentBody(CANARY_CASE), companyName: "x" } }),
      await call(createJudgment, { body: judgmentBody(CANARY_CASE) }),
      await call(reveal, { method: "POST", cookie: other.cookie, params: { id } }),
      await call(selfCheck, { method: "PUT", cookie: owner.cookie, params: { id }, body: { value: "o" } }),
      await call(explain, { cookie: owner.cookie, body: { judgmentId: id } }),
      await call(question, { cookie: owner.cookie, body: { caseId: CANARY_CASE, evidenceId: "ev-zzz", confidence: 3 } }),
      await call(getCase, { cookie: owner.cookie, params: { id: uuid() } }),
      await call(getCase, { cookie: owner.cookie, params: { id: "CNRY" } }),
      await call(journal, { cookie: owner.cookie, path: "/api/journal?month=2099-01-02" }),
      await call(reports, { cookie: owner.cookie, body: { clientReportId: uuid(), caseId: CANARY_CASE, caseVersion: 5, category: "other", note: null } }),
      await call(reports, { cookie: owner.cookie, body: { caseId: CANARY_CASE, caseVersion: 1, category: "other", note: null } }),
      await call(reveal, { method: "POST", cookie: owner.cookie, params: { id }, origin: "https://other.ifsave.com" }),
    ];
    for (const e of errors) {
      expect(e.status).toBeGreaterThanOrEqual(400);
      expectNoCanary(e.text, `오류 ${e.status}`);
      expect(Object.keys(e.json as object)).toEqual(["error"]);
    }
  });

  it("대조군: 공개 응답에는 카나리 값이 나온다(시험이 값을 실제로 잡는다)", async () => {
    const u = await createUser("카나리8");
    const j = await call<{ judgmentId: string }>(createJudgment, { cookie: u.cookie, body: judgmentBody(CANARY_CASE) });
    const r = await call<Reveal>(reveal, { method: "POST", cookie: u.cookie, params: { id: j.json.judgmentId } });
    expect(r.status).toBe(200);
    for (const s of CANARY_STRINGS) expect(r.text).toContain(s);
    // 공개 뒤에는 일지에도 회사명·학습 포인트 개념 제목이 나온다
    const after = await call<JournalT>(journal, { cookie: u.cookie });
    expect(after.text).toContain("CANARY-회사");
    expect(after.json.items[0]).toMatchObject({ revealed: true, conceptTitle: CANARY_CONCEPT_TITLE });
    // 오늘 만난 개념에도 들어간다(공개한 뒤에만)
    const t = await call<TodayT>(today, { cookie: u.cookie });
    expect(t.json.conceptsToday.map((c) => c.conceptId)).toEqual([CANARY_CONCEPT_ID]);
  });
});

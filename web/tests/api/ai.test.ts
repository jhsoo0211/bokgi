import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Explain, Question, type Reveal } from "@/shared/contract";
import type { z } from "zod";
type QuestionT = z.infer<typeof Question>;
type ExplainT = z.infer<typeof Explain>;

import { POST as explain } from "@/app/api/ai/explain/route";
import { POST as question } from "@/app/api/ai/question/route";
import { POST as createJudgment } from "@/app/api/judgments/route";
import { POST as reveal } from "@/app/api/judgments/[id]/reveal/route";
import { db } from "@/lib/server/db";
import { invalidateLeakDictionary } from "@/server/outcomes";
import { C001, C002, C003, call, createUser, judgmentBody, resetUserData } from "./helpers";

beforeAll(resetUserData);

const AI_ENV = {
  AI_ENABLED: "true",
  AI_API_KEY: "test-key",
  AI_BASE_URL: "https://llm.invalid/v1",
  AI_MODEL: "test-model",
  AI_DAILY_CALL_CAP: "300",
};

function enableAi(over: Record<string, string> = {}) {
  Object.assign(process.env, AI_ENV, over);
}

function stubLlm(content: string) {
  const fn = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(AI_ENV)) delete process.env[k];
  process.env.AI_ENABLED = "false";
});

describe("POST /api/ai/question (질문자, 판단 전)", () => {
  it("기본은 템플릿: 유형은 칩의 판·확신도로 결정, 라벨 🔍, 같은 카드에서 다시 물으면 다음 유형", async () => {
    const u = await createUser("질문1");
    const r1 = await call<QuestionT>(question, { cookie: u.cookie, body: { caseId: C001, evidenceId: "ev-rev", confidence: 3 } });
    expect(r1.status).toBe(200);
    expect(Question.safeParse(r1.json).success).toBe(true);
    expect(r1.json).toMatchObject({ templateType: 1, source: "template" });
    expect(r1.json.lines).toHaveLength(1);
    expect(r1.json.lines[0].label).toBe("inference");
    const r2 = await call<QuestionT>(question, { cookie: u.cookie, body: { caseId: C001, evidenceId: "ev-rev", confidence: 3 } });
    expect(r2.json.templateType).toBe(2);
    const flow = await call<QuestionT>(question, { cookie: u.cookie, body: { caseId: C002, evidenceId: "ev-flow", confidence: 2 } });
    expect(flow.json.templateType).toBe(3);
    const sure = await call<QuestionT>(question, { cookie: u.cookie, body: { caseId: C003, evidenceId: "ev-defense", confidence: 5 } });
    expect(sure.json.templateType).toBe(6);
    expect(sure.json.lines[0].text).not.toMatch(/코카콜라|KO|2024|26\.5|2\.1/);
    const logged = await db().aiDialog.findMany({ where: { userId: u.userId, role: "questioner" } });
    expect(logged).toHaveLength(4);
    expect(logged.every((d) => d.source === "template" && d.templateType !== null)).toBe(true);
  });

  it("같은 사용자·카드·칩·횟수면 같은 질문(결정적)", async () => {
    const a = await createUser("질문2");
    const b = await createUser("질문3");
    const ra = await call<QuestionT>(question, { cookie: a.cookie, body: { caseId: C002, evidenceId: "ev-debt", confidence: 3 } });
    const rb = await call<QuestionT>(question, { cookie: b.cookie, body: { caseId: C002, evidenceId: "ev-debt", confidence: 3 } });
    expect(ra.json).toEqual(rb.json);
  });

  it("그 카드의 칩이 아니면 422, 없는 카드 404, 본문에 다른 키가 있으면 422", async () => {
    const u = await createUser("질문4");
    expect((await call(question, { cookie: u.cookie, body: { caseId: C001, evidenceId: "ev-debt", confidence: 3 } })).status).toBe(422);
    expect((await call(question, { cookie: u.cookie, body: { caseId: "00000000-0000-4000-8000-000000000000", evidenceId: "ev-rev", confidence: 3 } })).status).toBe(404);
    expect((await call(question, { cookie: u.cookie, body: { caseId: C001, evidenceId: "ev-rev", confidence: 3, text: "회사 이름 알려줘" } })).status).toBe(422);
  });

  it("LLM 경로: 누수(회사명·결과 수치)가 있으면 응답을 버리고 템플릿", async () => {
    enableAi();
    invalidateLeakDictionary();
    const fetchMock = stubLlm("이 회사는 어도비예요. 6개월 뒤 4.8% 올라요?");
    const u = await createUser("질문5");
    const r = await call<QuestionT>(question, { cookie: u.cookie, body: { caseId: C001, evidenceId: "ev-per", confidence: 3 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.json.source).toBe("template");
    expect(r.text).not.toMatch(/어도비|4\.8/);
    const d = await db().aiDialog.findFirstOrThrow({ where: { userId: u.userId } });
    expect(d.guard).toMatchObject({ leakKinds: expect.arrayContaining(["company"]) });
    // 프롬프트에 결과·회사명이 없다
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const prompt = String(init.body);
    expect(prompt).not.toMatch(/어도비|ADBE|2023-09-15|"returnPct"|S&P 500/);
    expect(prompt).toContain("PER 38 vs 27");
  });

  it("LLM 경로: 허용 밖 숫자 문장은 숫자 없는 안전 문장으로, 깨끗하면 source=llm", async () => {
    enableAi();
    stubLlm("PER 38은 업종 27보다 높아요. 이익이 77% 늘 거라면 어떨까요?");
    const u = await createUser("질문6");
    const r = await call<QuestionT>(question, { cookie: u.cookie, body: { caseId: C001, evidenceId: "ev-per", confidence: 3 } });
    expect(r.json.source).toBe("llm");
    expect(r.json.lines[0].text).toBe("PER 38은 업종 27보다 높아요. 근거를 하나 더 말해줄래요?");
  });

  it("LLM 경로: 하루 호출 상한이면 호출하지 않고 템플릿", async () => {
    enableAi({ AI_DAILY_CALL_CAP: "0" });
    const fetchMock = stubLlm("질문");
    const u = await createUser("질문7");
    const r = await call<QuestionT>(question, { cookie: u.cookie, body: { caseId: C001, evidenceId: "ev-rev", confidence: 3 } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.json.source).toBe("template");
    expect((await db().aiUsageDaily.findMany())[0]?.calls).toBeGreaterThan(0);
  });

  it("LLM 경로: 카드당 2회를 넘으면 템플릿", async () => {
    enableAi();
    const fetchMock = stubLlm("이 근거와 반대로 읽히는 정보는 무엇일까요?");
    const u = await createUser("질문8");
    for (let i = 0; i < 3; i++) await call(question, { cookie: u.cookie, body: { caseId: C002, evidenceId: "ev-rev", confidence: 3 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/ai/explain (해설자, 공개 뒤)", () => {
  it("공개 전 409, 공개 뒤 템플릿 해설(공개 응답의 해설과 같다)", async () => {
    const u = await createUser("해설1");
    const j = await call<{ judgmentId: string }>(createJudgment, { cookie: u.cookie, body: judgmentBody(C001) });
    const before = await call(explain, { cookie: u.cookie, body: { judgmentId: j.json.judgmentId } });
    expect(before.status).toBe(409);
    const rv = await call<Reveal>(reveal, { method: "POST", cookie: u.cookie, params: { id: j.json.judgmentId } });
    const ex = await call<ExplainT>(explain, { cookie: u.cookie, body: { judgmentId: j.json.judgmentId } });
    expect(ex.status).toBe(200);
    expect(Explain.safeParse(ex.json).success).toBe(true);
    expect(ex.json).toEqual(rv.json.explain);
  });

  it("LLM 경로: 숫자 가드를 거쳐 1회 생성 후 캐시(두 번째는 호출하지 않는다)", async () => {
    enableAi();
    const fetchMock = stubLlm(
      JSON.stringify({ good: "'매출 +23%'를 짚었고 시장 대비 −2.3%p였어요.", change: "다음에는 99% 확률 같은 말 대신 위험 요인도 골라 보세요.", concept: "절대수익과 시장 대비를 다시 보세요." }),
    );
    const u = await createUser("해설2");
    const j = await call<{ judgmentId: string }>(createJudgment, { cookie: u.cookie, body: judgmentBody(C001) });
    await call(reveal, { method: "POST", cookie: u.cookie, params: { id: j.json.judgmentId } });
    const ex1 = await call<ExplainT>(explain, { cookie: u.cookie, body: { judgmentId: j.json.judgmentId } });
    expect(ex1.json.source).toBe("llm");
    expect(ex1.json.lines.map((l) => [l.kind, l.label])).toEqual([["good", "source"], ["change", "inference"], ["concept", "source"]]);
    expect(ex1.json.lines[0].text).toContain("−2.3%p");
    expect(ex1.json.lines[1].text).not.toMatch(/99/);
    const ex2 = await call<ExplainT>(explain, { cookie: u.cookie, body: { judgmentId: j.json.judgmentId } });
    expect(ex2.json).toEqual(ex1.json);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await db().aiDialog.count({ where: { judgmentId: j.json.judgmentId, role: "explainer" } })).toBe(1);
  });
});

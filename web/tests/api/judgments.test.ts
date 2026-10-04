import { beforeAll, describe, expect, it } from "vitest";
import { Reveal } from "@/shared/contract";
import { POST as explain } from "@/app/api/ai/explain/route";
import { POST as createJudgment } from "@/app/api/judgments/route";
import { POST as reveal } from "@/app/api/judgments/[id]/reveal/route";
import { PUT as selfCheck } from "@/app/api/judgments/[id]/self-check/route";
import { db } from "@/lib/server/db";
import { C001, C002, C003, call, createUser, judgmentBody, resetUserData, uuid } from "./helpers";

type Created = { judgmentId: string; existing: boolean };

beforeAll(resetUserData);

describe("POST /api/judgments", () => {
  it("새 판단 201, 같은 카드 재전송은 기존 판단 200(existing:true)", async () => {
    const u = await createUser("판단1");
    const r1 = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { riskId: "rk-rate", panelsViewed: ["numbers", "flow", "numbers"] }) });
    expect(r1.status).toBe(201);
    expect(r1.json.existing).toBe(false);
    const r2 = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { direction: "underperform" }) });
    expect(r2.status).toBe(200);
    expect(r2.json).toEqual({ judgmentId: r1.json.judgmentId, existing: true });
    const row = await db().judgment.findUniqueOrThrow({ where: { id: r1.json.judgmentId } });
    expect(row).toMatchObject({ keyEvidenceId: "ev-rev", keyEvidence: "매출 +23%", riskId: "rk-rate", riskFactor: "금리 상승", direction: "outperform", caseVersion: 1 });
    expect(row.panelsViewed).toEqual(["numbers", "flow"]);
    expect(row.gesture).toEqual({ via: "button" });
  });

  it("판단 때의 정보 수준·숨긴 묶음을 저장(묶음은 계약 순서·중복 없이), 생략하면 standard·[]", async () => {
    const u = await createUser("판단수준");
    const r = await call<Created>(createJudgment, {
      cookie: u.cookie,
      body: judgmentBody(C001, { infoLevel: "basic", hiddenGroups: ["riskChips", "marketLine", "healthDetail", "marketLine"] }),
    });
    expect(r.status).toBe(201);
    const row = await db().judgment.findUniqueOrThrow({ where: { id: r.json.judgmentId } });
    expect(row.infoLevel).toBe("basic");
    expect(row.hiddenGroups).toEqual(["marketLine", "healthDetail", "riskChips"]);
    // 재전송은 기존 판단 그대로(재전송 본문의 수준으로 바꾸지 않는다)
    const again = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { infoLevel: "advanced", hiddenGroups: [] }) });
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ judgmentId: r.json.judgmentId, existing: true });
    expect(await db().judgment.findUniqueOrThrow({ where: { id: r.json.judgmentId } })).toMatchObject({ infoLevel: "basic", hiddenGroups: ["marketLine", "healthDetail", "riskChips"] });

    const plain = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C002) });
    expect(await db().judgment.findUniqueOrThrow({ where: { id: plain.json.judgmentId } })).toMatchObject({ infoLevel: "standard", hiddenGroups: [] });
    const custom = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C003, { infoLevel: "custom", hiddenGroups: [] }) });
    expect(await db().judgment.findUniqueOrThrow({ where: { id: custom.json.judgmentId } })).toMatchObject({ infoLevel: "custom", hiddenGroups: [] });
  });

  it("모르는 정보 수준·묶음 이름은 422", async () => {
    const u = await createUser("판단수준2");
    expect((await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { infoLevel: "expert" }) })).status).toBe(422);
    expect((await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { hiddenGroups: ["peg"] }) })).status).toBe(422);
    expect((await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { hiddenGroups: Array(10).fill("volume") }) })).status).toBe(422);
    expect((await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { hiddenGroups: null }) })).status).toBe(422);
    expect(await db().judgment.count({ where: { userId: u.userId } })).toBe(0);
  });

  it("동시에 두 번 보내도 판단은 1건", async () => {
    const u = await createUser("판단2");
    const [a, b] = await Promise.all([
      call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C002) }),
      call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C002) }),
    ]);
    expect(a.json.judgmentId).toBe(b.json.judgmentId);
    expect([a.json.existing, b.json.existing].sort()).toEqual([false, true]);
    expect(await db().judgment.count({ where: { userId: u.userId } })).toBe(1);
  });

  it("칩 id는 그 카드 것만(422), 버전이 다르면 409, 없는 카드 404", async () => {
    const u = await createUser("판단3");
    expect((await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { keyEvidenceId: "ev-debt" }) })).status).toBe(422);
    expect((await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { riskId: "rk-int" }) })).status).toBe(422);
    const v = await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { caseVersion: 2 }) });
    expect(v.status).toBe(409);
    expect((v.json as { error: { code: string } }).error.code).toBe("version_mismatch");
    expect((await call(createJudgment, { cookie: u.cookie, body: judgmentBody(uuid()) })).status).toBe(404);
    expect((await call(createJudgment, { cookie: u.cookie, body: judgmentBody(C001, { confidence: 0 }) })).status).toBe(422);
    expect((await call(createJudgment, { cookie: u.cookie, body: { ...judgmentBody(C001), extra: 1 } })).status).toBe(422);
    expect(await db().judgment.count({ where: { userId: u.userId } })).toBe(0);
  });

  it("로그인하지 않으면 401", async () => {
    expect((await call(createJudgment, { body: judgmentBody(C001) })).status).toBe(401);
  });
});

describe("POST /api/judgments/{id}/reveal", () => {
  it("결과·세 상태·개념·문제(정답 없음)·해설 세 줄을 계약대로", async () => {
    const u = await createUser("공개1");
    const j = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C001) });
    const r = await call<Reveal>(reveal, { method: "POST", cookie: u.cookie, params: { id: j.json.judgmentId } });
    expect(r.status).toBe(200);
    expect(Reveal.safeParse(r.json).success).toBe(true);
    expect(r.json.outcome).toMatchObject({ companyName: "어도비", ticker: "ADBE", startDate: "2023-09-15", returnPct: 4.8, benchReturnPct: 7.1, benchName: "S&P 500" });
    expect(r.json.result).toEqual({ relativePp: -2.3, state: "behind", hit: false });
    expect(r.json.learning.concept).toMatchObject({ id: "abs-vs-relative", branch: "outcome", linkSentence: "주가는 올랐지만 시장이 더 올라 시장 대비로는 뒤졌어요." });
    expect(r.json.learning.quiz).toEqual({ quizId: "abs-vs-relative-q1", question: "기업 +10%, 시장 +15%면 이 판단은?", options: ["성공 — 주가가 올랐으니까", "하회 — 시장을 못 따라갔으니까"] });
    expect(r.json.learning.selfCheckEnabled).toBe(true); // 난이도 2
    expect(r.json.keyPoints).toHaveLength(2);
    expect(r.json.explain.source).toBe("template");
    expect(r.json.explain.lines.map((l) => l.kind)).toEqual(["good", "change", "concept"]);
    expect(r.text).not.toMatch(/answerIndex|answer_index|explanation/);
    expect(r.json.judgment).toEqual({ direction: "outperform", confidence: 3, keyEvidence: "매출 +23%", risk: null, recognized: false, selfCheck: null });
  });

  it("동시에 두 번 공개해도 같은 응답, 채점은 1행", async () => {
    const u = await createUser("공개2");
    const j = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C002, { direction: "underperform" }) });
    const [a, b] = await Promise.all([
      call<Reveal>(reveal, { method: "POST", cookie: u.cookie, params: { id: j.json.judgmentId } }),
      call<Reveal>(reveal, { method: "POST", cookie: u.cookie, params: { id: j.json.judgmentId } }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.json).toEqual(b.json);
    expect(a.json.result).toEqual({ relativePp: -15.6, state: "behind", hit: true });
    expect(await db().judgmentOutcome.count({ where: { judgmentId: j.json.judgmentId } })).toBe(1);
    const first = await db().judgment.findUniqueOrThrow({ where: { id: j.json.judgmentId } });
    const again = await call<Reveal>(reveal, { method: "POST", cookie: u.cookie, params: { id: j.json.judgmentId } });
    expect(again.json).toEqual(a.json);
    const second = await db().judgment.findUniqueOrThrow({ where: { id: j.json.judgmentId } });
    expect(second.revealedAt?.getTime()).toBe(first.revealedAt?.getTime());
  });

  it("공개 당시 채점은 유지된다(결과 자료가 나중에 바뀌어도)", async () => {
    const u = await createUser("공개3");
    const j = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C003) });
    const r1 = await call<Reveal>(reveal, { method: "POST", cookie: u.cookie, params: { id: j.json.judgmentId } });
    expect(r1.json.result.state).toBe("behind");
    expect(r1.json.learning.selfCheckEnabled).toBe(false); // 난이도 1
    const stored = await db().judgmentOutcome.findUniqueOrThrow({ where: { judgmentId: j.json.judgmentId } });
    expect(stored.state).toBe("behind");
  });

  it("남의 판단은 404(공개·개념 확인·해설), 형식이 틀린 id도 404", async () => {
    const owner = await createUser("주인");
    const other = await createUser("남");
    const j = await call<Created>(createJudgment, { cookie: owner.cookie, body: judgmentBody(C001) });
    const id = j.json.judgmentId;
    const rv = await call(reveal, { method: "POST", cookie: other.cookie, params: { id } });
    expect(rv.status).toBe(404);
    expect(rv.json).toEqual({ error: { code: "not_found", message: "찾을 수 없어요." } });
    expect((await call(selfCheck, { method: "PUT", cookie: other.cookie, params: { id }, body: { value: "o" } })).status).toBe(404);
    expect((await call(explain, { cookie: other.cookie, body: { judgmentId: id } })).status).toBe(404);
    expect((await call(reveal, { method: "POST", cookie: other.cookie, params: { id: "not-a-uuid" } })).status).toBe(404);
    // 남이 시도해도 주인의 판단은 공개되지 않았다
    expect((await db().judgment.findUniqueOrThrow({ where: { id } })).revealedAt).toBeNull();
  });

  it("다른 Origin의 공개 요청은 403", async () => {
    const u = await createUser("공개4");
    const j = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C001) });
    const r = await call(reveal, { method: "POST", cookie: u.cookie, params: { id: j.json.judgmentId }, origin: "https://evil.ifsave.com" });
    expect(r.status).toBe(403);
  });
});

describe("PUT /api/judgments/{id}/self-check", () => {
  it("공개 전 409, 공개 뒤 200(바꿀 수 있음), 난이도 1 카드는 409", async () => {
    const u = await createUser("자기평가");
    const j = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C001) });
    const id = j.json.judgmentId;
    const before = await call(selfCheck, { method: "PUT", cookie: u.cookie, params: { id }, body: { value: "o" } });
    expect(before.status).toBe(409);
    expect((before.json as { error: { code: string } }).error.code).toBe("not_revealed");
    await call(reveal, { method: "POST", cookie: u.cookie, params: { id } });
    expect((await call(selfCheck, { method: "PUT", cookie: u.cookie, params: { id }, body: { value: "tri" } })).status).toBe(200);
    expect((await call(selfCheck, { method: "PUT", cookie: u.cookie, params: { id }, body: { value: "x" } })).status).toBe(200);
    expect((await call(selfCheck, { method: "PUT", cookie: u.cookie, params: { id }, body: { value: null } })).status).toBe(422);
    expect((await db().judgment.findUniqueOrThrow({ where: { id } })).selfCheck).toBe("x");
    const r = await call<Reveal>(reveal, { method: "POST", cookie: u.cookie, params: { id } });
    expect(r.json.judgment.selfCheck).toBe("x");

    const easy = await call<Created>(createJudgment, { cookie: u.cookie, body: judgmentBody(C003) });
    await call(reveal, { method: "POST", cookie: u.cookie, params: { id: easy.json.judgmentId } });
    const disabled = await call(selfCheck, { method: "PUT", cookie: u.cookie, params: { id: easy.json.judgmentId }, body: { value: "o" } });
    expect(disabled.status).toBe(409);
    expect((disabled.json as { error: { code: string } }).error.code).toBe("self_check_disabled");
  });
});

import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { ContentError, loadContent, type Content } from "@/server/content/cards";
import { seedContent } from "@/server/content/seed";
import { C001, C002, C003, CANARY_CASE } from "./helpers";

const fixtures = path.resolve(__dirname, "../fixtures");
const all = () => [loadContent(path.join(fixtures, "content")), loadContent(path.join(fixtures, "canary"))];

async function counts() {
  const p = db();
  return {
    cases: await p.case.count(),
    blocks: await p.caseBlock.count(),
    outcomes: await p.caseOutcome.count(),
    reveal: await p.caseReveal.count(),
    learning: await p.caseLearningPoint.count(),
    internal: await p.caseInternal.count(),
    concepts: await p.concept.count(),
    quizzes: await p.quiz.count(),
  };
}

const NEW_ID = "22222222-2222-4222-8222-222222222222";

afterAll(async () => {
  // 다른 시험 파일을 위해 원래 상태로(예시 카드 live, 시험용 카드 retired)
  await seedContent(db(), all(), { retireMissing: true });
});

describe("시드(upsert만)", () => {
  it("두 번 돌려도 행 수가 같다(삭제 없음)", async () => {
    const before = await counts();
    const r = await seedContent(db(), all());
    expect(r.cases).toMatchObject({ create: 0, update: 4 });
    expect(await counts()).toEqual(before);
  });

  it("개념 파일에서 빠진 문제는 지우지 않고 비활성으로, 순서를 바꿔도 충돌하지 않는다", async () => {
    const [content, canary] = all();
    const edited = structuredClone(content);
    const c = edited.concepts.find((x) => x.id === "base-rate")!;
    // q1 삭제, q2를 첫 자리로, 새 문제 q3 추가
    c.quizzes = [c.quizzes[1], { ...c.quizzes[0], quizId: "base-rate-q3", question: "새 문제?" }];
    const r = await seedContent(db(), [edited, canary]);
    expect(r.quizzes.retired).toBe(1);
    const qs = await db().quiz.findMany({ where: { conceptId: "base-rate" }, orderBy: { id: "asc" }, select: { id: true, ord: true, active: true } });
    expect(qs).toEqual([
      { id: "base-rate-q1", ord: 0, active: false },
      { id: "base-rate-q2", ord: 0, active: true },
      { id: "base-rate-q3", ord: 1, active: true },
    ]);
    // 되돌리기(원래 목록) → q1 다시 활성, q3 비활성
    await seedContent(db(), all());
    const back = await db().quiz.findMany({ where: { conceptId: "base-rate", active: true }, orderBy: { ord: "asc" }, select: { id: true } });
    expect(back.map((q) => q.id)).toEqual(["base-rate-q1", "base-rate-q2"]);
  });

  it("dry-run은 쓰지 않는다", async () => {
    const before = await counts();
    const r = await seedContent(db(), all(), { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(await counts()).toEqual(before);
  });

  it("콘텐츠에 없는 live 카드와 덱 순서가 겹치면 멈추고, --retire-missing이면 지우지 않고 retired로", async () => {
    const [content, canary] = all();
    const moved = structuredClone(content.cards[0].card);
    moved.id = NEW_ID; // 새 카드가 C001의 덱 순서(2)를 쓴다
    const replacement: Content = { dir: "mem", concepts: content.concepts, cards: [canary.cards[0], { file: "new.json", card: moved }] };

    await expect(seedContent(db(), [replacement])).rejects.toBeInstanceOf(ContentError);
    expect((await db().case.findUniqueOrThrow({ where: { id: C001 } })).status).toBe("live");

    const r = await seedContent(db(), [replacement], { retireMissing: true });
    expect(r.cases.retired).toBe(3);
    const rows = await db().case.findMany({ where: { id: { in: [C001, C002, C003, CANARY_CASE, NEW_ID] } }, select: { id: true, status: true } });
    const status = Object.fromEntries(rows.map((x) => [x.id, x.status]));
    expect(status).toEqual({ [C001]: "retired", [C002]: "retired", [C003]: "retired", [CANARY_CASE]: "live", [NEW_ID]: "live" });
    // 결과 자료도 지워지지 않았다
    expect(await db().caseOutcome.count({ where: { caseId: C001 } })).toBe(1);
  });
});

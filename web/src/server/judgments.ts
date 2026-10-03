import "server-only";
import { SELF_CHECK_FROM_DIFFICULTY, type JudgmentBody, type Reveal, type SelfCheck } from "@/shared/contract";
import type { z } from "zod";
import type { AuthedUser } from "@/lib/server/auth";
import { db, isUniqueViolation, Prisma } from "@/lib/server/db";
import { Errors } from "@/lib/server/http";
import { localDate, toDbDate } from "@/lib/server/time";
import { labelExplain } from "@/lib/server/ai/labels";
import { EXPLAIN_PERSONA, templateExplainLines } from "@/lib/server/ai/templates";
import { findEvidence, findRisk, loadPublicCase } from "./cases";
import { loadOutcome, loadRevealExtras, num, outcomeToContract } from "./outcomes";
import { scoreOutcome } from "./rules";

type JudgmentBodyT = z.infer<typeof JudgmentBody>;
type RevealT = z.infer<typeof Reveal>;

/**
 * POST /api/judgments — 같은 카드 재전송은 기존 판단(unique(user_id, case_id)) → existing:true.
 * 칩 id는 그 카드(현재 버전) 것만. 판단 당시 칩 글자를 함께 복사해 둔다(일지·인사이트용).
 */
export async function createJudgment(user: AuthedUser, body: JudgmentBodyT, now = new Date()): Promise<{ judgmentId: string; existing: boolean }> {
  const prisma = db();
  const prior = await prisma.judgment.findUnique({ where: { userId_caseId: { userId: user.id, caseId: body.caseId } }, select: { id: true } });
  if (prior) return { judgmentId: prior.id, existing: true };

  const pc = await loadPublicCase(body.caseId);
  if (!pc) throw Errors.notFound();
  if (body.caseVersion !== pc.version) throw Errors.conflict("version_mismatch", "카드가 새 버전으로 바뀌었어요. 다시 불러와 주세요.");
  const evidence = findEvidence(pc, body.keyEvidenceId);
  if (!evidence) throw Errors.validation("invalid_evidence", "이 카드의 근거가 아니에요.");
  const risk = body.riskId === null ? null : findRisk(pc, body.riskId);
  if (body.riskId !== null && !risk) throw Errors.validation("invalid_risk", "이 카드의 위험 요인이 아니에요.");

  try {
    const created = await prisma.judgment.create({
      data: {
        userId: user.id,
        caseId: pc.id,
        caseVersion: pc.version,
        localDate: toDbDate(localDate(now, user.tz)),
        keyEvidenceId: evidence.id,
        keyEvidence: evidence.label,
        riskId: risk ? risk.id : null,
        riskFactor: risk ? risk.label : null,
        direction: body.direction,
        confidence: body.confidence,
        recognized: body.recognized,
        isExtra: body.isExtra,
        panelsViewed: [...new Set(body.panelsViewed)],
        gesture: body.gesture ?? Prisma.DbNull,
      },
      select: { id: true },
    });
    return { judgmentId: created.id, existing: false };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const again = await prisma.judgment.findUnique({ where: { userId_caseId: { userId: user.id, caseId: body.caseId } }, select: { id: true } });
    if (!again) throw e;
    return { judgmentId: again.id, existing: true };
  }
}

/**
 * POST /api/judgments/{id}/reveal — 조건부 UPDATE(revealed_at = coalesce(revealed_at, now()))와
 * 채점 INSERT … ON CONFLICT DO NOTHING을 한 트랜잭션에서. 반복·동시 호출은 같은 응답(공개 당시 채점 유지).
 * 남의 판단이면 0행 → 404.
 */
export async function revealJudgment(user: AuthedUser, judgmentId: string): Promise<RevealT> {
  const { j, outcome, scored, extras, difficulty } = await db().$transaction(async (tx) => {
    const n = await tx.$executeRaw(
      Prisma.sql`UPDATE "judgments" SET "revealed_at" = coalesce("revealed_at", now()) WHERE "id" = ${judgmentId}::uuid AND "user_id" = ${user.id}::uuid`,
    );
    if (n === 0) throw Errors.notFound();
    const jr = await tx.judgment.findUniqueOrThrow({ where: { id: judgmentId }, include: { case: { select: { difficulty: true } } } });
    const o = await loadOutcome(jr.caseId, jr.caseVersion, tx);
    if (!o) throw new Error("case outcome missing");
    const s = scoreOutcome(num(o.returnPct), num(o.benchReturnPct), jr.direction);
    await tx.judgmentOutcome.createMany({
      data: [{ judgmentId: jr.id, relativePp: s.relativePp, state: s.state, hit: s.hit }],
      skipDuplicates: true,
    });
    const stored = await tx.judgmentOutcome.findUniqueOrThrow({ where: { judgmentId: jr.id } });
    const ex = await loadRevealExtras(jr.caseId, jr.caseVersion, tx);
    return { j: jr, outcome: o, scored: stored, extras: ex, difficulty: jr.case.difficulty };
  });

  const lp = extras.learning[0];
  const quiz = lp?.quizzes[0];
  if (!lp || !quiz) throw new Error("learning point or quiz missing");
  const options = (Array.isArray(quiz.options) ? quiz.options : []).map(String);

  const result = { relativePp: num(scored.relativePp), state: scored.state, hit: scored.hit };
  const o = outcomeToContract(outcome);
  const lines = templateExplainLines({
    evidence: j.keyEvidence,
    risk: j.riskFactor,
    direction: j.direction,
    state: result.state,
    hit: result.hit,
    returnPct: o.returnPct,
    benchReturnPct: o.benchReturnPct,
    relativePp: result.relativePp,
    benchName: o.benchName,
    conceptTitle: lp.concept.title,
  });

  return {
    judgmentId: j.id,
    caseId: j.caseId,
    version: j.caseVersion,
    judgment: {
      direction: j.direction,
      confidence: j.confidence,
      keyEvidence: j.keyEvidence,
      risk: j.riskFactor,
      recognized: j.recognized,
      selfCheck: j.selfCheck,
    },
    outcome: o,
    result,
    keyPoints: extras.keyPoints,
    learning: {
      concept: { id: lp.concept.id, branch: lp.concept.branch, title: lp.concept.title, body: lp.concept.bodyMd, linkSentence: lp.linkSentence },
      quiz: { quizId: quiz.id, question: quiz.question, options },
      selfCheckEnabled: difficulty >= SELF_CHECK_FROM_DIFFICULTY,
    },
    explain: { persona: EXPLAIN_PERSONA, lines: labelExplain(lines), source: "template" },
  };
}

/** PUT /api/judgments/{id}/self-check — 공개 뒤에만(난이도 2부터). 값 변경 가능, 삭제 불가. */
export async function setSelfCheck(user: AuthedUser, judgmentId: string, value: z.infer<typeof SelfCheck>): Promise<void> {
  const prisma = db();
  const j = await prisma.judgment.findFirst({ where: { id: judgmentId, userId: user.id }, include: { case: { select: { difficulty: true } } } });
  if (!j) throw Errors.notFound();
  if (!j.revealedAt) throw Errors.conflict("not_revealed", "공개한 뒤에 기록할 수 있어요.");
  if (j.case.difficulty < SELF_CHECK_FROM_DIFFICULTY) throw Errors.conflict("self_check_disabled", "이 카드에서는 개념 확인을 묻지 않아요.");
  await prisma.judgment.update({ where: { id: j.id }, data: { selfCheck: value, selfCheckAt: new Date() } });
}

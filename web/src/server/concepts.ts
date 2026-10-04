import "server-only";
import type { ConceptList, QuizBody, QuizResult } from "@/shared/contract";
import { z } from "zod";
import type { AuthedUser } from "@/lib/server/auth";
import { db, isUniqueViolation, Prisma } from "@/lib/server/db";
import { Errors } from "@/lib/server/http";
import { fromDbDate, localDate, toDbDate } from "@/lib/server/time";
import type { ConceptState } from "@/server/generated/prisma/client";
import { nextConceptState, nextReview } from "./rules";

type ConceptListT = z.infer<typeof ConceptList>;
type QuizBodyT = z.infer<typeof QuizBody>;
type QuizResultT = z.infer<typeof QuizResult>;

const Options = z.array(z.string()).min(2).max(4);

function quizPublic(q: { id: string; question: string; options: unknown }) {
  return { quizId: q.id, question: q.question, options: Options.parse(q.options) };
}

/**
 * GET /api/concepts — 개념 전체 + 내 숙련도·복습 예정. 문제는 푼 횟수에 따라 돌아가며 하나(정답 없음).
 * 순서: 갈래(결과 → 숫자 → 그때 → 내 판단, enum 순서) → 갈래 안 순서(order = concepts.ord, 개념 파일의 나열 순서).
 */
export async function listConcepts(user: AuthedUser): Promise<ConceptListT> {
  const prisma = db();
  const [concepts, progress] = await Promise.all([
    prisma.concept.findMany({
      where: { active: true },
      orderBy: [{ branch: "asc" }, { ord: "asc" }, { id: "asc" }],
      include: { quizzes: { where: { active: true }, orderBy: { ord: "asc" }, select: { id: true, question: true, options: true } } },
    }),
    prisma.conceptProgress.findMany({ where: { userId: user.id } }),
  ]);
  const byId = new Map(progress.map((p) => [p.conceptId, p]));
  return {
    concepts: concepts.map((c) => {
      const p = byId.get(c.id);
      const quiz = c.quizzes.length ? c.quizzes[(p?.quizTotal ?? 0) % c.quizzes.length] : null;
      return {
        id: c.id,
        branch: c.branch,
        title: c.title,
        body: c.bodyMd,
        linkSentence: null,
        state: p?.state ?? "new",
        level: p?.level ?? 0,
        dueOn: p?.dueOn ? fromDbDate(p.dueOn) : null,
        quiz: quiz ? quizPublic(quiz) : null,
        order: c.ord,
      };
    }),
  };
}

function explanationFor(correct: boolean, options: string[], answerIndex: number, explanation: string | null): string {
  const head = correct ? "맞아요." : `아니에요. 정답: ‘${options[answerIndex] ?? ""}’.`;
  return explanation ? `${head} ${explanation}` : head;
}

async function replay(userId: string, clientAttemptId: string, conceptId: string): Promise<QuizResultT | null> {
  const prior = await db().quizAttempt.findUnique({
    where: { userId_clientAttemptId: { userId, clientAttemptId } },
    include: { quiz: true },
  });
  if (!prior) return null;
  if (prior.conceptId !== conceptId) throw Errors.conflict("attempt_conflict", "이미 다른 문제에 쓴 시도예요.");
  const options = Options.parse(prior.quiz.options);
  return {
    correct: prior.correct,
    answerIndex: prior.quiz.answerIndex,
    explanation: explanationFor(prior.correct, options, prior.quiz.answerIndex, prior.quiz.explanation),
    level: prior.levelAfter,
    state: prior.stateAfter,
    nextDueOn: fromDbDate(prior.dueOnAfter),
  };
}

/**
 * POST /api/concepts/{id}/quiz — 서버 채점. client_attempt_id 멱등(같은 시도는 같은 응답).
 * 복습 간격 1·3·7·21일: 맞히면 level+1, 틀리면 0, 기한 전 정답은 level 유지(rules.nextReview).
 * answerIndex(정답 보기 번호)는 채점 뒤라 응답에 넣는다(틀린 보기 표시용). 채점 전 경로(QuizPublic)에는 없다.
 */
export async function answerQuiz(user: AuthedUser, conceptId: string, body: QuizBodyT, now = new Date()): Promise<QuizResultT> {
  const prisma = db();
  const replayed = await replay(user.id, body.clientAttemptId, conceptId);
  if (replayed) return replayed;

  const quiz = await prisma.quiz.findUnique({ where: { id: body.quizId } });
  if (!quiz || quiz.conceptId !== conceptId) throw Errors.notFound();
  const options = Options.parse(quiz.options);
  if (body.optionIndex >= options.length) throw Errors.validation("invalid_option", "보기 번호가 올바르지 않아요.");
  const correct = body.optionIndex === quiz.answerIndex;
  const today = localDate(now, user.tz);

  const attempt = async (): Promise<QuizResultT> =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "concept_progress" ("user_id", "concept_id") VALUES (${user.id}::uuid, ${conceptId})
        ON CONFLICT ("user_id", "concept_id") DO NOTHING`);
      const rows = await tx.$queryRaw<{ level: number; due_on: Date | null; quiz_correct: number; quiz_total: number }[]>(Prisma.sql`
        SELECT "level", "due_on", "quiz_correct", "quiz_total" FROM "concept_progress"
        WHERE "user_id" = ${user.id}::uuid AND "concept_id" = ${conceptId} FOR UPDATE`);
      const p = rows[0];
      const prev = p.due_on ? { level: Number(p.level), dueOn: fromDbDate(p.due_on) } : null;
      const next = nextReview(prev, correct, today);
      const st = nextConceptState({ correct: Number(p.quiz_correct), total: Number(p.quiz_total) }, correct);
      await tx.quizAttempt.create({
        data: {
          userId: user.id,
          conceptId,
          quizId: quiz.id,
          optionIndex: body.optionIndex,
          correct,
          via: body.via,
          levelBefore: prev ? prev.level : null,
          levelAfter: next.level,
          stateAfter: st.state as ConceptState,
          dueOnAfter: toDbDate(next.dueOn),
          localDate: toDbDate(today),
          clientAttemptId: body.clientAttemptId,
        },
      });
      await tx.conceptProgress.update({
        where: { userId_conceptId: { userId: user.id, conceptId } },
        data: { level: next.level, dueOn: toDbDate(next.dueOn), state: st.state as ConceptState, quizCorrect: st.correct, quizTotal: st.total, lastSeen: now },
      });
      return {
        correct,
        answerIndex: quiz.answerIndex,
        explanation: explanationFor(correct, options, quiz.answerIndex, quiz.explanation),
        level: next.level,
        state: st.state,
        nextDueOn: next.dueOn,
      };
    });

  try {
    return await attempt();
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const again = await replay(user.id, body.clientAttemptId, conceptId);
    if (again) return again;
    return attempt();
  }
}

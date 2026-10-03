import "server-only";
import type { PrismaClient } from "@/server/generated/prisma/client";
import { Prisma } from "@/server/generated/prisma/client";
import { toDbDate } from "@/lib/server/time";
import { ContentError, splitCard, validateContent, type Content, type SplitCard } from "./cards";

/**
 * 시드: upsert만(deleteMany 금지, 05 §3). 카드 버전·uuid는 원본 JSON에 고정돼 있다.
 * 한 트랜잭션에서 실행하므로 중간에 실패하면 아무것도 바뀌지 않는다. 두 번 돌려도 행 수가 같다.
 * 내린 카드는 지우지 않고 status만 바꾼다(원본에서 status를 draft·retired로).
 * retireMissing: DB의 live 카드 중 이번 콘텐츠에 없는 것을 retired로 바꾼다(삭제가 아니라 상태 변경).
 *   콘텐츠 폴더를 통째로 바꿀 때(예: 예시 자료 → 실제 카드) live 덱 순서가 겹치지 않게 쓴다.
 */
export interface SeedReport {
  dryRun: boolean;
  concepts: { create: number; update: number; retired: number };
  quizzes: { create: number; update: number; retired: number };
  cases: { create: number; update: number; live: number; retired: number };
  warnings: string[];
}

export async function seedContent(prisma: PrismaClient, contents: Content[], opts: { dryRun?: boolean; retireMissing?: boolean } = {}): Promise<SeedReport> {
  const concepts = contents.flatMap((c) => c.concepts);
  const cards = contents.flatMap((c) => c.cards);
  const merged: Content = { dir: contents.map((c) => c.dir).join(", "), concepts, cards };

  const dbConceptIds = new Set((await prisma.concept.findMany({ select: { id: true } })).map((c) => c.id));
  const problems = validateContent(merged, dbConceptIds);
  if (problems.length) throw new ContentError(`콘텐츠 점검 실패:\n${problems.map((p) => `  - ${p}`).join("\n")}`);

  const split: SplitCard[] = cards.map(({ file, card }) => {
    try {
      return splitCard(card);
    } catch (e) {
      throw new ContentError(`${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  const warnings = split.flatMap((s, i) => s.warnings.map((w) => `${cards[i].file}: ${w}`));

  const quizIds = concepts.flatMap((c) => c.quizzes.map((q) => q.quizId));
  const caseIds = split.map((s) => s.public.case.id);
  const conceptIds = concepts.map((c) => c.id);
  const [existingConcepts, existingQuizzes, existingCases, staleQuizzes, staleConcepts] = await Promise.all([
    prisma.concept.findMany({ where: { id: { in: conceptIds } }, select: { id: true } }),
    prisma.quiz.findMany({ where: { id: { in: quizIds } }, select: { id: true } }),
    prisma.case.findMany({ where: { id: { in: caseIds } }, select: { id: true } }),
    // 개념 파일이 그 개념의 문제 목록의 원본: 목록에서 빠진 문제는 active=false로
    prisma.quiz.count({ where: { conceptId: { in: conceptIds }, id: { notIn: quizIds }, active: true } }),
    conceptIds.length ? prisma.concept.count({ where: { id: { notIn: conceptIds }, active: true } }) : Promise.resolve(0),
  ]);
  // 이번 콘텐츠에 없는 live 카드: 덱 순서가 겹치면 시드가 실패하므로 미리 알려 준다
  const strayLive = await prisma.case.findMany({ where: { status: "live", id: { notIn: caseIds } }, select: { id: true, deckOrder: true } });
  const contentLiveOrders = new Set(split.filter((s) => s.public.case.status === "live").map((s) => s.public.case.deckOrder));
  const clashes = strayLive.filter((c) => contentLiveOrders.has(c.deckOrder));
  if (clashes.length && !opts.retireMissing) {
    throw new ContentError(
      `DB의 live 카드 ${clashes.length}장이 이번 콘텐츠에 없고 덱 순서가 겹쳐요(${clashes.map((c) => `${c.id}#${c.deckOrder}`).join(", ")}). ` +
        "콘텐츠에 없는 live 카드를 내리려면 --retire-missing을 붙이세요(삭제하지 않고 retired로 바꿉니다).",
    );
  }
  const report: SeedReport = {
    dryRun: Boolean(opts.dryRun),
    concepts: { create: concepts.length - existingConcepts.length, update: existingConcepts.length, retired: opts.retireMissing ? staleConcepts : 0 },
    quizzes: { create: quizIds.length - existingQuizzes.length, update: existingQuizzes.length, retired: staleQuizzes },
    cases: {
      create: caseIds.length - existingCases.length,
      update: existingCases.length,
      live: split.filter((s) => s.public.case.status === "live").length,
      retired: opts.retireMissing ? strayLive.length : 0,
    },
    warnings,
  };
  if (opts.dryRun) return report;

  await prisma.$transaction(
    async (tx) => {
      // 개념·문제
      for (const [i, c] of concepts.entries()) {
        const data = { branch: c.branch, title: c.title, bodyMd: c.body, ord: i, active: true };
        await tx.concept.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
      }
      if (opts.retireMissing && conceptIds.length) {
        await tx.concept.updateMany({ where: { id: { notIn: conceptIds }, active: true }, data: { active: false } });
      }
      if (conceptIds.length) {
        // (concept_id, ord)는 active 문제 사이에서만 유일 → 먼저 모두 비활성으로 돌리고 개념 파일의 목록만 다시 활성으로
        await tx.quiz.updateMany({ where: { conceptId: { in: conceptIds } }, data: { active: false } });
      }
      for (const c of concepts) {
        for (const [ord, q] of c.quizzes.entries()) {
          const data = { conceptId: c.id, ord, question: q.question, options: q.options, answerIndex: q.answerIndex, explanation: q.explanation, active: true };
          await tx.quiz.upsert({ where: { id: q.quizId }, create: { id: q.quizId, ...data }, update: data });
        }
      }

      if (opts.retireMissing && strayLive.length) {
        await tx.case.updateMany({ where: { id: { in: strayLive.map((c) => c.id) } }, data: { status: "retired" } });
      }
      // 카드: live 덱 순서 유일 → 순서를 바꿔도 충돌하지 않게 기존 행의 deck_order를 잠시 음수로
      if (caseIds.length) {
        await tx.$executeRaw(Prisma.sql`UPDATE "cases" SET "deck_order" = -"deck_order" - 1 WHERE "id" IN (${Prisma.join(caseIds.map((id) => Prisma.sql`${id}::uuid`))})`);
      }
      for (const s of split) {
        const c = s.public.case;
        const caseData = {
          version: c.version,
          yearPublic: c.yearPublic,
          sectorPublic: c.sectorPublic,
          sizeBucket: c.sizeBucket,
          horizonDays: c.horizonDays,
          difficulty: c.difficulty,
          status: c.status,
          deckOrder: c.deckOrder,
          evidenceOptions: c.evidenceOptions,
          riskOptions: c.riskOptions,
        };
        // ① 판단 전
        await tx.case.upsert({ where: { id: c.id }, create: { id: c.id, ...caseData }, update: caseData });
        for (const b of s.public.blocks) {
          await tx.caseBlock.upsert({
            where: { caseId_version_kind: { caseId: c.id, version: c.version, kind: b.kind } },
            create: { caseId: c.id, version: c.version, kind: b.kind, payload: b.payload as Prisma.InputJsonObject },
            update: { payload: b.payload as Prisma.InputJsonObject },
          });
        }
        // ② 공개 뒤
        const o = s.reveal.outcome;
        const outcomeData = {
          companyName: o.companyName,
          ticker: o.ticker,
          startDate: toDbDate(o.startDate),
          endDate: toDbDate(o.endDate),
          period: o.period,
          startPrice: o.startPrice ?? null,
          endPrice: o.endPrice ?? null,
          returnPct: o.returnPct,
          benchReturnPct: o.benchReturnPct,
          sectorReturnPct: o.sectorReturnPct ?? null,
          benchName: o.benchName,
          pricePath: o.pricePath,
          benchPath: o.benchPath,
          sources: o.sources,
        };
        await tx.caseOutcome.upsert({
          where: { caseId_version: { caseId: c.id, version: c.version } },
          create: { caseId: c.id, version: c.version, ...outcomeData },
          update: outcomeData,
        });
        await tx.caseReveal.upsert({
          where: { caseId_version: { caseId: c.id, version: c.version } },
          create: { caseId: c.id, version: c.version, keyPoints: s.reveal.keyPoints },
          update: { keyPoints: s.reveal.keyPoints },
        });
        for (const lp of s.reveal.learningPoints) {
          await tx.caseLearningPoint.upsert({
            where: { caseId_version_conceptId: { caseId: c.id, version: c.version, conceptId: lp.conceptId } },
            create: { caseId: c.id, version: c.version, conceptId: lp.conceptId, rank: lp.rank, linkSentence: lp.linkSentence },
            update: { rank: lp.rank, linkSentence: lp.linkSentence },
          });
        }
        // ③ 서버 전용
        const internalData = { notes: s.internal.notes, leakTerms: s.internal.leakTerms, dataCutoff: toDbDate(s.internal.dataCutoff) };
        await tx.caseInternal.upsert({
          where: { caseId_version: { caseId: c.id, version: c.version } },
          create: { caseId: c.id, version: c.version, ...internalData },
          update: internalData,
        });
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return report;
}

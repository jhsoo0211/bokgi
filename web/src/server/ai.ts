import "server-only";
import { Explain, type Question, type QuestionBody } from "@/shared/contract";
import type { z } from "zod";
import type { AuthedUser } from "@/lib/server/auth";
import { db, Prisma } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { Errors } from "@/lib/server/http";
import { localDate, toDbDate } from "@/lib/server/time";
import { consumeAiCall } from "@/lib/server/ai/budget";
import { chat } from "@/lib/server/ai/client";
import { labelExplain, labelQuestion } from "@/lib/server/ai/labels";
import { findLeaks } from "@/lib/server/ai/leakFilter";
import { allowedNumbers, guardSentences } from "@/lib/server/ai/numberGuard";
import { explainerMessages, parseExplainerOutput, parseQuestionerOutput, questionerMessages } from "@/lib/server/ai/prompts";
import {
  EXPLAIN_PERSONA,
  SAFE_EXPLAIN,
  SAFE_QUESTION,
  explainAllowed,
  pickQuestionType,
  templateExplainLines,
  templateQuestion,
  type ExplainInput,
} from "@/lib/server/ai/templates";
import { findEvidence, loadPublicCase } from "./cases";
import { leakDictionaryFor, loadOutcome, loadRevealExtras, num } from "./outcomes";

type QuestionT = z.infer<typeof Question>;
type ExplainT = z.infer<typeof Explain>;

/** 질문자 한도: 카드당 2회·하루 20회. 넘으면 템플릿(05 §4). */
export const QUESTION_PER_CARD = 2;
export const QUESTION_PER_DAY = 20;

/**
 * POST /api/ai/question — 본문은 {caseId, evidenceId, confidence}만. 컨텍스트는 서버가 toPublicCase()로 조립한다.
 * 유형은 근거 칩의 판·확신도·이 카드에서 앞서 물은 횟수로 결정(결과와 무관). 기본은 템플릿.
 * AI_ENABLED=true이고 한도 안이면 LLM → numberGuard → leakFilter → labels. 하나라도 걸리면 템플릿.
 * 템플릿 문장도 누수 필터를 거친다(카드 문구 실수 방지) — 걸리면 안전 문장.
 */
export async function askQuestion(user: AuthedUser, body: z.infer<typeof QuestionBody>, now = new Date()): Promise<QuestionT> {
  const prisma = db();
  const pc = await loadPublicCase(body.caseId);
  if (!pc) throw Errors.notFound();
  const ev = findEvidence(pc, body.evidenceId);
  if (!ev) throw Errors.validation("invalid_evidence", "이 카드의 근거가 아니에요.");
  const today = localDate(now, user.tz);

  const [priorCard, priorDay] = await Promise.all([
    prisma.aiDialog.count({ where: { userId: user.id, caseId: pc.id, role: "questioner" } }),
    prisma.aiDialog.count({ where: { userId: user.id, localDate: toDbDate(today), role: "questioner" } }),
  ]);
  const type = pickQuestionType(ev.panel, body.confidence, priorCard);
  const ctx = { ev: ev.label, panel: ev.panel, conf: body.confidence };
  const publicText = JSON.stringify(pc);
  const dict = await leakDictionaryFor(pc.id, publicText);

  let lines = [templateQuestion(type, ctx, `${pc.id}:${ev.id}:${priorCard}`)];
  let source: "template" | "llm" = "template";
  let latencyMs: number | null = null;
  const guard: Record<string, unknown> = {};

  if (env.aiEnabled() && priorCard < QUESTION_PER_CARD && priorDay < QUESTION_PER_DAY) {
    const res = await chat(questionerMessages({ publicCase: pc, evidenceLabel: ev.label, evidencePanel: ev.panel, confidence: body.confidence, type }), {
      consume: () => consumeAiCall(now),
      maxTokens: 160,
    });
    if (res) {
      latencyMs = res.latencyMs;
      guard.provider = res.provider;
      // 1) 숫자 발화 제한: 공개 자료·확신도의 숫자만
      const allowed = allowedNumbers(publicText, body.confidence);
      const numbered = parseQuestionerOutput(res.text).map((t) => guardSentences(t, allowed, SAFE_QUESTION));
      guard.numberReplaced = numbered.reduce((s, g) => s + g.replaced, 0);
      const texts = numbered.map((g) => g.text);
      // 2) 누수 필터: 하나라도 걸리면 응답을 버린다
      const leaks = texts.flatMap((t) => findLeaks(t, dict));
      guard.leakKinds = [...new Set(leaks.map((l) => l.kind))];
      if (texts.length > 0 && leaks.length === 0) {
        lines = texts;
        source = "llm";
      }
    } else {
      guard.llm = "unavailable";
    }
  }
  if (source === "template" && lines.some((t) => findLeaks(t, dict).length > 0)) {
    lines = [SAFE_QUESTION];
    guard.templateLeak = true;
  }
  // 3) 라벨(마지막 단계)
  const labeled = labelQuestion(lines);

  await prisma.aiDialog.create({
    data: {
      userId: user.id,
      caseId: pc.id,
      role: "questioner",
      source,
      templateType: type,
      text: lines.join("\n"),
      guard: guard as Prisma.InputJsonObject,
      latencyMs,
      localDate: toDbDate(today),
    },
  });
  return { templateType: type, lines: labeled, source };
}

/**
 * POST /api/ai/explain — 본문은 {judgmentId}만. 공개 뒤에만. AI_ENABLED=false면 템플릿 해설(공개 응답과 같다).
 * LLM 경로는 판단당 1회 생성 후 ai_dialogs에 캐시(부분 유일 인덱스로 동시 생성도 하나만 남는다).
 */
export async function explainJudgment(user: AuthedUser, judgmentId: string, now = new Date()): Promise<ExplainT> {
  const prisma = db();
  const j = await prisma.judgment.findFirst({ where: { id: judgmentId, userId: user.id }, include: { outcome: true } });
  if (!j) throw Errors.notFound();
  if (!j.revealedAt || !j.outcome) throw Errors.conflict("not_revealed", "공개한 뒤에 볼 수 있어요.");

  const cached = await prisma.aiDialog.findFirst({ where: { judgmentId: j.id, role: "explainer" } });
  if (cached) {
    const parsed = Explain.safeParse(JSON.parse(cached.text));
    if (parsed.success) return parsed.data;
  }

  const [o, extras] = await Promise.all([loadOutcome(j.caseId, j.caseVersion), loadRevealExtras(j.caseId, j.caseVersion)]);
  const lp = extras.learning[0];
  if (!o || !lp) throw new Error("reveal content missing");
  const input: ExplainInput = {
    evidence: j.keyEvidence,
    risk: j.riskFactor,
    direction: j.direction,
    state: j.outcome.state,
    hit: j.outcome.hit,
    returnPct: num(o.returnPct),
    benchReturnPct: num(o.benchReturnPct),
    relativePp: num(j.outcome.relativePp),
    benchName: o.benchName,
    conceptTitle: lp.concept.title,
  };
  const template: ExplainT = { persona: EXPLAIN_PERSONA, lines: labelExplain(templateExplainLines(input)), source: "template" };
  if (!env.aiEnabled()) return template;

  let result = template;
  const guard: Record<string, unknown> = {};
  let latencyMs: number | null = null;
  const res = await chat(
    explainerMessages({
      outcome: { companyName: o.companyName, period: o.period, returnPct: input.returnPct, benchReturnPct: input.benchReturnPct, benchName: o.benchName, relativePp: input.relativePp, state: input.state },
      judgment: { direction: j.direction, evidence: j.keyEvidence, risk: j.riskFactor, confidence: j.confidence },
      concept: { title: lp.concept.title, body: lp.concept.bodyMd },
      keyPoints: extras.keyPoints,
    }),
    { consume: () => consumeAiCall(now), maxTokens: 320 },
  );
  if (res) {
    latencyMs = res.latencyMs;
    guard.provider = res.provider;
    const out = parseExplainerOutput(res.text);
    if (out) {
      const allowed = [...explainAllowed(input), ...allowedNumbers(...extras.keyPoints, lp.concept.bodyMd)];
      const g = {
        good: guardSentences(out.good, allowed, SAFE_EXPLAIN.good, [lp.concept.title]),
        change: guardSentences(out.change, allowed, SAFE_EXPLAIN.change, [lp.concept.title]),
        concept: guardSentences(out.concept, allowed, SAFE_EXPLAIN.concept, [lp.concept.title]),
      };
      guard.numberReplaced = g.good.replaced + g.change.replaced + g.concept.replaced;
      result = {
        persona: EXPLAIN_PERSONA,
        lines: labelExplain([
          { kind: "good", text: g.good.text },
          { kind: "change", text: g.change.text },
          { kind: "concept", text: g.concept.text },
        ]),
        source: "llm",
      };
    } else guard.parse = "failed";
  } else guard.llm = "unavailable";

  await prisma.aiDialog.createMany({
    data: [
      {
        userId: user.id,
        caseId: j.caseId,
        judgmentId: j.id,
        role: "explainer",
        source: result.source,
        templateType: null,
        text: JSON.stringify(result),
        guard: guard as Prisma.InputJsonObject,
        latencyMs,
        localDate: toDbDate(localDate(now, user.tz)),
      },
    ],
    skipDuplicates: true,
  });
  const stored = await prisma.aiDialog.findFirst({ where: { judgmentId: j.id, role: "explainer" } });
  const parsed = stored ? Explain.safeParse(JSON.parse(stored.text)) : null;
  return parsed?.success ? parsed.data : result;
}

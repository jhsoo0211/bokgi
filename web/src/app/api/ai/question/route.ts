import { Question, QuestionBody } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { contractJson, readJson, route } from "@/lib/server/http";
import { askQuestion } from "@/server/ai";

/** POST /api/ai/question {caseId, evidenceId, confidence} — 질문자(판단 전). 기본 템플릿, LLM은 AI_ENABLED일 때만. */
export const POST = route(async (req) => {
  const body = await readJson(req, QuestionBody, 1024);
  const user = await requireUser(req);
  return contractJson(Question, await askQuestion(user, body));
});

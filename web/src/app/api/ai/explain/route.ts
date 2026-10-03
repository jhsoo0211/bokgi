import { Explain, ExplainBody } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { contractJson, readJson, route, uuidParam } from "@/lib/server/http";
import { explainJudgment } from "@/server/ai";

/** POST /api/ai/explain {judgmentId} — 해설자(공개 뒤). 템플릿 또는 LLM(1회 생성 후 캐시). */
export const POST = route(async (req) => {
  const body = await readJson(req, ExplainBody, 1024);
  const user = await requireUser(req);
  return contractJson(Explain, await explainJudgment(user, uuidParam(body.judgmentId)));
});

import { JudgmentBody, JudgmentCreated } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { contractJson, readJson, route } from "@/lib/server/http";
import { createJudgment } from "@/server/judgments";

/** POST /api/judgments — 새 판단 201, 같은 카드 재전송은 기존 판단 200(existing:true). */
export const POST = route(async (req) => {
  const body = await readJson(req, JudgmentBody);
  const user = await requireUser(req);
  const r = await createJudgment(user, body);
  return contractJson(JudgmentCreated, r, { status: r.existing ? 200 : 201 });
});

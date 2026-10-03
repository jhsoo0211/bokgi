import { Reveal } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { assertMutation, contractJson, route, uuidParam, type IdContext } from "@/lib/server/http";
import { revealJudgment } from "@/server/judgments";

/** POST /api/judgments/{id}/reveal — 조건부 공개 + 1회 채점. 반복 호출은 같은 응답. 남의 판단은 404. */
export const POST = route<IdContext>(async (req, ctx) => {
  assertMutation(req);
  const user = await requireUser(req);
  const id = uuidParam((await ctx.params).id);
  return contractJson(Reveal, await revealJudgment(user, id));
});

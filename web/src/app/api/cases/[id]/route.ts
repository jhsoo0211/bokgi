import { PublicCase } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { Errors, contractJson, route, uuidParam, type IdContext } from "@/lib/server/http";
import { loadPublicCase } from "@/server/cases";

/** GET /api/cases/{id} — toPublicCase() 결과만(판단 전 자료). 결과급 값 0. */
export const GET = route<IdContext>(async (req, ctx) => {
  await requireUser(req);
  const id = uuidParam((await ctx.params).id);
  const pc = await loadPublicCase(id);
  if (!pc) throw Errors.notFound();
  return contractJson(PublicCase, pc);
});

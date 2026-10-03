import { SelfCheckBody } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { json, readJson, route, uuidParam, type IdContext } from "@/lib/server/http";
import { setSelfCheck } from "@/server/judgments";

/** PUT /api/judgments/{id}/self-check {value: o|tri|x} — 공개 뒤에만. 바꿀 수 있고 지울 수 없다. */
export const PUT = route<IdContext>(async (req, ctx) => {
  const body = await readJson(req, SelfCheckBody, 1024);
  const user = await requireUser(req);
  const id = uuidParam((await ctx.params).id);
  await setSelfCheck(user, id, body.value);
  return json({ ok: true, selfCheck: body.value });
});

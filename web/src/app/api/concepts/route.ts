import { ConceptList } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { contractJson, route } from "@/lib/server/http";
import { listConcepts } from "@/server/concepts";

/** GET /api/concepts — 개념 + 숙련도 + 복습 예정 + 문제(정답 없음) */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  return contractJson(ConceptList, await listConcepts(user));
});

import { Today } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { contractJson, route } from "@/lib/server/http";
import { getToday } from "@/server/session";

/** GET /api/session/today[?extra=1] — 오늘 세트(고정)·복습 ≤2·스트릭. extra=1이면 '한 장 더' 카드 1장. */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const extra = req.nextUrl.searchParams.get("extra") === "1";
  return contractJson(Today, await getToday(user, { extra }));
});

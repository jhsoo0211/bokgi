import { Me } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { contractJson, route } from "@/lib/server/http";
import { meOf } from "@/server/prefs";

/** GET /api/me — 닉네임·온보딩 여부·tz·정보 수준(실제로 쓸 토글)·되돌리기 시간 */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return contractJson(Me, meOf(u));
});

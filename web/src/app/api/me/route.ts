import { Me } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { contractJson, route } from "@/lib/server/http";

/** GET /api/me — 닉네임·온보딩 여부·tz */
export const GET = route(async (req) => {
  const u = await requireUser(req);
  return contractJson(Me, { user: { id: u.id, nickname: u.nickname, onboarded: u.onboardedAt !== null, tz: u.tz } });
});

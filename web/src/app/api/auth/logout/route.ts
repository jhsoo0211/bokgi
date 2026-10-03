import { clearSessionCookie, revokeSession } from "@/lib/server/auth";
import { assertMutation, json, route } from "@/lib/server/http";

/** POST /api/auth/logout — 세션 폐기 + 쿠키 삭제. 이미 로그아웃이어도 200. */
export const POST = route(async (req) => {
  assertMutation(req);
  await revokeSession(req);
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});

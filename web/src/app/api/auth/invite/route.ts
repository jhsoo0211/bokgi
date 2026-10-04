import { InviteBody, Me } from "@/shared/contract";
import { setSessionCookie } from "@/lib/server/auth";
import { Errors, contractJson, readJson, route } from "@/lib/server/http";
import { INVITE_LIMITS, clientIpKey, hitLimit, pruneLimits } from "@/lib/server/rateLimit";
import { redeemInvite } from "@/server/authFlow";
import { meOf } from "@/server/prefs";

/**
 * POST /api/auth/invite {code, nickname} → 세션 쿠키 + Me.
 * 한도: CF-Connecting-IP당 10분 5회, 전체 시간당 30회(DB 카운터). 실패 문구는 하나.
 */
export const POST = route(async (req) => {
  const body = await readJson(req, InviteBody, 4 * 1024);
  const ip = await hitLimit(`invite:ip:${clientIpKey(req)}`, INVITE_LIMITS.perIp.windowSec, INVITE_LIMITS.perIp.limit);
  if (!ip.ok) throw Errors.rateLimited(ip.retryAfterSec);
  const all = await hitLimit("invite:all", INVITE_LIMITS.global.windowSec, INVITE_LIMITS.global.limit);
  if (!all.ok) throw Errors.rateLimited(all.retryAfterSec);
  if (ip.hits === 1) void pruneLimits();

  const { user, token, expiresAt } = await redeemInvite(body);
  const res = contractJson(Me, meOf(user));
  setSessionCookie(res, token, expiresAt);
  return res;
});

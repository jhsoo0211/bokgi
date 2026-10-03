import "server-only";
import { db, Prisma } from "./db";
import { sha256Hex } from "./crypto";

/**
 * 고정 창 카운터(rate_limits). 재배포에도 유지된다(메모리 카운터를 쓰지 않는다).
 * 시도마다 1 올리고, 한도를 넘으면 창이 끝날 때까지 남은 초를 돌려준다.
 */
export interface LimitResult {
  ok: boolean;
  hits: number;
  retryAfterSec: number;
}

export async function hitLimit(key: string, windowSec: number, limit: number, now = new Date()): Promise<LimitResult> {
  const windowMs = windowSec * 1000;
  const startMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const windowStart = new Date(startMs);
  const rows = await db().$queryRaw<{ hits: number }[]>(Prisma.sql`
    INSERT INTO "rate_limits" ("key", "window_start", "hits") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "window_start") DO UPDATE SET "hits" = "rate_limits"."hits" + 1
    RETURNING "hits"`);
  const hits = Number(rows[0]?.hits ?? 0);
  return { ok: hits <= limit, hits, retryAfterSec: Math.max(1, Math.ceil((startMs + windowMs - now.getTime()) / 1000)) };
}

/** 오래된 창 정리(하루 넘은 것). 실패해도 요청은 계속한다. */
export async function pruneLimits(now = new Date()): Promise<void> {
  try {
    await db().rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86_400_000) } } });
  } catch {
    /* 정리는 다음 기회에 */
  }
}

/** 터널(Cloudflare) 뒤라 원격 주소는 늘 같다 → CF-Connecting-IP. 원문 IP는 저장하지 않고 해시만 키로 쓴다. */
export function clientIpKey(req: Request): string {
  const ip =
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return sha256Hex(`ip:${ip}`).slice(0, 32);
}

export const INVITE_LIMITS = {
  perIp: { windowSec: 600, limit: 5 },
  global: { windowSec: 3600, limit: 30 },
} as const;

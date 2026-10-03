import "server-only";
import { db, Prisma } from "../db";
import { env } from "../env";
import { localDate, toDbDate } from "../time";

/**
 * 하루 LLM 호출 상한(ai_usage_daily, 판정 호출 포함). DB 카운터라 재배포에도 유지된다.
 * 호출 직전에 1을 올리고, 상한을 넘었으면 false(호출하지 않고 템플릿으로).
 */
export async function consumeAiCall(now = new Date()): Promise<boolean> {
  const day = toDbDate(localDate(now, env.appTz()));
  const rows = await db().$queryRaw<{ calls: number }[]>(Prisma.sql`
    INSERT INTO "ai_usage_daily" ("day", "calls") VALUES (${day}, 1)
    ON CONFLICT ("day") DO UPDATE SET "calls" = "ai_usage_daily"."calls" + 1
    RETURNING "calls"`);
  return Number(rows[0]?.calls ?? Number.POSITIVE_INFINITY) <= env.aiDailyCallCap();
}

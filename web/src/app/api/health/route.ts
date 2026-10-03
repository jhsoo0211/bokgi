import { Health } from "@/shared/contract";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { json, route } from "@/lib/server/http";

/** GET /api/health — DB만 확인(AI 제외). 감시(UptimeRobot)·배포 대기용. 인증 없음. */
export const GET = route(async () => {
  let ok = false;
  try {
    await db().$queryRaw`SELECT 1`;
    ok = true;
  } catch {
    ok = false;
  }
  const body = Health.parse({ ok, db: ok, version: env.version() });
  return json(body, { status: ok ? 200 : 503 });
});

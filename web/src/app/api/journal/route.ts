import { Journal } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { contractJson, route } from "@/lib/server/http";
import { getJournal } from "@/server/journal";

/** GET /api/journal[?month=YYYY-MM] — 판단 목록·연습 달력·통계(20장 뒤, 문장만) */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  return contractJson(Journal, await getJournal(user, req.nextUrl.searchParams.get("month")));
});

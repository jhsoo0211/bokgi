import { EventsBody } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";
import { ingestEvents } from "@/server/feedback";

/** POST /api/events — UI 이벤트(allow-list), 본문 ≤32KB, clientEventId 멱등 */
export const POST = route(async (req) => {
  const body = await readJson(req, EventsBody, 32 * 1024);
  const user = await requireUser(req);
  return json({ ok: true, ...(await ingestEvents(user, body)) });
});

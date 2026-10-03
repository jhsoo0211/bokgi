import { ReportBody } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";
import { createReport } from "@/server/feedback";

/** POST /api/reports — 카드 신고(카드 버전 첨부) */
export const POST = route(async (req) => {
  const body = await readJson(req, ReportBody, 4 * 1024);
  const user = await requireUser(req);
  const r = await createReport(user, body);
  return json({ ok: true, reportId: r.reportId }, { status: 201 });
});

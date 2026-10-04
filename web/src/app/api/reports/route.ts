import { ReportBody } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { json, readJson, route } from "@/lib/server/http";
import { createReport } from "@/server/feedback";

/**
 * POST /api/reports — 카드 신고(카드 버전 첨부). clientReportId 멱등:
 * 첫 접수 201 {ok, reportId}, 같은 사용자의 재전송은 200 + 같은 reportId(행을 더 만들지 않는다).
 */
export const POST = route(async (req) => {
  const body = await readJson(req, ReportBody, 4 * 1024);
  const user = await requireUser(req);
  const r = await createReport(user, body);
  return json({ ok: true, reportId: r.reportId }, { status: r.existing ? 200 : 201 });
});

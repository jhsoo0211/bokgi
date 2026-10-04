import "server-only";
import { UI_EVENTS, type EventsBody, type ReportBody } from "@/shared/contract";
import type { z } from "zod";
import type { AuthedUser } from "@/lib/server/auth";
import { db, Prisma } from "@/lib/server/db";
import { Errors } from "@/lib/server/http";

/** 같은 사용자가 같은 clientReportId로 이미 낸 신고 → 같은 reportId(재전송). 다른 카드에 쓴 id면 409. */
async function priorReport(userId: string, body: z.infer<typeof ReportBody>): Promise<{ reportId: string; existing: true } | null> {
  const prior = await db().report.findFirst({ where: { userId, clientReportId: body.clientReportId }, select: { id: true, caseId: true } });
  if (!prior) return null;
  if (prior.caseId !== body.caseId) throw Errors.conflict("report_conflict", "이미 다른 카드에 쓴 신고 번호예요.");
  return { reportId: prior.id, existing: true };
}

/**
 * POST /api/reports — 카드 버전과 함께 접수. 메모는 프롬프트·로그에 쓰지 않는다.
 * clientReportId 멱등: 첫 접수는 existing:false(201), 같은 사용자의 재전송은 같은 reportId로 existing:true(200).
 * 부분 유일 인덱스(user_id, client_report_id)에 INSERT … ON CONFLICT DO NOTHING이라 동시에 두 번 와도 1행이다.
 */
export async function createReport(user: AuthedUser, body: z.infer<typeof ReportBody>): Promise<{ reportId: string; existing: boolean }> {
  const prisma = db();
  const replay = await priorReport(user.id, body);
  if (replay) return replay;

  const c = await prisma.case.findUnique({ where: { id: body.caseId }, select: { id: true, version: true } });
  if (!c) throw Errors.notFound();
  if (body.caseVersion < 1 || body.caseVersion > c.version) throw Errors.validation("invalid_version", "카드 버전이 올바르지 않아요.");
  const note = body.note === null ? null : body.note.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim() || null;
  const created = await prisma.report.createManyAndReturn({
    data: [{ userId: user.id, caseId: c.id, caseVersion: body.caseVersion, category: body.category, note, clientReportId: body.clientReportId }],
    skipDuplicates: true,
    select: { id: true },
  });
  if (created.length === 1) return { reportId: created[0].id, existing: false };
  // 동시에 온 같은 신고가 먼저 들어갔다
  const again = await priorReport(user.id, body);
  if (!again) throw new Error("report insert skipped without a prior row");
  return again;
}

const ALLOWED = new Set<string>(UI_EVENTS);

function eventTime(ts: string, now: Date): Date {
  const t = Date.parse(ts);
  // 시계가 크게 어긋난 기기 값은 서버 시각으로
  if (!Number.isFinite(t) || t > now.getTime() + 86_400_000 || t < now.getTime() - 30 * 86_400_000) return now;
  return new Date(t);
}

/**
 * POST /api/events — UI 이벤트만(allow-list). clientEventId 멱등(ON CONFLICT DO NOTHING).
 * 'onboarding_done'을 받으면 users.onboarded_at을 처음 한 번 채운다(계약에 온보딩 완료 엔드포인트가 없어서).
 */
export async function ingestEvents(user: AuthedUser, body: z.infer<typeof EventsBody>, now = new Date()): Promise<{ accepted: number; duplicates: number; rejected: number }> {
  const prisma = db();
  const accepted = body.events.filter((e) => ALLOWED.has(e.event));
  const rejected = body.events.length - accepted.length;
  let inserted = 0;
  if (accepted.length > 0) {
    const r = await prisma.event.createMany({
      data: accepted.map((e) => ({
        userId: user.id,
        event: e.event,
        caseId: e.caseId,
        caseVersion: e.caseVersion,
        payload: e.payload === null ? Prisma.DbNull : (e.payload as Prisma.InputJsonObject),
        clientEventId: e.clientEventId,
        ts: eventTime(e.ts, now),
      })),
      skipDuplicates: true,
    });
    inserted = r.count;
  }
  if (accepted.some((e) => e.event === "onboarding_done")) {
    await prisma.user.updateMany({ where: { id: user.id, onboardedAt: null }, data: { onboardedAt: now } });
  }
  return { accepted: inserted, duplicates: accepted.length - inserted, rejected };
}

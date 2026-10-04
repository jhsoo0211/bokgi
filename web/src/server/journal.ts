import "server-only";
import { STATS_UNLOCK_AT, type Journal } from "@/shared/contract";
import type { z } from "zod";
import type { AuthedUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { Errors } from "@/lib/server/http";
import { fromDbDate, isMonthString, localDate, monthDays, monthOf } from "@/lib/server/time";
import { loadLeadConcepts, loadOutcomeHeads, num } from "./outcomes";
import { CALIBRATION_TEXT, calibration, insights, insightText, type DoneJudgment } from "./rules";

type JournalT = z.infer<typeof Journal>;

/**
 * GET /api/journal?month=YYYY-MM — 판단 목록(최신순)·연습 달력·통계.
 * 결과 대기 행(공개 전)은 판단 전 값만: companyName·ticker·result·conceptTitle = null, 그 카드의 결과 자료(학습 포인트 포함)는 읽지 않는다.
 * infoLevel은 판단 때의 정보 수준(사용자 설정이라 공개 전에도 낸다).
 * 통계는 공개된 판단 20장 미만이면 잠그고, 열려도 인사이트 문장(횟수)만 — 퍼센트·적중률 숫자는 없다(ADR-0002).
 */
export async function getJournal(user: AuthedUser, monthParam: string | null, now = new Date()): Promise<JournalT> {
  const prisma = db();
  const today = localDate(now, user.tz);
  if (monthParam !== null && !isMonthString(monthParam)) throw Errors.validation("invalid_month", "달 형식은 YYYY-MM이에요.");
  const month = monthParam ?? monthOf(today);

  const [rows, progress] = await Promise.all([
    prisma.judgment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { case: { select: { sectorPublic: true, sizeBucket: true } }, outcome: true },
    }),
    prisma.conceptProgress.findMany({ where: { userId: user.id, dueOn: { not: null }, concept: { active: true } }, select: { dueOn: true } }),
  ]);

  type Row = (typeof rows)[number];
  const revealedRows = rows.filter((r): r is Row & { outcome: NonNullable<Row["outcome"]> } => Boolean(r.revealedAt && r.outcome));
  const revealedKeys = revealedRows.map((r) => ({ caseId: r.caseId, version: r.caseVersion }));
  const [heads, leads] = await Promise.all([loadOutcomeHeads(revealedKeys), loadLeadConcepts(revealedKeys)]);

  const items = rows.map((r) => {
    const revealed = Boolean(r.revealedAt && r.outcome);
    const key = `${r.caseId}:${r.caseVersion}`;
    const head = revealed ? heads.get(key) : undefined;
    return {
      judgmentId: r.id,
      createdAt: r.createdAt.toISOString(),
      localDate: fromDbDate(r.localDate),
      direction: r.direction,
      confidence: r.confidence,
      keyEvidence: r.keyEvidence,
      recognized: r.recognized,
      selfCheck: r.selfCheck,
      revealed,
      companyName: revealed ? (head?.companyName ?? null) : null,
      ticker: revealed ? (head?.ticker ?? null) : null,
      result: revealed && r.outcome ? { relativePp: num(r.outcome.relativePp), state: r.outcome.state, hit: r.outcome.hit } : null,
      conceptTitle: revealed ? (leads.get(key)?.title ?? null) : null,
      sectorPublic: r.case.sectorPublic,
      sizeBucket: r.case.sizeBucket,
      infoLevel: r.infoLevel,
    };
  });

  // 연습 달력: 판단한 날 = 점, 복습 예정일 = 테두리(기한 지난 복습은 오늘로 당겨 센다). 결과 상태로 칠하지 않는다.
  const practiced = new Set(rows.map((r) => fromDbDate(r.localDate)));
  const dueCount = new Map<string, number>();
  for (const p of progress) {
    if (!p.dueOn) continue;
    const d = fromDbDate(p.dueOn);
    const k = d < today ? today : d;
    dueCount.set(k, (dueCount.get(k) ?? 0) + 1);
  }
  const days = monthDays(month).map((date) => ({ date, practiced: practiced.has(date), due: (dueCount.get(date) ?? 0) > 0 }));

  const done: DoneJudgment[] = revealedRows.map((r) => ({
    confidence: r.confidence,
    keyEvidence: r.keyEvidence,
    recognized: r.recognized,
    state: r.outcome.state,
    hit: r.outcome.hit,
  }));
  const locked = done.length < STATS_UNLOCK_AT;

  return {
    items,
    count: items.length,
    calendar: {
      month,
      days,
      practicedDays: days.filter((d) => d.practiced).length,
      reviewsDue: monthDays(month).reduce((s, d) => s + (dueCount.get(d) ?? 0), 0),
    },
    stats: {
      locked,
      unlockAt: STATS_UNLOCK_AT,
      insights: locked ? [] : insights(done).slice(0, 3).map(insightText),
      calibrationNote: locked ? null : CALIBRATION_TEXT[calibration(done)],
    },
  };
}

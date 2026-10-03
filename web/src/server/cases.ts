import "server-only";
import { PublicCase, type EvidenceOption, type RiskOption } from "@/shared/contract";
import type { z } from "zod";
import { db, type Db } from "@/lib/server/db";
import type { Case, CaseBlock } from "@/server/generated/prisma/client";

/**
 * 판단 전 읽기 경로는 이것 하나다(ADR-0001, 05 §0-1).
 * Route Handler·서버 컴포넌트·질문자가 모두 toPublicCase()만 쓴다. 결과 테이블(case_outcomes 등)을 읽지 않는다.
 * 계약의 PublicCase는 .strict() — 판 payload에 모르는 키가 섞이면 통과하지 못하고 500으로 막힌다(결과 유출 방지).
 */
export type PublicCaseT = z.infer<typeof PublicCase>;
export type CaseRow = Case & { blocks: CaseBlock[] };

const StrictPublicCase = PublicCase.strict();

export function toPublicCase(row: CaseRow): PublicCaseT {
  const panel = (kind: CaseBlock["kind"]) => row.blocks.find((b) => b.kind === kind && b.version === row.version)?.payload;
  // 행의 다른 열(예: status·deck_order·created_at)은 골라 넣지 않는다 — 필드를 '빼는' 대신 '고른다'
  return StrictPublicCase.parse({
    id: row.id,
    version: row.version,
    yearPublic: row.yearPublic,
    sectorPublic: row.sectorPublic,
    sizeBucket: row.sizeBucket,
    horizonDays: row.horizonDays,
    difficulty: row.difficulty,
    panels: { flow: panel("flow"), numbers: panel("numbers"), then: panel("then") },
    evidenceOptions: row.evidenceOptions,
    riskOptions: row.riskOptions,
  });
}

/** live 카드의 현재 버전(판 3개 포함). 없거나 live가 아니면 null. */
export async function loadCaseRow(id: string, client: Db = db()): Promise<CaseRow | null> {
  const row = await client.case.findUnique({ where: { id }, include: { blocks: true } });
  if (!row || row.status !== "live") return null;
  return { ...row, blocks: row.blocks.filter((b) => b.version === row.version) };
}

export async function loadPublicCase(id: string, client: Db = db()): Promise<PublicCaseT | null> {
  const row = await loadCaseRow(id, client);
  return row ? toPublicCase(row) : null;
}

export function findEvidence(pc: PublicCaseT, id: string): z.infer<typeof EvidenceOption> | undefined {
  return pc.evidenceOptions.find((e) => e.id === id);
}

export function findRisk(pc: PublicCaseT, id: string): z.infer<typeof RiskOption> | undefined {
  return pc.riskOptions.find((r) => r.id === id);
}

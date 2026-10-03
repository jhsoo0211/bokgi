import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PublicCase } from "@/shared/contract";
import { toPublicCase, type CaseRow } from "@/server/cases";
import type { CaseBlock } from "@/server/generated/prisma/client";

const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "../fixtures/content/cards/example-c001.json"), "utf8"));

function row(over: Partial<CaseRow> = {}, panels: Record<string, unknown> = fixture.public.panels): CaseRow {
  const blocks = (["flow", "numbers", "then"] as const)
    .filter((k) => panels[k] !== undefined)
    .map((kind) => ({ caseId: fixture.id, version: 1, kind, payload: panels[kind] }) as CaseBlock);
  return {
    id: fixture.id,
    version: 1,
    yearPublic: fixture.public.yearPublic,
    sectorPublic: fixture.public.sectorPublic,
    sizeBucket: fixture.public.sizeBucket,
    horizonDays: fixture.public.horizonDays,
    difficulty: fixture.public.difficulty,
    status: "live",
    deckOrder: 2,
    evidenceOptions: fixture.public.evidenceOptions,
    riskOptions: fixture.public.riskOptions,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewedAt: null,
    blocks,
    ...over,
  };
}

describe("toPublicCase — 판단 전 유일한 읽기 경로(.strict())", () => {
  it("계약 PublicCase와 정확히 같은 키만 낸다", () => {
    const pc = toPublicCase(row());
    expect(PublicCase.strict().safeParse(pc).success).toBe(true);
    expect(Object.keys(pc).sort()).toEqual(
      ["id", "version", "yearPublic", "sectorPublic", "sizeBucket", "horizonDays", "difficulty", "panels", "evidenceOptions", "riskOptions"].sort(),
    );
    // 행의 다른 열(status·deck_order·시각)은 나가지 않는다
    expect(JSON.stringify(pc)).not.toMatch(/deckOrder|status|createdAt/);
  });

  it("행에 끼어든 결과급 속성은 골라 넣지 않으므로 나가지 않는다", () => {
    const tainted = { ...row(), companyName: "어도비", ticker: "ADBE" } as CaseRow;
    const text = JSON.stringify(toPublicCase(tainted));
    expect(text).not.toContain("어도비");
    expect(text).not.toContain("ADBE");
  });

  it("판 payload에 모르는 키가 있으면 거절한다(필드 빼기가 아니라 실패)", () => {
    const panels = { ...fixture.public.panels, numbers: { ...fixture.public.panels.numbers, companyName: "어도비" } };
    expect(() => toPublicCase(row({}, panels))).toThrow();
  });

  it("중첩 객체 안의 모르는 키도 거절한다", () => {
    const numbers = { ...fixture.public.panels.numbers, growth: { ...fixture.public.panels.numbers.growth, returnPct: 4.8 } };
    expect(() => toPublicCase(row({}, { ...fixture.public.panels, numbers }))).toThrow();
    const then = { ...fixture.public.panels.then, notes: [{ when: "판단일 D-1", text: "x", sourceKind: "공시", sourceRef: "url" }] };
    expect(() => toPublicCase(row({}, { ...fixture.public.panels, then }))).toThrow();
  });

  it("칩에 모르는 키(정답 표시 등)가 있으면 거절한다", () => {
    const evidenceOptions = fixture.public.evidenceOptions.map((e: Record<string, unknown>, i: number) => (i === 0 ? { ...e, isKey: true } : e));
    expect(() => toPublicCase(row({ evidenceOptions }))).toThrow();
  });

  it("판이 빠지면 거절한다", () => {
    const { then: _then, ...rest } = fixture.public.panels;
    void _then;
    expect(() => toPublicCase(row({}, rest))).toThrow();
  });

  it("다른 버전의 판은 쓰지 않는다", () => {
    const r = row();
    const old = r.blocks.map((b) => ({ ...b, version: 0 }));
    expect(() => toPublicCase({ ...r, blocks: old })).toThrow();
  });
});

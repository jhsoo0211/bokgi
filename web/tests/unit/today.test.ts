import { describe, expect, it } from "vitest";
import { extraJudgedOn, revealedOn, uniqueBy } from "@/server/rules";

describe("오늘의 '한 장 더' 수 (extraJudgedOn)", () => {
  it("그날 local_date의 is_extra 판단만 센다", () => {
    const rows = [
      { isExtra: true, localDate: "2026-10-04" },
      { isExtra: true, localDate: "2026-10-04" },
      { isExtra: false, localDate: "2026-10-04" },
      { isExtra: true, localDate: "2026-10-03" },
    ];
    expect(extraJudgedOn(rows, "2026-10-04")).toBe(2);
    expect(extraJudgedOn(rows, "2026-10-03")).toBe(1);
    expect(extraJudgedOn([], "2026-10-04")).toBe(0);
  });
});

describe("오늘 공개한 판단 (revealedOn) — 사용자 tz의 날짜", () => {
  // 14:30Z = 서울 10/3 23:30 = LA 10/3 07:30 / 15:30Z = 서울 10/4 00:30 = LA 10/3 08:30
  const rows = [
    { id: "late", revealedAt: new Date("2026-10-03T15:30:00Z") },
    { id: "early", revealedAt: new Date("2026-10-03T14:30:00Z") },
    { id: "waiting", revealedAt: null },
  ];

  it("공개 전 판단은 빠진다", () => {
    expect(revealedOn(rows, "2026-10-03", "America/Los_Angeles").map((r) => r.id)).not.toContain("waiting");
    expect(revealedOn([{ id: "w", revealedAt: null }], "2026-10-04", "Asia/Seoul")).toEqual([]);
  });

  it("같은 순간도 tz에 따라 다른 날, 공개 순서로", () => {
    expect(revealedOn(rows, "2026-10-03", "America/Los_Angeles").map((r) => r.id)).toEqual(["early", "late"]);
    expect(revealedOn(rows, "2026-10-03", "Asia/Seoul").map((r) => r.id)).toEqual(["early"]);
    expect(revealedOn(rows, "2026-10-04", "Asia/Seoul").map((r) => r.id)).toEqual(["late"]);
    expect(revealedOn(rows, "2026-10-04", "America/Los_Angeles")).toEqual([]);
  });
});

describe("개념당 한 번 (uniqueBy)", () => {
  it("처음 나온 것만, 순서 유지", () => {
    const met = [{ c: "a", n: 1 }, { c: "b", n: 2 }, { c: "a", n: 3 }, { c: "c", n: 4 }];
    expect(uniqueBy(met, (x) => x.c)).toEqual([{ c: "a", n: 1 }, { c: "b", n: 2 }, { c: "c", n: 4 }]);
  });
});

import { describe, expect, it } from "vitest";
import { REVIEW_INTERVALS, hitOf, resultState, roundPp } from "@/shared/contract";
import { nextConceptState, nextReview, pickSessionCases, scoreOutcome, streakFrom } from "@/server/rules";

describe("결과 세 상태 (resultState·hitOf·scoreOutcome)", () => {
  it("±1%p 이내는 비슷함, 경계값 포함", () => {
    expect(resultState(1.0)).toBe("even");
    expect(resultState(-1.0)).toBe("even");
    expect(resultState(0)).toBe("even");
    expect(resultState(1.1)).toBe("ahead");
    expect(resultState(-1.1)).toBe("behind");
  });

  it("비슷함은 적중·실패로 세지 않는다(hit=null)", () => {
    expect(hitOf("even", "outperform")).toBeNull();
    expect(hitOf("even", "underperform")).toBeNull();
    expect(hitOf("ahead", "outperform")).toBe(true);
    expect(hitOf("ahead", "underperform")).toBe(false);
    expect(hitOf("behind", "underperform")).toBe(true);
    expect(hitOf("behind", "outperform")).toBe(false);
  });

  it("시장 대비는 소수 첫째 자리로 반올림한 뒤 상태를 정한다(프로토타입과 같음)", () => {
    expect(scoreOutcome(4.8, 7.1, "outperform")).toEqual({ relativePp: -2.3, state: "behind", hit: false });
    expect(scoreOutcome(-12.4, 3.2, "underperform")).toEqual({ relativePp: -15.6, state: "behind", hit: true });
    expect(scoreOutcome(10.2, 9.8, "outperform")).toEqual({ relativePp: 0.4, state: "even", hit: null });
    expect(scoreOutcome(2.1, 26.5, "outperform")).toEqual({ relativePp: -24.4, state: "behind", hit: false });
    expect(scoreOutcome(42.42, 3.1, "outperform")).toEqual({ relativePp: 39.3, state: "ahead", hit: true });
  });

  it("경계값은 계약의 roundPp(반올림 뒤 ±1.0 판정)를 따른다 — 카드 도구·클라이언트와 같은 답", () => {
    // −1.05 → roundPp −1.0(비슷함). toFixed(1)이면 −1.1(뒤짐)으로 갈렸던 값
    expect(roundPp(-1.05)).toBe(-1);
    expect(scoreOutcome(-0.05, 1, "outperform")).toEqual({ relativePp: -1, state: "even", hit: null });
    expect(scoreOutcome(0.95, 2, "underperform")).toEqual({ relativePp: -1, state: "even", hit: null });
    expect(scoreOutcome(1.06, 0, "outperform")).toEqual({ relativePp: 1.1, state: "ahead", hit: true });
  });

  it("음의 0을 0으로", () => {
    const r = scoreOutcome(5, 5, "outperform");
    expect(Object.is(r.relativePp, -0)).toBe(false);
    expect(r).toEqual({ relativePp: 0, state: "even", hit: null });
  });
});

describe("복습 일정 nextReview (1·3·7·21일)", () => {
  const today = "2026-10-04";

  it("새 개념을 맞히면 level 0, 내일", () => {
    expect(nextReview(null, true, today)).toEqual({ level: 0, dueOn: "2026-10-05", kept: false });
  });

  it("새 개념을 틀려도 level 0, 내일", () => {
    expect(nextReview(null, false, today)).toEqual({ level: 0, dueOn: "2026-10-05", kept: false });
  });

  it("기한이 된 날 맞히면 level+1, 간격도 늘어난다", () => {
    expect(nextReview({ level: 0, dueOn: today }, true, today)).toEqual({ level: 1, dueOn: "2026-10-07", kept: false });
    expect(nextReview({ level: 1, dueOn: "2026-10-01" }, true, today)).toEqual({ level: 2, dueOn: "2026-10-11", kept: false });
    expect(nextReview({ level: 2, dueOn: today }, true, today)).toEqual({ level: 3, dueOn: "2026-10-25", kept: false });
  });

  it("level은 3(21일)에서 멈춘다", () => {
    expect(nextReview({ level: 3, dueOn: today }, true, today)).toEqual({ level: 3, dueOn: "2026-10-25", kept: false });
    expect(REVIEW_INTERVALS[3]).toBe(21);
  });

  it("틀리면 level 0으로", () => {
    expect(nextReview({ level: 3, dueOn: today }, false, today)).toEqual({ level: 0, dueOn: "2026-10-05", kept: false });
  });

  it("기한 전에 맞히면 level·기한을 그대로 둔다", () => {
    expect(nextReview({ level: 2, dueOn: "2026-10-09" }, true, today)).toEqual({ level: 2, dueOn: "2026-10-09", kept: true });
  });

  it("기한 전이라도 틀리면 level 0", () => {
    expect(nextReview({ level: 2, dueOn: "2026-10-09" }, false, today)).toEqual({ level: 0, dueOn: "2026-10-05", kept: false });
  });
});

describe("숙련도 nextConceptState", () => {
  it("신규 → 학습 중 → 이해, 틀리면 복습 필요, 3/4 이상이면 다시 이해", () => {
    let p = { correct: 0, total: 0 };
    const seq: [boolean, string][] = [
      [true, "learning"],
      [true, "known"],
      [false, "review"],
      [true, "known"],
      [false, "review"],
    ];
    for (const [ok, want] of seq) {
      const n = nextConceptState(p, ok);
      expect(n.state).toBe(want);
      p = { correct: n.correct, total: n.total };
    }
    expect(p).toEqual({ correct: 3, total: 5 });
  });
});

describe("오늘 세트·스트릭", () => {
  it("미판단 카드만 덱 순서대로 3장", () => {
    expect(pickSessionCases(["a", "b", "c", "d", "e"], new Set(["b"]))).toEqual(["a", "c", "d"]);
    expect(pickSessionCases(["a", "b"], new Set(["a", "b"]))).toEqual([]);
    expect(pickSessionCases(["a", "b", "c", "d"], new Set(), 2)).toEqual(["a", "b"]);
  });

  it("스트릭: 오늘 포함 연속 일수", () => {
    expect(streakFrom(["2026-10-04", "2026-10-03", "2026-10-02"], "2026-10-04")).toBe(3);
  });

  it("오늘 아직 안 했으면 어제까지로 센다", () => {
    expect(streakFrom(["2026-10-03", "2026-10-02"], "2026-10-04")).toBe(2);
  });

  it("하루라도 비면 거기서 끊긴다(비난 없음, 0부터 다시)", () => {
    expect(streakFrom(["2026-10-04", "2026-10-02", "2026-10-01"], "2026-10-04")).toBe(1);
    expect(streakFrom(["2026-10-01"], "2026-10-04")).toBe(0);
    expect(streakFrom([], "2026-10-04")).toBe(0);
  });

  it("달·해 경계를 넘어 센다", () => {
    expect(streakFrom(["2027-01-01", "2026-12-31", "2026-12-30"], "2027-01-01")).toBe(3);
    expect(streakFrom(["2028-03-01", "2028-02-29", "2028-02-28"], "2028-03-01")).toBe(3);
  });
});

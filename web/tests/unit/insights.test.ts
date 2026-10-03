import { describe, expect, it } from "vitest";
import { evidenceKind, josa } from "@/lib/server/ko";
import { CALIBRATION_TEXT, calibration, insightText, insights, type DoneJudgment } from "@/server/rules";

const LABELS = ["매출 +23%", "부채비율 88%", "PER 38 vs 27", "금리 5.25%", "가이던스 상향", "매출 −8%", "영업이익률 31% → 34%"];
const STATES = ["ahead", "behind", "even"] as const;

function synthetic(n: number): DoneJudgment[] {
  return Array.from({ length: n }, (_, i) => {
    const state = STATES[(i * 7) % 3];
    const direction = i % 2 === 0;
    return {
      confidence: (i % 5) + 1,
      keyEvidence: LABELS[i % LABELS.length],
      recognized: i % 3 === 0,
      state,
      hit: state === "even" ? null : (state === "ahead") === direction,
    };
  });
}

describe("근거 종류·조사", () => {
  it("숫자·%·vs가 든 낱말을 뺀다", () => {
    expect(evidenceKind("매출 +23%")).toBe("매출");
    expect(evidenceKind("PER 38 vs 27")).toBe("PER");
    expect(evidenceKind("가이던스 상향")).toBe("가이던스 상향");
    expect(evidenceKind("부채비율 88%")).toBe("부채비율");
    expect(evidenceKind("영업이익률 31% → 34%")).toBe("영업이익률");
  });

  it("받침에 따라 조사를 고른다(숫자·영문은 읽는 소리)", () => {
    expect(josa("매출", "을", "를")).toBe("을");
    expect(josa("가이던스", "을", "를")).toBe("를");
    expect(josa("5", "을", "를")).toBe("를");
    expect(josa("3", "을", "를")).toBe("을");
    expect(josa("PER", "을", "를")).toBe("을");
    expect(josa("'매출 +23%'", "을", "를")).toBe("를");
  });
});

describe("인사이트 문장: 횟수만, 퍼센트 없음 (ADR-0002)", () => {
  it("어떤 조합에서도 '%'가 나오지 않는다", () => {
    for (const n of [3, 5, 9, 20, 40, 77]) {
      const texts = insights(synthetic(n)).map(insightText);
      for (const t of texts) {
        expect(t).not.toMatch(/[%％]/);
        expect(t).not.toMatch(/퍼센트|비율\s*\d|적중률/);
      }
    }
  });

  it("프로토타입과 같은 문장 틀", () => {
    const done: DoneJudgment[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ confidence: 5, keyEvidence: "매출 +23%", recognized: false, state: i < 2 ? ("ahead" as const) : ("behind" as const), hit: i < 2 })),
    ];
    const texts = insights(done).map(insightText);
    expect(texts[0]).toBe("확신도 5를 준 판단 6번 중 시장보다 앞선 것은 2번이었어요.");
    expect(texts[1]).toBe("'매출'을 근거로 한 판단 6번 중 4번이 시장보다 뒤졌어요.");
  });

  it("아는/모르는 회사 비교는 두 쪽 모두 3번 이상일 때만", () => {
    const base = { confidence: 3, keyEvidence: "가이던스 상향", state: "ahead" as const, hit: true };
    const few = [...Array(3)].map(() => ({ ...base, recognized: true })).concat([...Array(2)].map(() => ({ ...base, recognized: false })));
    expect(insights(few).some((i) => i.kind === "recognized")).toBe(false);
    const enough = few.concat([{ ...base, recognized: false }]);
    const rec = insights(enough).find((i) => i.kind === "recognized");
    expect(rec && insightText(rec)).toBe("아는 회사 판단 3번과 모르는 회사 판단 3번의 앞섬 횟수는 3번·3번이었어요.");
  });

  it("표본이 작으면 인사이트를 만들지 않는다", () => {
    expect(insights(synthetic(2))).toEqual([]);
  });
});

describe("확신도 보정(글로만)", () => {
  const mk = (confidence: number, hit: boolean): DoneJudgment => ({ confidence, keyEvidence: "x", recognized: false, state: hit ? "ahead" : "behind", hit });

  it("10장 미만이면 few", () => {
    expect(calibration(Array.from({ length: 9 }, () => mk(5, true)))).toBe("few");
  });

  it("높은 확신에 결과가 엇갈리면 over, 낮은 확신에 맞으면 under, 비슷하면 fit", () => {
    expect(calibration(Array.from({ length: 10 }, () => mk(5, false)))).toBe("over");
    expect(calibration(Array.from({ length: 10 }, () => mk(1, true)))).toBe("under");
    expect(calibration(Array.from({ length: 10 }, (_, i) => mk(1, i < 5)))).toBe("fit");
  });

  it("비슷함(hit=null)은 보정에서 뺀다", () => {
    const evens: DoneJudgment[] = Array.from({ length: 30 }, () => ({ confidence: 5, keyEvidence: "x", recognized: false, state: "even", hit: null }));
    expect(calibration(evens)).toBe("few");
  });

  it("보정 문장에 퍼센트가 없다", () => {
    for (const t of Object.values(CALIBRATION_TEXT)) expect(t).not.toMatch(/[%％]/);
  });
});

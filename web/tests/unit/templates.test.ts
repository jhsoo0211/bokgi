import { describe, expect, it } from "vitest";
import { Explain, Question } from "@/shared/contract";
import { labelExplain, labelQuestion } from "@/lib/server/ai/labels";
import { EXPLAIN_PERSONA, SAFE_EXPLAIN, pickQuestionType, stableIndex, templateExplainLines, templateQuestion, type ExplainInput } from "@/lib/server/ai/templates";

const base: ExplainInput = {
  evidence: "매출 +23%",
  risk: null,
  direction: "outperform",
  state: "behind",
  hit: false,
  returnPct: 4.8,
  benchReturnPct: 7.1,
  relativePp: -2.3,
  benchName: "S&P 500",
  conceptTitle: "절대수익과 시장 대비",
};

describe("템플릿 해설 세 줄(프로토타입 AI.explain 이식)", () => {
  it("잘 읽은 것·바꿀 것·개념 연결, 라벨 📄/🔍/📄", () => {
    const lines = labelExplain(templateExplainLines(base));
    expect(lines.map((l) => [l.kind, l.label])).toEqual([
      ["good", "source"],
      ["change", "inference"],
      ["concept", "source"],
    ]);
    expect(lines[0].text).toBe("'매출 +23%'를 핵심 근거로 짚어 두었기에, 시장 대비 −2.3%p라는 결과와 나란히 되짚어 볼 수 있어요.");
    expect(lines[1].text).toBe("다음에는 '매출 +23%'와 함께 가장 큰 위험 요인도 하나 골라, 반대로 움직일 가능성을 같이 적어 보세요.");
    expect(lines[2].text).toBe("이번 결과를 읽는 데 필요한 개념은 절대수익과 시장 대비예요.");
    expect(Explain.safeParse({ persona: EXPLAIN_PERSONA, lines, source: "template" }).success).toBe(true);
  });

  it("방향이 같으면(적중) 고른 방향을 말하고, 위험 요인이 있으면 반영 여부를 묻는다", () => {
    const lines = templateExplainLines({ ...base, direction: "underperform", hit: true, risk: "금리 상승" });
    expect(lines[0].text).toContain("'시장보다 뒤졌다'를 골랐고");
    expect(lines[1].text).toContain("이미 가격에 반영돼 있었는지");
  });

  it("비슷함은 적중·실패로 말하지 않는다", () => {
    const lines = templateExplainLines({ ...base, state: "even", hit: null, relativePp: 0.4, returnPct: 10.2, benchReturnPct: 9.8, risk: "x" });
    expect(lines[0].text).toContain("시장과 거의 같았어요");
    expect(lines[1].text).toContain("근거의 힘을 가리기 어려우니");
  });

  it("받침 있는 개념 이름은 '이에요'", () => {
    expect(templateExplainLines({ ...base, conceptTitle: "기저확률과 노이즈" })[2].text).toBe("이번 결과를 읽는 데 필요한 개념은 기저확률과 노이즈예요.");
    expect(templateExplainLines({ ...base, conceptTitle: "높은 부채와 경기 민감도" })[2].text).toBe("이번 결과를 읽는 데 필요한 개념은 높은 부채와 경기 민감도예요.");
    expect(templateExplainLines({ ...base, conceptTitle: "확신도 보정" })[2].text).toBe("이번 결과를 읽는 데 필요한 개념은 확신도 보정이에요.");
  });

  it("숫자 가드: 허용 숫자 밖이면 그 줄을 숫자 없는 문장으로", () => {
    // 근거 칩에 결과와 무관한 숫자가 있어도 칩 숫자는 허용된다
    expect(templateExplainLines({ ...base, evidence: "PER 38 vs 27" })[0].text).toContain("'PER 38 vs 27'");
    // 시장 이름이 숫자를 품어도 허용(S&P 500)
    expect(templateExplainLines(base).every((l) => !Object.values(SAFE_EXPLAIN).includes(l.text as never))).toBe(true);
  });
});

describe("템플릿 질문(6유형 × 3문장), 방향 중립", () => {
  it("유형은 판·확신도·앞서 물은 횟수로만 정한다", () => {
    expect(pickQuestionType("numbers", 3)).toBe(1);
    expect(pickQuestionType("flow", 2)).toBe(3);
    expect(pickQuestionType("then", 3)).toBe(4);
    expect(pickQuestionType("numbers", 1)).toBe(2);
    expect(pickQuestionType("then", 4)).toBe(5);
    expect(pickQuestionType("flow", 5)).toBe(6);
    expect(pickQuestionType("numbers", 3, 1)).toBe(2);
    expect(pickQuestionType("flow", 5, 1)).toBe(1);
  });

  it("같은 입력이면 같은 문장(결정적)", () => {
    const ctx = { ev: "매출 +23%", panel: "numbers" as const, conf: 3 };
    expect(templateQuestion(1, ctx, "seed")).toBe(templateQuestion(1, ctx, "seed"));
    expect(stableIndex("abc", 3)).toBe(stableIndex("abc", 3));
  });

  it("모든 유형·문장이 계약을 지키고, 칩·확신도 외의 숫자를 쓰지 않는다", () => {
    for (const type of [1, 2, 3, 4, 5, 6] as const) {
      for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
        const text = templateQuestion(type, { ev: "가이던스 상향", panel: "then", conf: 4 }, seed);
        expect(text).not.toMatch(/[0-35-9]/); // 확신도 4만 나올 수 있다
        expect(Question.safeParse({ templateType: type, lines: labelQuestion([text]), source: "template" }).success).toBe(true);
      }
    }
  });
});

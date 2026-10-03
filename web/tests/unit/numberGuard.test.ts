import { describe, expect, it } from "vitest";
import { allowedNumbers, guardSentences, numericTokens, passesNumberGuard, splitSentences } from "@/lib/server/ai/numberGuard";

describe("numberGuard (IfSave NumberGuard 의미)", () => {
  const allowed = allowedNumbers("+4.8", "+7.1", "−2.3", "S&P 500", "PER 38 vs 27");

  it("허용 집합의 숫자는 통과(소수는 ±0.5, 정수는 ±1)", () => {
    expect(passesNumberGuard("시장 대비 −2.3%p로 뒤졌어요.", allowed)).toBe(true);
    expect(passesNumberGuard("기업은 +4.8%, 시장은 +7.1%였어요.", allowed)).toBe(true);
    expect(passesNumberGuard("PER 38은 업종 27보다 높았어요.", allowed)).toBe(true);
    expect(passesNumberGuard("약 5% 올랐어요.", allowed)).toBe(true); // 4.8 ± 0.5
    expect(passesNumberGuard("PER 39 정도였어요.", allowed)).toBe(true); // 38 ± 1
  });

  it("허용 집합 밖의 숫자는 실패", () => {
    expect(passesNumberGuard("수익률은 55%였어요.", allowed)).toBe(false);
    expect(passesNumberGuard("PER 45였어요.", allowed)).toBe(false);
    expect(passesNumberGuard("시장보다 12.5%p 앞섰어요.", allowed)).toBe(false);
  });

  it("작은 횟수·기간(0·1·2·3·6·12·36)은 넘기되, 바로 뒤에 %·배·원·달러가 오면 검사한다", () => {
    expect(passesNumberGuard("카드 3장을 6개월 기준으로 봐요.", [])).toBe(true);
    expect(passesNumberGuard("12개월 뒤에도 같을까요?", [])).toBe(true);
    expect(passesNumberGuard("3% 올랐어요.", [])).toBe(false);
    expect(passesNumberGuard("2배가 됐어요.", [])).toBe(false);
    expect(passesNumberGuard("배당은 2배당이…", [])).toBe(true); // '배당'은 단위가 아니다
  });

  it("연도는 바로 뒤에 '년'이 올 때만 넘긴다", () => {
    expect(passesNumberGuard("2023년 상황이에요.", [])).toBe(true);
    expect(passesNumberGuard("2,050원이었어요.", [])).toBe(false);
    expect(passesNumberGuard("2050 정도였어요.", [])).toBe(false);
  });

  it("부호(−·-)는 보지 않고 절댓값으로 비교한다", () => {
    expect(passesNumberGuard("−12.4%였어요.", allowedNumbers(-12.4))).toBe(true);
    expect(passesNumberGuard("-12.4%였어요.", allowedNumbers(-12.4))).toBe(true);
  });

  it("이름 속 숫자는 마스킹해서 비교하지 않는다", () => {
    expect(passesNumberGuard("KODEX 200을 기준으로 봐요.", [], ["KODEX 200"])).toBe(true);
    expect(passesNumberGuard("KODEX 200을 기준으로 봐요.", [])).toBe(false);
  });

  it("문장 나누기는 '5.25%'를 자르지 않는다", () => {
    expect(splitSentences("금리는 5.25%였어요. 다음은?")).toEqual(["금리는 5.25%였어요.", "다음은?"]);
    expect(numericTokens("PER 38 vs 27, 금리 5.25%")).toEqual([38, 27, 5.25]);
  });

  it("어긴 문장만 숫자 없는 안전 문장으로 바꾼다", () => {
    const safe = "숫자 없이 다시 볼게요.";
    const g = guardSentences("근거는 좋았어요. 수익률은 55%였어요. 다음에는 위험도 골라 보세요.", allowed, safe);
    expect(g.replaced).toBe(1);
    expect(g.text).toBe(`근거는 좋았어요. ${safe} 다음에는 위험도 골라 보세요.`);
    expect(g.text).not.toMatch(/55/);
  });

  it("연달아 어긴 문장은 안전 문장 하나로", () => {
    const g = guardSentences("55%였어요. 66%였어요.", [], "안전.");
    expect(g).toEqual({ text: "안전.", replaced: 2 });
  });
});

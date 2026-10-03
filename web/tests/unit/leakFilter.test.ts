import { describe, expect, it } from "vitest";
import { findDates, findLeaks, type LeakDictionary } from "@/lib/server/ai/leakFilter";

const dict: LeakDictionary = {
  companies: ["어도비", "CANARY-회사", "Coca-Cola"],
  tickers: ["ADBE", "KO", "CNRY", "MU"],
  terms: ["포토샵", "Photoshop"],
  outcomeNumbers: [4.8, 7.1, 2.3, 42.42],
  publicNumbers: [23, 38, 27, 5.25, 9.1, 42],
  cutoff: "2023-09-15",
};
const kinds = (t: string) => findLeaks(t, dict).map((h) => h.kind);

describe("leakFilter: 낱말 사전", () => {
  it("회사명·제품명(공백·대소문자 무시)", () => {
    expect(kinds("어도비는 성장주였어요.")).toContain("company");
    expect(kinds("어 도 비의 숫자")).toContain("company");
    expect(kinds("coca-cola 같은 회사")).toContain("company");
    expect(kinds("포토샵 매출이")).toContain("term");
    expect(kinds("PHOTOSHOP")).toContain("term");
    expect(kinds("CANARY-회사의 결과")).toContain("company");
  });

  it("티커는 대소문자 구분·영숫자 경계(KOSPI·ko는 아님)", () => {
    expect(kinds("ADBE를 보면")).toContain("ticker");
    expect(kinds("(CNRY)")).toContain("ticker");
    expect(kinds("KOSPI 지수와 비교")).not.toContain("ticker");
    expect(kinds("ko 라는 글자")).not.toContain("ticker");
    expect(kinds("MUST 같은 단어")).not.toContain("ticker");
  });
});

describe("leakFilter: 기준일 이후 날짜", () => {
  it("기준일 이후의 절대 날짜는 누수", () => {
    expect(kinds("2023-10-01에 발표")).toContain("date_after_cutoff");
    expect(kinds("2024년 1분기 실적")).toContain("date_after_cutoff");
    expect(kinds("Q1 2024에는")).toContain("date_after_cutoff");
    expect(kinds("2023년 9월 16일")).toContain("date_after_cutoff");
    expect(kinds("2024에는 달라졌어요")).toContain("date_after_cutoff");
    expect(kinds("2099-01-02")).toContain("date_after_cutoff");
  });

  it("기준일 이전·같은 해 연도만은 누수가 아니다", () => {
    expect(kinds("2023년 상황")).not.toContain("date_after_cutoff");
    expect(kinds("2023.08 자료")).not.toContain("date_after_cutoff");
    expect(kinds("2023년 9월 15일")).not.toContain("date_after_cutoff");
    expect(kinds("2022년 4분기")).not.toContain("date_after_cutoff");
  });

  it("판단일 이후를 가리키는 상대 표현", () => {
    expect(kinds("D+30에 주가가")).toContain("relative_future");
    expect(kinds("판단일 이후 실적이")).toContain("relative_future");
    expect(kinds("판단일 D-12에 공시")).toEqual([]);
  });

  it("날짜 표현 찾기", () => {
    expect(findDates("2024년 3월")).toContainEqual({ y: 2024, m: 3, d: null });
    expect(findDates("2023 Q3")).toContainEqual({ y: 2023, m: 7, d: null });
  });
});

describe("leakFilter: 결과 수치", () => {
  it("공개 자료에 없는 결과 수치는 누수", () => {
    expect(kinds("4.8% 올랐어요")).toContain("outcome_number");
    expect(kinds("42.42")).toContain("outcome_number");
    expect(kinds("7.1%")).toContain("outcome_number");
  });

  it("공개 자료의 숫자는 결과 수치와 가까워도 누수가 아니다", () => {
    expect(kinds("PER 38 vs 27, 금리 5.25%")).toEqual([]);
    expect(kinds("PBR 9.1")).toEqual([]);
    expect(kinds("42")).toEqual([]); // 공개 자료에 42가 있다
  });

  it("깨끗한 질문은 통과", () => {
    expect(findLeaks("'매출 +23%'를 가장 중요하게 보셨군요. 카드에서 이 근거와 반대로 읽히는 정보를 하나 찾는다면 무엇일까요?", dict)).toEqual([]);
    expect(findLeaks("확신도 5를 고르셨어요. 그만큼 확신하게 만든 정보가 'PER 38 vs 27' 하나뿐인가요?", dict)).toEqual([]);
  });
});

import path from "node:path";
import { describe, expect, it } from "vitest";
import { ContentError, conceptOrders, findPublicLeaks, loadContent, splitCard, validateContent, type CardFileT } from "@/server/content/cards";

const fixtures = path.resolve(__dirname, "../fixtures");

describe("시드: 카드를 세 등급으로 나눈다", () => {
  const content = loadContent(path.join(fixtures, "content"));
  const canary = loadContent(path.join(fixtures, "canary"));

  it("예시 자료를 읽는다(개념 4·카드 3, 예시 표기)", () => {
    expect(content.concepts).toHaveLength(4);
    expect(content.cards).toHaveLength(3);
    for (const { card } of content.cards) {
      expect(card.internal.example).toBe(true);
      expect(card.internal.notes.startsWith("예시 자료(실측 아님)")).toBe(true);
      expect(card.public.panels.flow.index14).toHaveLength(14);
      expect(card.reveal.outcome.pricePath).toHaveLength(14);
    }
    expect(validateContent({ ...content, cards: [...content.cards, ...canary.cards] })).toEqual([]);
  });

  it("판단 전(public) 등급에는 결과·서버 전용 값이 없다", () => {
    for (const { card } of [...content.cards, ...canary.cards]) {
      const s = splitCard(card);
      const pub = JSON.stringify(s.public);
      const o = card.reveal.outcome;
      for (const v of [o.companyName, o.ticker, o.startDate, o.endDate, o.period, card.internal.dataCutoff, card.internal.notes, ...card.internal.leakTerms, ...card.reveal.keyPoints]) {
        expect(pub.includes(v), `public에 '${v}'`).toBe(false);
      }
      for (const lp of card.reveal.learningPoints) expect(pub.includes(lp.linkSentence)).toBe(false);
      expect(s.public.blocks.map((b) => b.kind)).toEqual(["flow", "numbers", "then"]);
    }
  });

  it("카나리 카드: public에 카나리 값이 없다", () => {
    const s = splitCard(canary.cards[0].card);
    const pub = JSON.stringify(s.public);
    for (const v of ["CANARY-회사", "CNRY", "2099-01-02", "42.42"]) expect(pub).not.toContain(v);
  });

  it("판단 전 구획에 회사명·티커·절대 날짜가 섞이면 멈춘다", () => {
    const base = content.cards[0].card;
    const withName: CardFileT = structuredClone(base);
    withName.public.panels.then.notes[0].text = "어도비가 전망을 올렸어요.";
    expect(() => splitCard(withName)).toThrow(ContentError);

    const withTicker: CardFileT = structuredClone(base);
    withTicker.public.evidenceOptions[0].label = "ADBE 매출";
    expect(findPublicLeaks(withTicker).errors.length).toBeGreaterThan(0);

    const withDate: CardFileT = structuredClone(base);
    withDate.public.panels.numbers.asOfRelative = "판단일 D-21(2023-08-25 공시)";
    expect(findPublicLeaks(withDate).errors.length).toBeGreaterThan(0);

    const withSpacedName: CardFileT = structuredClone(base);
    withSpacedName.public.panels.then.notes[1].text = "포 토 샵 판매가 늘었어요.";
    expect(findPublicLeaks(withSpacedName).errors.length).toBeGreaterThan(0);
  });

  it("public에 모르는 키가 있으면 계약(.strict()) 단계에서 멈춘다", () => {
    const bad = structuredClone(content.cards[0].card) as unknown as { public: { panels: { flow: Record<string, unknown> } } };
    bad.public.panels.flow.endIndex = 104.8;
    expect(() => splitCard(bad as unknown as CardFileT)).toThrow();
  });

  it("내용 점검: live 덱 순서 중복·없는 개념·rank 1 누락", () => {
    const a = content.cards[0];
    const dup = { ...content, cards: [a, { file: "dup.json", card: { ...structuredClone(a.card), id: "11111111-1111-4111-8111-111111111111" } }] };
    expect(validateContent(dup).some((e) => e.includes("덱 순서"))).toBe(true);
    const missing = structuredClone(a.card);
    missing.reveal.learningPoints = [{ conceptId: "no-such-concept", rank: 1, linkSentence: "x" }];
    expect(validateContent({ ...content, cards: [{ file: "m.json", card: missing }] }).some((e) => e.includes("no-such-concept"))).toBe(true);
    const norank = structuredClone(a.card);
    norank.reveal.learningPoints = [{ conceptId: "base-rate", rank: 2, linkSentence: "x" }];
    expect(validateContent({ ...content, cards: [{ file: "r.json", card: norank }] }).some((e) => e.includes("rank 1"))).toBe(true);
  });

  it("내용 점검: 개념 id가 겹치면 멈춘다(갈래 안 순서가 하나로 정해지게)", () => {
    const twice = { ...content, concepts: [...content.concepts, { ...structuredClone(content.concepts[0]), quizzes: [{ ...content.concepts[0].quizzes[0], quizId: "abs-vs-relative-q9" }] }] };
    expect(validateContent(twice).some((e) => e.includes("개념 id가 겹쳐요: abs-vs-relative"))).toBe(true);
  });
});

describe("시드: 개념의 갈래 안 순서 (conceptOrders = 계약 ConceptListItem.order)", () => {
  it("개념 파일의 나열 순서를 갈래마다 1부터 센다", () => {
    const content = loadContent(path.join(fixtures, "content"));
    // 예시 개념 파일: abs-vs-relative(결과) · growth-vs-valuation(숫자) · debt-and-cycle(숫자) · base-rate(결과)
    expect(Object.fromEntries(conceptOrders(content.concepts))).toEqual({ "abs-vs-relative": 1, "growth-vs-valuation": 1, "debt-and-cycle": 2, "base-rate": 2 });
  });

  it("순서를 바꾸면 순서가 따라 바뀌고, 겹치는 id는 처음 것만 센다", () => {
    const list = [
      { id: "b1", branch: "self" },
      { id: "a1", branch: "outcome" },
      { id: "b2", branch: "self" },
      { id: "b1", branch: "self" },
      { id: "a2", branch: "outcome" },
    ];
    expect(Object.fromEntries(conceptOrders(list))).toEqual({ b1: 1, a1: 1, b2: 2, a2: 2 });
    expect(Object.fromEntries(conceptOrders([list[2], list[0]]))).toEqual({ b2: 1, b1: 2 });
    expect(conceptOrders([]).size).toBe(0);
  });
});

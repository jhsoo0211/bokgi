/**
 * 목 데이터 — prototype/app/js/data.js를 계약(src/shared/contract.ts) 모양으로 옮겼다. 수치는 예시 자료(실측 아님).
 * 이 파일은 ./mock 에서만 읽는다(목 모드·개발 서버 전용, 운영 번들에 들어가지 않는다).
 * 판단 전 자료(MOCK_CASES)와 공개 뒤 자료(MOCK_REVEAL)를 나눠 두고, 목 서버도 공개 요청에서만 MOCK_REVEAL을 읽는다.
 * 「그때」 문장에는 회사 이름·티커·제품 이름·절대 날짜를 쓰지 않는다(상대 날짜만). 근거 칩 설명(why)도 결과를 암시하지 않는다.
 */
import type { ConceptBranch, Outcome, PublicCase } from "./types";

export type MockConcept = {
  id: string; branch: ConceptBranch; title: string; body: string;
  quiz: { quizId: string; question: string; options: string[]; answer: number };
};

export const MOCK_CONCEPTS: MockConcept[] = [
  {
    id: "abs-vs-relative", branch: "outcome", title: "절대수익과 시장 대비",
    body: "주가는 올랐지만 시장이 더 올랐습니다. 절대수익만 보면 성공, 시장 대비로 보면 뒤처진 판단입니다. 오른 이유의 대부분이 시장 전체의 상승이었는지 먼저 확인해야 합니다.",
    quiz: { quizId: "q-abs-vs-relative-1", question: "기업 +10%, 시장 +15%면 이 판단은?", options: ["성공 — 주가가 올랐으니까", "하회 — 시장을 못 따라갔으니까"], answer: 1 },
  },
  {
    id: "growth-vs-valuation", branch: "numbers", title: "높은 성장률과 높은 밸류에이션",
    body: "성장률이 높아도 그 성장이 이미 가격에 반영돼 있으면 시장 대비 초과수익은 남지 않습니다. 업종 중앙값 대비 PER 프리미엄이 얼마나 큰지가 핵심입니다.",
    quiz: { quizId: "q-growth-vs-valuation-1", question: "매출 +23%인데 PER이 업종의 1.4배라면?", options: ["성장이 확인됐으니 유리하다", "성장이 이미 가격에 반영됐을 수 있다"], answer: 1 },
  },
  {
    id: "debt-and-cycle", branch: "numbers", title: "높은 부채와 경기 민감도",
    body: "부채비율이 높은 기업은 금리가 오르거나 매출이 줄 때 이익이 더 크게 흔들립니다. 성장 둔화와 높은 부채가 겹치면 하방 위험이 커집니다.",
    quiz: { quizId: "q-debt-and-cycle-1", question: "부채비율 88%, 매출 −8%, 금리 상승기. 가장 큰 위험은?", options: ["이자 부담으로 이익이 빠르게 줄 수 있다", "PER이 낮아서 안전하다"], answer: 0 },
  },
  {
    id: "base-rate", branch: "outcome", title: "기저확률과 노이즈",
    body: "6개월 주가 방향은 절반 가까이가 시장 흐름과 우연으로 설명됩니다. 한두 번의 적중은 실력이 아닐 수 있습니다. 근거가 같은 판단을 여러 번 반복했을 때의 평균이 실력입니다.",
    quiz: { quizId: "q-base-rate-1", question: "3연속 적중 후 가장 정확한 해석은?", options: ["판단력이 검증됐다", "표본이 작아 아직 알 수 없다"], answer: 1 },
  },
];

export const MOCK_USER_ID = "2f6b1d0e-6a1c-4d7e-9b2a-0c1d2e3f4a5b";
const ID = (n: number) => `9a0e2b51-3c4d-4e5f-8a6b-7c8d9e0f1a0${n}`;

/* 근거 칩 설명(why)은 C의 예시 카드(content/cards c001~c003)와 같은 문장 */
const WHY = {
  c1: {
    rev: "매출이 얼마나 빨리 느는지는 성장 기대의 출발점이에요.",
    per: "업종 중앙값과의 차이는 성장 기대가 가격에 얼마나 들어 있는지 보여 줘요.",
    cash: "빚보다 현금이 많으면 금리가 올라도 이자 부담이 작아요.",
    rate: "금리가 높으면 먼 미래 이익의 현재 가치가 줄어 성장주 가격에 부담이 돼요.",
    guide: "회사가 전망을 올리면 시장의 기대치도 함께 움직여요.",
  },
  c2: {
    rev: "매출이 줄기 시작하면 고정비 때문에 이익은 더 크게 줄 수 있어요.",
    per: "업종보다 낮은 PER은 싸다는 뜻일 수도, 이익이 줄 거라는 걱정일 수도 있어요.",
    debt: "빚이 많으면 매출이 흔들릴 때 이익이 더 크게 흔들려요.",
    fcf: "벌어들인 현금보다 쓰는 돈이 많으면 외부 자금에 기대야 해요.",
    guide: "회사가 전망을 낮추면 시장의 기대치도 함께 내려가요.",
  },
  c3: {
    rev: "매출 성장 속도는 이 회사에 기대할 수 있는 이익 증가의 출발점이에요.",
    per: "업종 중앙값과의 차이는 안정성에 붙은 값이 얼마인지 보여 줘요.",
    opm: "이익률이 유지되면 원가가 올라도 값을 올릴 힘이 있다는 신호일 수 있어요.",
    cash: "현금이 넉넉하면 불안한 시기에도 배당과 투자를 이어 가기 쉬워요.",
  },
};

/** 판단 전 자료 (toPublicCase 결과와 같은 모양) */
export const MOCK_CASES: PublicCase[] = [
  {
    id: ID(1), version: 1, yearPublic: 2023, sectorPublic: "소프트웨어", sizeBucket: "대형", horizonDays: 180, difficulty: 2,
    panels: {
      flow: { index14: [100, 97, 101, 104, 99, 103, 106, 102, 108, 111, 109, 113, 110, 115], market14: [100, 101, 102, 101, 103, 104, 105, 104, 106, 107, 107, 109, 110, 111], volumeTrend: "유지", windowDays: 180 },
      numbers: {
        growth: { revYoy: "+23%", opm: "31% → 34%", epsYoy: "+28%", guidance: "상향" },
        valuation: { per: "38", perSector: "27", pbr: "9.1", psr: null },
        health: { debtRatio: "42%", netCash: "보유", fcf: "양수" },
        asOfRelative: "판단일 D-12(공시 기준)",
      },
      then: {
        rate: "5.25%", rateTrend: "상승기", fxNote: null, commodityNote: null,
        notes: [
          { when: "판단일 D-48", text: "기준금리가 0.25%p 올라 5.25%가 됐어요.", sourceKind: "통계" },
          { when: "판단일 D-30", text: "생성형 AI 기대로 대형 소프트웨어주가 크게 올라, 업종 밸류에이션이 과거 평균보다 높다는 분석이 많았어요.", sourceKind: "보도" },
          { when: "판단일 D-12", text: "이 회사는 직전 분기 실적 발표에서 매출 전망을 올렸어요.", sourceKind: "공시" },
        ],
      },
    },
    evidenceOptions: [
      { id: "ev1", label: "매출 +23%", why: WHY.c1.rev, panel: "numbers" },
      { id: "ev2", label: "PER 38 vs 27", why: WHY.c1.per, panel: "numbers" },
      { id: "ev3", label: "순현금 보유", why: WHY.c1.cash, panel: "numbers" },
      { id: "ev4", label: "금리 5.25%", why: WHY.c1.rate, panel: "then" },
      { id: "ev5", label: "가이던스 상향", why: WHY.c1.guide, panel: "numbers" },
    ],
    riskOptions: [{ id: "rk1", label: "밸류에이션 프리미엄" }, { id: "rk2", label: "금리 상승" }, { id: "rk3", label: "성장 둔화" }],
  },
  {
    id: ID(2), version: 1, yearPublic: 2022, sectorPublic: "반도체", sizeBucket: "중형", horizonDays: 180, difficulty: 2,
    panels: {
      flow: { index14: [100, 96, 93, 95, 90, 88, 91, 86, 84, 87, 82, 80, 83, 79], market14: [100, 100, 99, 101, 100, 102, 101, 103, 102, 104, 103, 105, 104, 106], volumeTrend: "증가", windowDays: 180 },
      numbers: {
        growth: { revYoy: "−8%", opm: "12% → 9%", epsYoy: "−21%", guidance: "하향" },
        valuation: { per: "15", perSector: "22", pbr: "1.6", psr: "1.2" },
        health: { debtRatio: "88%", netCash: "순부채", fcf: "음수" },
        asOfRelative: "판단일 D-9(공시 기준)",
      },
      then: {
        rate: "5.25%", rateTrend: "상승기", fxNote: null, commodityNote: null,
        notes: [
          { when: "판단일 D-50", text: "기준금리 인상 속도가 빨라지면서 금리에 민감한 기술주가 시장보다 약했어요.", sourceKind: "통계" },
          { when: "판단일 D-27", text: "PC·스마트폰 수요가 줄어 반도체 재고가 쌓이고 있다는 업계 보도가 이어졌어요.", sourceKind: "보도" },
          { when: "판단일 D-9", text: "이 회사는 직전 분기 실적 발표에서 다음 분기 매출 전망을 낮추고 설비 투자를 줄이겠다고 밝혔어요.", sourceKind: "공시" },
        ],
      },
    },
    evidenceOptions: [
      { id: "ev1", label: "매출 −8%", why: WHY.c2.rev, panel: "numbers" },
      { id: "ev2", label: "PER 15 vs 22", why: WHY.c2.per, panel: "numbers" },
      { id: "ev3", label: "부채비율 88%", why: WHY.c2.debt, panel: "numbers" },
      { id: "ev4", label: "FCF 음수", why: WHY.c2.fcf, panel: "numbers" },
      { id: "ev5", label: "가이던스 하향", why: WHY.c2.guide, panel: "numbers" },
    ],
    riskOptions: [{ id: "rk1", label: "이자 부담" }, { id: "rk2", label: "재고 조정 장기화" }, { id: "rk3", label: "저평가 함정" }],
  },
  {
    id: ID(3), version: 1, yearPublic: 2023, sectorPublic: "소비재", sizeBucket: "대형", horizonDays: 365, difficulty: 1,
    panels: {
      flow: { index14: [100, 101, 103, 102, 105, 107, 106, 109, 112, 110, 114, 116, 118, 121], market14: [100, 102, 103, 105, 106, 108, 107, 110, 112, 113, 115, 116, 118, 119], volumeTrend: "유지", windowDays: 180 },
      numbers: {
        growth: { revYoy: "+6%", opm: "18% → 18%", epsYoy: "+7%", guidance: "유지" },
        valuation: { per: "24", perSector: "21", pbr: "5.2", psr: "3.1" },
        health: { debtRatio: "35%", netCash: "보유", fcf: "양수" },
        asOfRelative: "판단일 D-6(공시 기준)",
      },
      then: {
        rate: "4.50%", rateTrend: "동결", fxNote: null, commodityNote: null,
        notes: [
          { when: "판단일 D-41", text: "기준금리가 4.50%에서 동결됐고, 물가 상승률은 몇 달째 낮아지고 있었어요.", sourceKind: "통계" },
          { when: "판단일 D-22", text: "경기 둔화 우려 속에 필수소비재가 방어 업종으로 자주 언급됐어요.", sourceKind: "보도" },
          { when: "판단일 D-6", text: "이 회사는 직전 분기 실적 발표에서 연간 전망을 바꾸지 않았어요.", sourceKind: "공시" },
        ],
      },
    },
    evidenceOptions: [
      { id: "ev1", label: "매출 +6%", why: WHY.c3.rev, panel: "numbers" },
      { id: "ev2", label: "PER 24 vs 21", why: WHY.c3.per, panel: "numbers" },
      { id: "ev3", label: "영업이익률 유지", why: WHY.c3.opm, panel: "numbers" },
      { id: "ev4", label: "순현금 보유", why: WHY.c3.cash, panel: "numbers" },
    ],
    riskOptions: [{ id: "rk1", label: "성장 정체" }, { id: "rk2", label: "밸류에이션 프리미엄" }, { id: "rk3", label: "소비 둔화" }],
  },
];

export type MockReveal = { outcome: Outcome; keyPoints: string[]; learning: { conceptId: string; linkSentence: string | null }[] };

/* 출처·사후에 중요했던 것·연결 문장은 C의 예시 카드와 같다(kind "예시" = 설명용 값, "가격" = 배당·분할 반영 메모) */

/** 공개 뒤 자료 — 목 서버의 reveal/일지(공개된 행)만 읽는다 */
export const MOCK_REVEAL: Record<string, MockReveal> = {
  [ID(1)]: {
    outcome: {
      companyName: "어도비", ticker: "ADBE", period: "2023 Q3 → 2024 Q1", startDate: "2023-09-15", endDate: "2024-03-15",
      returnPct: 4.8, benchReturnPct: 7.1, benchName: "S&P 500",
      pricePath: [100, 99, 103, 101, 104, 102, 106, 104, 103, 105, 107, 104, 106, 104.8],
      benchPath: [100, 101, 102, 103, 103, 104, 105, 105, 106, 106, 107, 107, 107, 107.1],
      sources: [{"kind": "예시", "label": "예시 자료(실측 아님) — 수치·날짜·문장은 설명용으로 만든 값이에요", "url": null}, {"kind": "가격", "label": "파생 지수 14점(판단일 = 100) · 총수익 기준(배당 재투자·분할 반영, 이 기간 배당·분할 없음) · 예시 값", "url": null}, {"kind": "공시", "label": "직전 분기 실적 발표 자료(예시 — 원문 위치는 실제 카드에서 기재)", "url": null}, {"kind": "통계", "label": "미국 기준금리 결정·장기 국채 금리(예시)", "url": null}, {"kind": "보도", "label": "당시 업종 분석 보도(예시)", "url": null}],
    },
    keyPoints: ["PER이 업종 중앙값의 1.4배라, 좋은 실적과 전망 상향이 이미 가격에 들어 있었어요.", "같은 기간 시장 전체가 오르면서, 주가 상승의 대부분은 시장 흐름으로 설명됐어요.", "전망 상향은 판단일 전에 알려진 정보라 이후 결과를 크게 바꾸지 못했어요."],
    learning: [{ conceptId: "abs-vs-relative", linkSentence: "이 회사는 4.8% 올랐지만 시장이 7.1% 올라, 시장 대비로는 2.3%p 뒤졌어요." }, { conceptId: "growth-vs-valuation", linkSentence: "매출이 23% 늘었지만 PER이 업종 중앙값의 1.4배라 성장 기대가 이미 가격에 들어 있었어요." }],
  },
  [ID(2)]: {
    outcome: {
      companyName: "마이크론", ticker: "MU", period: "2022 Q3 → 2023 Q1", startDate: "2022-09-15", endDate: "2023-03-15",
      returnPct: -12.4, benchReturnPct: 3.2, benchName: "S&P 500",
      pricePath: [100, 95, 92, 90, 88, 85, 87, 84, 86, 83, 85, 88, 86, 87.6],
      benchPath: [100, 99, 98, 100, 101, 100, 102, 101, 103, 102, 103, 104, 103, 103.2],
      sources: [{"kind": "예시", "label": "예시 자료(실측 아님) — 수치·날짜·문장은 설명용으로 만든 값이에요", "url": null}, {"kind": "가격", "label": "파생 지수 14점(판단일 = 100) · 총수익 기준(배당 재투자·분할 반영, 이 기간 분기 배당 포함, 분할 없음) · 예시 값", "url": null}, {"kind": "공시", "label": "직전 분기 실적 발표와 매출 전망 수정 공시(예시)", "url": null}, {"kind": "통계", "label": "미국 기준금리 결정(예시)", "url": null}, {"kind": "보도", "label": "반도체 재고 관련 업계 보도(예시)", "url": null}],
    },
    keyPoints: ["업종보다 낮은 PER은 이익이 더 줄어들 위험을 반영한 값이었어요.", "재고가 쌓이는 하강 국면에서는 낮은 밸류에이션이 바닥 신호가 되지 못했어요.", "높은 부채와 줄어드는 매출이 겹쳐 이익 전망이 계속 낮아졌어요."],
    learning: [{ conceptId: "debt-and-cycle", linkSentence: "부채비율 88%에 매출이 줄고 금리가 오르던 때라, 이익과 주가가 시장보다 크게 흔들렸어요." }, { conceptId: "base-rate", linkSentence: "이번 한 번의 결과로 '낮은 PER은 함정'이라고 일반화하기는 이르고, 같은 근거의 판단을 여러 번 모아 봐야 해요." }],
  },
  [ID(3)]: {
    outcome: {
      companyName: "코카콜라", ticker: "KO", period: "2023 Q1 → 2024 Q1", startDate: "2023-03-15", endDate: "2024-03-15",
      returnPct: 2.1, benchReturnPct: 26.5, benchName: "S&P 500",
      pricePath: [100, 101, 100, 102, 99, 98, 97, 99, 98, 100, 99, 101, 102, 102.1],
      benchPath: [100, 103, 105, 108, 110, 112, 111, 114, 117, 119, 121, 124, 125, 126.5],
      sources: [{"kind": "예시", "label": "예시 자료(실측 아님) — 수치·날짜·문장은 설명용으로 만든 값이에요", "url": null}, {"kind": "가격", "label": "파생 지수 14점(판단일 = 100) · 총수익 기준(배당 재투자·분할 반영, 이 기간 분기 배당 4회 포함, 분할 없음) · 예시 값", "url": null}, {"kind": "공시", "label": "직전 분기 실적 발표 자료(예시)", "url": null}, {"kind": "통계", "label": "미국 기준금리 결정·소비자물가 발표(예시)", "url": null}, {"kind": "보도", "label": "당시 금융 불안·업종 관련 보도(예시)", "url": null}],
    },
    keyPoints: ["1년 동안 시장이 크게 오른 구간이라 안정적인 방어주는 상대적으로 뒤처졌어요.", "업종보다 높은 PER에 비해 성장은 한 자릿수에 머물렀어요.", "주가는 거의 제자리였고, 배당을 더해도 시장 상승을 따라가지 못했어요."],
    learning: [{ conceptId: "base-rate", linkSentence: "시장이 26.5% 오른 1년이라, 이 카드의 결과는 회사보다 시장 흐름이 크게 좌우했어요." }, { conceptId: "abs-vs-relative", linkSentence: "주가는 2.1% 올라 절대수익은 플러스였지만, 시장 대비로는 24.4%p 뒤졌어요." }],
  },
};

/** 시험용 넷째 카드(localStorage 'bokgi.mock.deck4' = '1'일 때만): 첫 카드 판단 전 자료 + 비슷함(+0.4%p) 결과.
 *  프로토타입 스모크 C(한 장 더·비슷함 공개)와 같은 주입이다 */
export const MOCK_TEST_CASE: PublicCase = { ...MOCK_CASES[0], id: ID(4) };
export const MOCK_TEST_REVEAL: MockReveal = {
  ...MOCK_REVEAL[ID(1)],
  outcome: { ...MOCK_REVEAL[ID(1)].outcome, companyName: "테스트사", ticker: "TST", returnPct: 7.5 },
};

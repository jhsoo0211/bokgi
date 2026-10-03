/* 목데이터. 실제 구현에서는 서버 API로 대체한다.
   원칙: CASES(판단 전)와 OUTCOMES(판단 후)는 분리. 클라이언트는 reveal 시점에만 OUTCOMES를 받는다.
   여기서는 프로토타입이라 한 파일에 두지만, 화면 코드는 reveal() 이후에만 OUTCOMES를 읽는다.
   수치는 예시 데이터. 실제 카드는 docs/02_구현계획 §6 파이프라인으로 만든다.
   context(「그때」 판)는 판단 전에 보이므로 회사 이름·티커·제품 이름·절대 날짜를 쓰지 않는다.
   날짜는 판단일 기준 상대 표기(판단일 D-12)만, 판단일 이후 일은 넣지 않는다. source: "공시" | "보도" | "통계". */

window.IFSAVE = window.IFSAVE || {};

IFSAVE.CONCEPTS = {
  "abs-vs-relative": {
    title: "절대수익과 시장 대비",
    body: "주가는 올랐지만 시장이 더 올랐습니다. 절대수익만 보면 성공, 시장 대비로 보면 뒤처진 판단입니다. 오른 이유의 대부분이 시장 전체의 상승이었는지 먼저 확인해야 합니다.",
    quiz: { q: "기업 +10%, 시장 +15%면 이 판단은?", options: ["성공 — 주가가 올랐으니까", "하회 — 시장을 못 따라갔으니까"], answer: 1 }
  },
  "growth-vs-valuation": {
    title: "높은 성장률과 높은 밸류에이션",
    body: "성장률이 높아도 그 성장이 이미 가격에 반영돼 있으면 시장 대비 초과수익은 남지 않습니다. 업종 중앙값 대비 PER 프리미엄이 얼마나 큰지가 핵심입니다.",
    quiz: { q: "매출 +23%인데 PER이 업종의 1.4배라면?", options: ["성장이 확인됐으니 유리하다", "성장이 이미 가격에 반영됐을 수 있다"], answer: 1 }
  },
  "debt-and-cycle": {
    title: "높은 부채와 경기 민감도",
    body: "부채비율이 높은 기업은 금리가 오르거나 매출이 줄 때 이익이 더 크게 흔들립니다. 성장 둔화와 높은 부채가 겹치면 하방 위험이 커집니다.",
    quiz: { q: "부채비율 88%, 매출 −8%, 금리 상승기. 가장 큰 위험은?", options: ["이자 부담으로 이익이 빠르게 줄 수 있다", "PER이 낮아서 안전하다"], answer: 0 }
  },
  "base-rate": {
    title: "기저확률과 노이즈",
    body: "6개월 주가 방향은 절반 가까이가 시장 흐름과 우연으로 설명됩니다. 한두 번의 적중은 실력이 아닐 수 있습니다. 근거가 같은 판단을 여러 번 반복했을 때의 평균이 실력입니다.",
    quiz: { q: "3연속 적중 후 가장 정확한 해석은?", options: ["판단력이 검증됐다", "표본이 작아 아직 알 수 없다"], answer: 1 }
  }
};

IFSAVE.CASES = [
  {
    id: "c001", version: 1, year_public: 2023, sector_public: "소프트웨어", size_bucket: "대형", horizon_days: 180, difficulty: 2,
    chart: { prices_norm: [100,97,101,104,99,103,106,102,108,111,109,113,110,115], market_norm: [100,101,102,101,103,104,105,104,106,107,107,109,110,111] },
    fundamental: {
      growth: { rev_yoy: "+23%", opm: "31% → 34%", eps_yoy: "+28%", guidance: "상향" },
      valuation: { per: "38", per_sector: "27", pbr: "9.1", psr: null },
      health: { debt_ratio: "42%", net_cash: "보유", fcf: "양수" },
      context: { rate: "5.25%", rate_trend: "상승기", events: 1 }
    },
    context: {
      rate: "5.25%", rate_trend: "상승기",
      notes: [
        { when: "판단일 D-48", text: "기준금리가 0.25%p 올라 5.25%가 됐어요.", source: "통계" },
        { when: "판단일 D-30", text: "생성형 AI 기대로 대형 소프트웨어주가 크게 올라, 업종 밸류에이션이 과거 평균보다 높다는 분석이 많았어요.", source: "보도" },
        { when: "판단일 D-12", text: "이 회사는 직전 분기 실적 발표에서 매출 전망을 올렸어요.", source: "공시" }
      ]
    },
    evidence_options: ["매출 +23%", "PER 38 vs 27", "순현금 보유", "금리 5.25%", "가이던스 상향"],
    risk_options: ["밸류에이션 프리미엄", "금리 상승", "성장 둔화"],
    learning_points: ["abs-vs-relative", "growth-vs-valuation"]
  },
  {
    id: "c002", version: 1, year_public: 2022, sector_public: "반도체", size_bucket: "중형", horizon_days: 180, difficulty: 2,
    chart: { prices_norm: [100,96,93,95,90,88,91,86,84,87,82,80,83,79], market_norm: [100,100,99,101,100,102,101,103,102,104,103,105,104,106] },
    fundamental: {
      growth: { rev_yoy: "−8%", opm: "12% → 9%", eps_yoy: "−21%", guidance: "하향" },
      valuation: { per: "15", per_sector: "22", pbr: "1.6", psr: "1.2" },
      health: { debt_ratio: "88%", net_cash: "순부채", fcf: "음수" },
      context: { rate: "5.25%", rate_trend: "상승기", events: 2 }
    },
    context: {
      rate: "5.25%", rate_trend: "상승기",
      notes: [
        { when: "판단일 D-50", text: "기준금리 인상 속도가 빨라지면서 금리에 민감한 기술주가 시장보다 약했어요.", source: "통계" },
        { when: "판단일 D-27", text: "PC·스마트폰 수요가 줄어 반도체 재고가 쌓이고 있다는 업계 보도가 이어졌어요.", source: "보도" },
        { when: "판단일 D-9", text: "이 회사는 직전 분기 실적 발표에서 다음 분기 매출 전망을 낮추고 설비 투자를 줄이겠다고 밝혔어요.", source: "공시" }
      ]
    },
    evidence_options: ["매출 −8%", "PER 15 vs 22", "부채비율 88%", "FCF 음수", "가이던스 하향"],
    risk_options: ["이자 부담", "재고 조정 장기화", "저평가 함정"],
    learning_points: ["debt-and-cycle", "base-rate"]
  },
  {
    id: "c003", version: 1, year_public: 2023, sector_public: "소비재", size_bucket: "대형", horizon_days: 365, difficulty: 1,
    chart: { prices_norm: [100,101,103,102,105,107,106,109,112,110,114,116,118,121], market_norm: [100,102,103,105,106,108,107,110,112,113,115,116,118,119] },
    fundamental: {
      growth: { rev_yoy: "+6%", opm: "18% → 18%", eps_yoy: "+7%", guidance: "유지" },
      valuation: { per: "24", per_sector: "21", pbr: "5.2", psr: "3.1" },
      health: { debt_ratio: "35%", net_cash: "보유", fcf: "양수" },
      context: { rate: "4.50%", rate_trend: "동결", events: 0 }
    },
    context: {
      rate: "4.50%", rate_trend: "동결",
      notes: [
        { when: "판단일 D-41", text: "기준금리가 4.50%에서 동결됐고, 물가 상승률은 몇 달째 낮아지고 있었어요.", source: "통계" },
        { when: "판단일 D-22", text: "경기 둔화 우려 속에 필수소비재가 방어 업종으로 자주 언급됐어요.", source: "보도" },
        { when: "판단일 D-6", text: "이 회사는 직전 분기 실적 발표에서 연간 전망을 바꾸지 않았어요.", source: "공시" }
      ]
    },
    evidence_options: ["매출 +6%", "PER 24 vs 21", "영업이익률 유지", "순현금 보유"],
    risk_options: ["성장 정체", "밸류에이션 프리미엄", "소비 둔화"],
    learning_points: ["base-rate", "abs-vs-relative"]
  }
];

/* 판단 후에만 읽는다 */
IFSAVE.OUTCOMES = {
  c001: { company: "어도비", ticker: "ADBE", period: "2023 Q3 → 2024 Q1", return_pct: 4.8, bench_return_pct: 7.1, bench: "S&P 500",
          price_path: [100,99,103,101,104,102,106,104,103,105,107,104,106,104.8], bench_path: [100,101,102,103,103,104,105,105,106,106,107,107,107,107.1] },
  c002: { company: "마이크론", ticker: "MU", period: "2022 Q3 → 2023 Q1", return_pct: -12.4, bench_return_pct: 3.2, bench: "S&P 500",
          price_path: [100,95,92,90,88,85,87,84,86,83,85,88,86,87.6], bench_path: [100,99,98,100,101,100,102,101,103,102,103,104,103,103.2] },
  c003: { company: "코카콜라", ticker: "KO", period: "2023 Q1 → 2024 Q1", return_pct: 2.1, bench_return_pct: 26.5, bench: "S&P 500",
          price_path: [100,101,100,102,99,98,97,99,98,100,99,101,102,102.1], bench_path: [100,103,105,108,110,112,111,114,117,119,121,124,125,126.5] }
};

/* 역추적 카드 (A등급 예시) — 2단계 역추적용, MVP 미사용 */
IFSAVE.RETRO = [
  {
    id: "r001", grade: "A", investor_masked: "기관 X", investor: "버크셔 해서웨이", decision_date: "2020년 2분기", sector: "항공",
    decision_text: "보유하던 항공사 4곳 지분을 전량 매도했습니다. 왜였을까요?",
    hypotheses: ["밸류에이션", "산업 전망 변화", "리밸런싱 규칙", "유동성·규모 제약", "규제·의무"],
    evidence: [
      { kind: "source", label: "📄 출처 · 2020년 주총 발언", text: "운용 책임자가 항공 산업에 대한 판단이 바뀌었다고 직접 말했습니다.", source_url: "https://www.berkshirehathaway.com/", source_date: "2020-05-02" },
      { kind: "inference", label: "🔍 추론", text: "매도 규모로 보면 세금·유동성보다 판단 자체를 되돌린 결정에 가깝습니다.", used_data: ["매도 비중 100%", "동시기 현금 비중"], counter: "일부만 매도했다면 이 해석은 약해진다." }
    ],
    ai_sealed: { hypothesis: "산업 전망 변화", rationale: "판단 시점 데이터에서 여객 수요 급감과 원칙(확신 없으면 보유하지 않음)이 겹친다." },
    outcome: { note: "이후 12개월 항공주는 시장 대비 하회했으나 일부는 반등했습니다.", return_pct: -9.8, bench_return_pct: 40.8 },
    concepts: ["원칙 일관성", "생존 편향"]
  }
];

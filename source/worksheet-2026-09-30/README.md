# IfSave — 학습지(Worksheet) 프로토타입

행동 기반 금융 학습 서비스 IfSave의 개편 프로토타입. 시각 방향은 **B · 학습지**로 확정.
빌드 없이 브라우저에서 바로 열린다.

## 실행

1. VS Code에서 이 폴더를 연다.
2. Live Server 확장으로 `app/index.html`을 연다(권장). `file://`로 직접 열어도 동작하지만 폰트 로딩이 브라우저에 따라 막힐 수 있다.
3. 모바일 뷰(380px)로 보면 의도한 레이아웃이다.

## 구조

```
ifsave-worksheet/
├─ README.md
├─ docs/
│  ├─ 01_개편기획_v0.2.md            서비스 기획 (렌즈·역추적·AI 역할·라벨)
│  ├─ 02_구현계획_v0.1.md            스키마·API·AI 오케스트레이터·13주 일정
│  └─ 03_디자인시스템_worksheet.md   원칙·토큰·컴포넌트·스와이프 규칙
├─ design/
│  ├─ tokens.json                    토큰 원본 (학습지 테마)
│  ├─ tokens.css                     CSS 변수 + @font-face + 타입 클래스
│  ├─ components.css                 공용 컴포넌트 (.ds-*)
│  └─ fonts/Pretendard-*.woff2       400·500·600·700
├─ app/
│  ├─ index.html                     셸 (뷰 + 하단 내비)
│  ├─ css/app.css                    화면 레이아웃
│  └─ js/
│     ├─ data.js                     목데이터. CASES(판단 전) / OUTCOMES(판단 후) 분리
│     ├─ state.js                    세션·판단 기록·연구 이벤트(localStorage) + AI 스텁
│     ├─ swipe.js                    SwipeStack (드래그·게이트·되돌리기·제스처 로그)
│     └─ app.js                      화면 흐름 (카드→판단→결과→개념, 역추적, 리포트)
└─ reference/
   └─ design-options-all.html        여섯 방향 시안 비교 (참고용)
```

## 화면 흐름

`렌즈 선택 → 카드 보기 → 근거 1개(필수) · 위험 · 확신도 → 스와이프(← 못했다 / 잘했다 →) → 되돌리기 2.5초 → 결과 공개(시장 대비) → 해설(문장 라벨) → 개념·퀴즈 → 다음 카드 → 리포트`

역추적: `기관 X 결정 → 가설 칩 → AI 반문 → 한 줄 답 → 증거(📄 출처 / 🔍 추론 + 동의/반대) → 봉인된 AI 가설 → 이후 결과 → 투자자 공개`

## 지켜야 할 규칙 (코드 리뷰 기준)

- 판단 전 화면에서 `IFSAVE.OUTCOMES`를 읽지 않는다. `showReveal()` 이후에만.
- 판단 전 화면에서 `--up` `--down`을 쓰지 않는다. 강조는 `--action` 하나.
- 스와이프는 근거 선택 전에 이탈하지 않는다(게이트). 버튼·키보드 대체 입력은 항상 존재.
- 스와이프 거리로 확신도를 추정하지 않는다. 제스처 메타(`dx, ms, v, flips`)는 연구 로그로만.
- AI 문장은 라벨(📄/🔍/❓)과 함께 문장 단위로 표시. 🔍에는 면책 한 줄.
- 적중률을 큰 숫자로 보여주지 않는다. 리포트는 카드 수 기준 미달 시 잠금.

## 다음 작업 (docs/02 §8 기준)

1. `data.js` → 서버 API(`/cases/next`, `/judgments`, `/judgments/{id}/reveal`)로 교체. OUTCOMES는 서버 전용 테이블로.
2. `AI` 스텁 → 서버 `/ai/question`, `/ai/explain` + Guard 체인(NumberGuard → QuoteGuard → LeakFilter).
3. 카드 파이프라인 스크립트(`fetch_prices.py`, `build_case.py`, `check_case.py`)로 12장 제작.
4. `State.events` → `research_events` 테이블. 조건(condition) 필드 추가.
5. 신고 시트, 복합 렌즈(Level 3), 소비 If 결합.

## 결정이 필요한 것

- 현재 스택(프론트 프레임워크, 백엔드, DB). 이 프로토타입은 프레임워크 독립이라 그대로 포팅 가능.
- 판단 기간 기본값(90/180/365일), 리포트 잠금 기준(30/50장), 카드 종목 풀 비율.

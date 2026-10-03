# 복기 프로토타입 UX 감사 (ecc 체크리스트, 2026-10-03)

_대상: `prototype/`(2차 변경판). 적용 스킬: frontend-a11y, make-interfaces-feel-better, click-path-audit, browser-qa, design-system + UI/UX Pro Max 검색 7회. 헤드리스 Chromium 380×760에서 모든 컨트롤의 상태 변화·키보드 이동·초점·히트 영역·대비·모션 감소를 측정했다. 제품 규칙(판단 전 결과 자료·결과색 금지, 게이트, 대체 입력, 적중률 숫자 금지, 형광펜 공개 뒤 전용, swipe.js 불변)은 그대로다._

## 결과 요약

- 40px 미만이던 컨트롤 **41개 → 0개**. 보이는 칸은 그대로 두고 가상 요소로 히트 영역만 넓혔다(겹침 0 확인).
- 스모크 테스트 144/144, 콘솔 오류 0. 규칙 grep: `OUTCOMES`·결과색·형광펜 모두 `showReveal` 안에만.
- 대비·모션 감소·긴 문자열 넘침·포커스 링은 고칠 것이 없었다(모두 AA, `none 0s`, 넘침 0, 2px 링).

## 고친 것

| 원칙(스킬) | 전 | 후 | 근거 |
|---|---|---|---|
| 히트 영역 44px(make-interfaces-feel-better, 02 §4) | 40px 미만 41개 | 0개 | 확신도 26.5→42.5, 근거 칩 84×36→90×42, 판 탭 34→44 높이, 아는 회사 줄 20.5→44.5, 되돌리기·바로 공개 34→44, 달력 ‹› 34.5→44.5, 개념 목록 18.5→44.5, 퀴즈 보기 38→42, 신고 라디오 39.8→43.8, 아래 탭 43.5→44 |
| 초점 가림(browser-qa, Pro Max Focus Not Obscured) | Tab으로 간 근거 칩 5곳이 아래 탭에 25~35px 가려짐 | 0곳 | `scroll-padding-bottom` |
| 모달 초점 가두기(frontend-a11y, click-path) | 신고 시트에서 Shift+Tab이 뒤 화면의 탭으로 새어 시트가 열린 채 탭 전환 가능 | 시트 안에서만 순환, 뒤 화면 `inert`, Esc 뒤 초점 복귀 | app.js 시트 코드 |
| 허용 역할(axe) | `<form role="dialog">` | dialog는 상자, form은 그 안 | 시트 axe 위반 1→0 |
| 보조기술 누출 | 스와이프 도장 글자 '잘했다/못했다/앞섰다/뒤졌다'가 StaticText 12개로 읽힘 | 0개(`aria-hidden`, swipe.js는 그대로) | 렌더 래퍼 |
| 장식 글자 | summary 이름에 "▸", 일지의 ▲▼■가 읽힘 | 글자만 읽히고 모양은 `aria-hidden` | |
| 화면 전환 초점(frontend-a11y) | 공개·다음 카드 뒤 초점이 body로 빠짐, 온보딩은 장마다 Tab 필요 | 새 화면 틀로 초점 이동, 온보딩은 Enter만 | |
| touch-action | 판 본문(스크롤 상자)에서 시작한 가로 끌기가 취소돼 판단 안 됨 | 판단됨, 두 손가락 확대 유지, iOS 길게 눌러 선택 방지 | |
| 관계 정보(ARIA) | 확신도 척도·← → 단축키·달력 달 이름이 버튼과 연결 안 됨 | `aria-describedby`, `aria-keyshortcuts` | |
| tabular-nums·text-wrap·글꼴 | 머리줄·알림 숫자가 비례폭, 제목·안내 기본 줄바꿈 | `tnum`, balance/pretty, 폰트 스무딩 | |

눈에 보이는 변화: 확신도 칸 간격 8→18px, 신고 라디오 행 44px(시트 32px 길어짐), '개념 다시 보기' 여백, 줄바꿈. 나머지는 화면이 그대로다.

## 남은 것 (동작·설계 결정이라 고치지 않음)

| 남은 것 | 심각도 | 이유 / 제안 |
|---|---|---|
| h1 없음(5화면), 일지는 h2 다음 h5 | 중 | 화면별 sr-only h1을 두고 h5를 h2/h3로 정리. 스모크와 CSS가 `.concept h5`에 기대어 있어 함께 바꿔야 함 |
| 되돌리기 2.5초 고정(WCAG 2.2.1) | 중 | 화면 읽기 사용자는 알림을 다 듣기 전에 공개된다. 알림에 초점·포인터가 있는 동안 타이머를 멈추기(동작 변경) |
| 근거·확신도가 `aria-pressed` 토글인데 실제로는 하나만 고름 | 낮 | radiogroup이 맞음. CSS·스모크가 aria-pressed에 기댐 |
| 막힌 판단 버튼을 눌러도 반응 없음 | 낮 | 키보드·스와이프는 흔들림과 안내가 나옴. `aria-disabled`로 바꾸면 같은 피드백 |
| 다른 탭에 다녀오면 고르던 근거·확신도가 지워지고 card_view가 두 번 기록 | 낮 | 사례별 draft 보존 |
| 칩 히트 42px(목표 44) | 낮 | 8px 간격의 한계. 간격 10px이면 44 |
| `:active` 눌림 상태 없음 | 낮 | `--bg-200`(눌림) 토큰 미사용 — 디자인 결정 |
| 당겨서 새로고침 | 낮 | 맨 위에서 카드를 아래로 끌면 Android가 새로고침할 수 있음. `overscroll-behavior-y: contain`은 제품 결정 |

## 재실행

- 스모크: `node prototype/tests/smoke.cjs`
- 감사 하네스: `node prototype/tests/audit.cjs <label>`(히트 영역·초점·대비 측정, IfSave 프론트의 Playwright를 빌려 씀)

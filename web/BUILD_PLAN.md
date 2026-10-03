# 복기 웹앱 구현 분담 (2026-10-03)

기준 문서: `../docs/05_구현계획_v1.0.md`(ecc 반영판), `../docs/adr/0001~0004`, `../CONTEXT.md`, `../docs/reviews/*`. 화면과 동작의 정본은 `../prototype/`(정적 프로토타입, 스모크 144건)이다. **API 계약은 `src/shared/contract.ts` 하나**이며 모든 패키지가 이것을 import한다. 계약을 바꿔야 하면 바꾸고 이유를 이 파일 끝 "계약 변경"에 적는다.

## 공통 규칙

- Next.js 16 App Router, TypeScript strict, `any` 금지, 한국어 UI 문구. CSS는 프로토타입의 `design/tokens.css`·`components.css`·`app/css/app.css`를 그대로 옮겨 쓴다(학습지 디자인 유지). Tailwind 없음.
- 판단 전 코드(서버 컴포넌트·클라이언트·질문자)는 결과 자료를 읽지 않는다. 결과·누수 사전·제작 메모 모듈은 `import "server-only"`. 판단 전 응답은 `toPublicCase()`(zod `.strict()`) 하나로만 만든다.
- 적중률을 숫자로 집계·표시하지 않는다. 비슷함(±1%p)은 적중·실패로 세지 않는다. `.ds-hl`·결과색은 공개 뒤에만.
- 오류는 `{error:{code,message}}`. 비GET은 `Origin === PUBLIC_ORIGIN` + `application/json`. 세션은 핸들러에서 확인. 남의 자원은 404.
- 테스트: 단위 Vitest(`npm test`), e2e Playwright(`npm run e2e`, 로컬 dev 서버 + 시드 DB). 카나리 시험(가짜 회사명·티커·날짜·수익률이 판단 전 HTML·RSC·API·오류·질문자 응답·일지 결과 대기 행에 없음)은 반드시 있다.
- git은 조정자만 쓴다(에이전트는 커밋하지 않는다). 커밋에 서명 줄 없음.
- 개발 DB: `postgresql://bokgi:bokgi-dev@127.0.0.1:5434/bokgi`(`.env`에 있음, 컨테이너 `bokgi-dev-db`). 테스트는 같은 DB의 `bokgi_test` 스키마나 별도 DB를 쓰고 끝나면 정리한다.

## 패키지와 소유 경로 (서로의 경로는 건드리지 않는다)

| 패키지 | 소유 경로 | 산출물 |
|---|---|---|
| **A 백엔드** | `prisma/**`, `src/server/**`, `src/app/api/**`, `src/lib/server/**`, `tests/unit/**`, `scripts/seed.ts`, `src/app/layout.tsx`(최소), `src/app/page.tsx`(임시) | 스키마·마이그레이션(SQL CHECK·부분 인덱스 포함)·시드(upsert, `--dry-run`), 인증(초대→닉네임→DB 세션 쿠키 `__Host-bokgi_sid`, 로그아웃, 한도), `toPublicCase`, 판단(유일 키 멱등, 조건부 공개, 개념 확인), 오늘(서버 tz, 세트 고정, `deck_order`), 개념·퀴즈(서버 채점, 복습 간격), 일지(달력·인사이트 문장), 신고, 이벤트(allow-list, 멱등), AI(템플릿 질문 6유형·템플릿 해설 3줄, LLM 경로는 `AI_ENABLED`·가드 체인·`ai_usage_daily`), `/api/health`, 단위·API 테스트, API 수준 카나리 시험 |
| **B 배포·운영** | `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `scripts/deploy.sh`, `scripts/env-check.mjs`, `.env.example`, `ops/**`, `README.md`의 운영 절 | 멀티스테이지 standalone 이미지(`user: nextjs`), compose(web `127.0.0.1:3100:3000`, db 포트 게시 없음, `mem_limit`, 로그 회전, `restart`), 별도 `migrate` 타깃(`prisma migrate deploy`만), bash 3.2 호환 배포 스크립트(env 검증 → build 태그=git sha → `pg_dump -Fc` → migrate → up → `/api/health` 대기 → 실패 시 직전 태그), 터널 ingress·DNS 절차서, IfSave `pg-backup.sh`에 bokgi-db 추가 패치안, UptimeRobot 설정 절차 |
| **C 카드 도구·콘텐츠** | `tools/cards/**`(Python), `content/**`(카드·개념 JSON), `tools/tests/**` | 카드 JSON 스키마(판단 전/공개 뒤/서버 전용 세 구획), 개념 20개 JSON(기획안 §7), 예시 카드 6장(프로토타입 3장 포함, "예시 자료" 표기, 파생 지수 14점), `check_case.py`(체크리스트 자동 검사: 판단 전 구획에 절대 날짜·회사명·티커·결과 수치 0건, 공시일 ≤ 판단 시점, 출처 필수, 배당·분할 플래그), `mask.py`, `flow_index.py`, `outcome.py`, `pick_case.py`(결과 균형 → `deckOrder`), pytest |
| **D 프런트** | `src/app/(ui)/**`, `src/components/**`, `src/styles/**`, `src/lib/client/**`, `src/hooks/**`, `tests/e2e/**`, `src/app/globals.css` | 프로토타입 화면을 React로 이식: 온보딩, 오늘(입장 띠·스택·세 판·게이트·스와이프·버튼·키보드·되돌리기·바로 공개), 공개(세 상태·부호·모양·개념 확인 ○△✕·해설 세 줄·개념+퀴즈·신고 시트), 오늘 끝·한 장 더·복습, 일지(달력·목록·접힌 통계·인사이트), 개념 목록·상세. `src/lib/client/api.ts`는 계약으로 호출하고 `NEXT_PUBLIC_USE_MOCK=1`이면 `src/lib/client/mock.ts`(프로토타입 data.js 이식)로 동작한다. 접근성은 `../docs/reviews/2026-10-03_ecc_ux_review.md`의 '고친 것'을 그대로 지키고 '남은 것' 중 h1 구조·`aria-disabled`·draft 보존·되돌리기 타이머 일시정지(초점·포인터가 알림 위면 멈춤)를 구현한다. Playwright e2e: 온보딩→판단 3장→공개→일지→개념, 카나리(목 모드 아님, 실제 API). |

통합(조정자): A·D가 끝나면 실제 API로 e2e를 돌리고, B의 compose로 로컬 기동 → 맥미니 배포.

## 카드 JSON (C가 정의, A의 시드가 읽음) — 세 구획

```json
{ "id": "uuid", "version": 1, "status": "live", "deckOrder": 1,
  "public":  { "yearPublic": 2023, "sectorPublic": "소프트웨어", "sizeBucket": "대형", "horizonDays": 180, "difficulty": 2,
               "panels": { "flow": {...}, "numbers": {...}, "then": {...} },
               "evidenceOptions": [{"id":"ev1","label":"매출 +23%","why":"...","panel":"numbers"}], "riskOptions": [...] },
  "reveal":  { "outcome": { "companyName": "...", "ticker": "...", "startDate": "2023-09-15", "endDate": "2024-03-15", "returnPct": 4.8, "benchReturnPct": 7.1, "benchName": "S&P 500", "pricePath": [14], "benchPath": [14], "sources": [...] },
               "keyPoints": ["..."], "learningPoints": [{"conceptId":"abs-vs-relative","rank":1,"linkSentence":"..."}] },
  "internal": { "notes": "제작 메모", "leakTerms": ["회사명","티커","제품명"], "dataCutoff": "2023-09-15" } }
```
`public` 구획에는 절대 날짜·회사명·티커·결과 수치가 없어야 하고 `check_case.py`가 이를 검사한다. 예시 카드는 `internal.notes`에 "예시 자료(실측 아님)"를 적는다.

## 완료 기준

- A: `npm run build` 통과, `npm test` 통과(카나리 포함), `npx prisma migrate deploy` + `npm run seed` 로 빈 DB가 채워짐, `curl /api/health` ok.
- B: `docker compose build` 성공, `docker compose up` 뒤 `/api/health` 200, `scripts/deploy.sh --dry-run` 동작.
- C: `pytest tools/tests` 통과, `python3 tools/cards/check_case.py content/cards` 전 카드 통과.
- D: 목 모드 e2e 통과 + 실제 API e2e(통합 때) 통과, 접근성 체크(히트 44px·초점·ARIA) 유지.

## 계약 변경 기록
- 2026-10-04 (A) `contract.ts`는 바꾸지 않았다. 계약에 없던 동작만 보충한다(자세히는 `src/server/README.md` '계약 보충').
  - `GET /api/session/today?extra=1`: 세트를 다 판단했으면 `cards`에 세트 밖 카드 1장('한 장 더'). 이유: '한 장 더' 카드 id를 받을 경로가 계약에 없다. 판단은 `isExtra: true`.
  - 온보딩 완료는 `POST /api/events`의 `onboarding_done`으로 기록한다(→ `Me.user.onboarded`). 이유: 계약에 온보딩 완료 엔드포인트가 없다.
  - 계약에 모양이 없는 응답: self-check `{ok, selfCheck}`, reports 201 `{ok, reportId}`, events `{ok, accepted, duplicates, rejected}`, logout `{ok}`, invite는 `Me` + 쿠키, judgments는 새 판단 201·재전송 200. 공개·로그아웃은 본문 없이 보내도 된다.
  - 세션 쿠키 이름은 `PUBLIC_ORIGIN`이 https일 때 `__Host-bokgi_sid`, http 개발 환경에서는 `bokgi_sid`(브라우저가 Secure 없는 `__Host-` 쿠키를 버리므로).
  - 스키마(05 §3과 다른 점): `case_learning_points` 키에 version 추가, 서버 전용 `case_internal`·초대 한도 `rate_limits` 테이블 추가, `cases.deck_order`는 live 카드 사이에서만 유일(C의 카드 스키마 규칙), 상태에 `reviewed` 추가, 퀴즈는 `quizzes` 테이블(정답 열 서버 전용), `concepts`·`quizzes`에 `active`(콘텐츠에서 빠지면 지우지 않고 false).
  - 채점은 계약의 `roundPp()`·`resultState()`를 쓴다. 시드 CLI: `--content <폴더>`(여러 번 가능)·`--dry-run`·`--retire-missing`(콘텐츠에 없는 live 카드는 retired, 개념은 active=false — 예시 → 실제 카드 교체용). 개발 DB는 2026-10-04에 `../content`(카드 6·개념 20)로 채웠고 예시 픽스처 카드 3장은 retired.
- 2026-10-04 (조정자, C 보고 반영) `roundPp()` 추가. `resultState()`는 소수 첫째 자리로 반올림한 뒤 ±1.0 판정 — 카드 도구·서버·클라이언트가 같은 규칙을 쓴다.
- 2026-10-04 (C) `outcome.sources[].kind` 관례: `예시`(실측 아님 표기, 공개 화면에 "예시 자료" 태그), `가격`(label에 배당·분할 반영 명시). `windowDays` = 흐름 창 길이(달력 일). 흐름 `index14`는 창 첫날 = 100, 결과 경로는 판단일 = 100.
- 2026-10-04 (C) 05 §3의 `start_price`·`end_price`·`sector_return_pct`·`reviewed_at`은 카드에 원천 값이 없어 nullable. `NumbersPanel`에 이자보상배율·영업현금흐름 자리는 두지 않음(기획안 §5.1보다 좁음; 2단계에서 확장).
- 2026-10-04 (D) `contract.ts`는 바꾸지 않았다. 클라이언트(`src/lib/client/api.ts`)는 A의 계약 보충을 그대로 쓴다: 한 장 더 = `GET /api/session/today?extra=1`의 `cards[0]`(미공개 한 장 더도 여기서 찾아 돌아오면 공개), 온보딩 완료 = `onboarding_done` 이벤트(바로 보냄) + 기기 표시 `bokgi.onboarded.{userId}`, 일지 달 = `?month=YYYY-MM`, 모양 없는 2xx 본문(self-check·reports·events)은 읽지 않는다.
  - 계약에 없어 기기(`localStorage['bokgi.today.v1']`, 날짜별)에 남기는 것: 오늘 되짚은 개념('오늘 끝' 요약), 푼 복습 수('복습 i/n'), 한 장 더 판단 수('오늘 3/3 +k'). **제안**: `Today`에 `extraJudged: number`와 `conceptsToday: {conceptId,title,state,dueOn}[]` — 그러면 기기 기록이 필요 없고 다른 기기에서도 맞는다.
  - 퀴즈: 틀렸을 때 정답 보기 표시는 `explanation`의 `‘…’`(A 고정 문구 '아니에요. 정답: ‘…’.')를 보기 글자와 맞춰 고른다. **제안**: `QuizResult.answerIndex`(채점 뒤라 노출 무방) — 클라이언트는 선택 필드로 이미 읽는다.
  - 인사이트 카드의 작은 머리(확신도·근거·아는 회사)는 문장 앞부분으로 고른다. **제안**: `stats.insights`를 `{kind, text}[]`로.
  - 달력 넘기기 범위(첫 판단 달 ~ 마지막 복습 예정 달)는 일지 `items[].localDate`와 `/api/concepts`의 `dueOn`으로 계산한다(서버가 `?month=`를 모르면 같은 자료로 그 달을 계산).
  - `Gesture.via`: 키보드 ← →는 `"key"`(프로토타입은 `"button"`). 키보드로 판단하면 초점이 [바로 공개]로 가고, 알림에 초점·포인터가 있는 동안 2.5초 타이머가 멈춘다.
  - 판단 전송 시점: 되돌리기 창이 끝나거나 [바로 공개] → `POST /api/judgments` → 공개. 창 안에서 탭 이동·페이지 이탈(pagehide, keepalive)이면 공개 없이 보낸다(일지 '결과 대기'). 되돌리기는 서버 호출 없음(`undo` UI 이벤트만).
  - 출처 표시(C 관례): `kind "예시"` → 기간 줄에 '예시 자료' 꼬리표, 나머지 kind(가격·공시·통계·보도)는 경로 아래 짧은 목록(label + url). `keyPoints`는 '사후에 중요했던 것' 아래, `linkSentence`는 개념 카드 본문 앞.
  - 목 모드(`NEXT_PUBLIC_USE_MOCK=1`)는 `next dev` 전용: `api.ts`의 `NODE_ENV !== "production"` 가지에서만 `./mock`을 읽어 운영 빌드에는 목·예시 결과 자료가 없다(빌드 산출물 grep 0건). 목은 A 서버 규칙(세트 고정·extra·onboarding_done·퀴즈 해설 문구·roundPp)을 따르고 모든 응답을 계약 스키마로 검사한다.
  - e2e: `npm run e2e`(목, `next dev -p 3210`을 직접 띄움 — 같은 폴더의 다른 `next dev`는 먼저 내린다), `npm run e2e:real`(canary.spec.ts만: 카나리 카드 deckOrder 1로 시드한 DB, 새 초대 코드 `E2E_INVITE_CODE`, 떠 있는 서버를 쓰려면 `E2E_BASE_URL` + 그 서버의 `PUBLIC_ORIGIN`). 2026-10-04 별도 DB(`bokgi_e2e_d`, 끝나고 삭제)에 예시 3장 + 카나리를 시드해 통과 확인.

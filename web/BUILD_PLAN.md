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
(없음)

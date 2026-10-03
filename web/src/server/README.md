# 복기 백엔드 (패키지 A)

Next.js 16 Route Handlers + Prisma 7(드라이버 어댑터 `@prisma/adapter-pg`) + Postgres 16. 계약은 `src/shared/contract.ts` 하나.

## 실행

```bash
cd web
npm install
npx prisma migrate deploy                         # 마이그레이션 적용(추가형만, 지우지 않음)
npm run seed                                      # 콘텐츠 upsert: CONTENT_DIR → ../content → ./content
npm run seed -- --content tests/fixtures/content  # 예시 자료(프로토타입 카드 3장, "예시 자료(실측 아님)")
npm run seed -- --dry-run                         # 검사·생성/갱신 수만
npm run seed -- --retire-missing                  # 콘텐츠에 없는 live 카드는 retired, 개념은 active=false(삭제 아님)
npm run invite -- create --count 5 --label 베타1  # 초대 코드(원문은 이때 한 번만 출력, DB엔 해시)
npm run invite -- recover --user <uuid|닉네임>    # 쿠키를 잃은 사용자 재발급(같은 계정)
npm run dev                                       # http://localhost:3000, curl /api/health
npm test                                          # 단위 + API(시험 DB bokgi_test, 카나리 포함) — DB 컨테이너 필요
npm run test:unit                                 # DB 없이 단위 시험만
npm run build                                     # prebuild로 prisma generate
```

- Prisma 클라이언트는 `src/server/generated/prisma`에 생성된다(git 제외). `npm run dev`·`build`·`test`가 먼저 `prisma generate`를 돈다(postinstall은 쓰지 않는다 — 이미지의 `npm ci` 단계엔 스키마가 없다).
- Prisma 7 CLI는 `.env`를 자동으로 읽지 않으므로 `prisma.config.ts`가 직접 읽는다. `DATABASE_URL`이 없으면 datasource 없이 로드된다(이미지 빌드의 generate용).
- API 시험은 `.env`의 `DATABASE_URL`에서 DB 이름만 `bokgi_test`로 바꾼 DB를 쓴다(`TEST_DATABASE_URL`로 바꿀 수 있음, 이름이 `_test`로 끝나야 함). 시작할 때 DB가 없으면 만들고 `migrate deploy` → 테이블 비우기 → 예시 카드 3장 + 카나리 카드 시드. 개발 DB는 건드리지 않는다.
- `prisma migrate reset`은 AI 에이전트 실행 시 Prisma가 사용자 동의를 요구해 막는다. 개발 DB를 다시 만들 일이 있으면 사람이 직접 돌린다.

## 구조

| 경로 | 내용 |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/*` | 스키마. CHECK·부분 인덱스는 마이그레이션 SQL 끝에 손으로 더했다(Prisma가 무시하므로 drift 없음) |
| `src/lib/server/` | `db`(Prisma 싱글턴), `http`(오류 봉투·Origin·JSON·no-store·`route()`), `auth`(DB 세션·쿠키·`requireUser`), `rateLimit`, `time`(tz 날짜), `ko`(조사), `crypto` |
| `src/lib/server/ai/` | `numberGuard`(IfSave NumberGuard 이식) → `leakFilter`(규칙) → `labels`, `templates`(질문 6유형×3·해설 3줄), `client`(OpenAI 호환, 대체 공급자, 6초), `budget`(`ai_usage_daily`), `prompts` |
| `src/server/cases.ts` | `toPublicCase()` — 판단 전 유일한 읽기 경로(계약 `PublicCase.strict()`) |
| `src/server/outcomes.ts` | 공개 뒤·서버 전용 자료와 누수 사전(런타임 생성). 이 모듈만 `case_outcomes`·`case_reveal`·`case_learning_points`·`case_internal`을 읽는다 |
| `src/server/{session,judgments,concepts,journal,ai,feedback,authFlow,rules}.ts` | 오늘·판단/공개·개념/퀴즈·일지·AI·신고/이벤트·초대·순수 규칙 |
| `src/server/content/` | 카드·개념 원본 JSON 검증(`content/schema/*.json`과 같은 모양)과 세 등급 분리, upsert 시드 |
| `src/app/api/**/route.ts` | 계약의 경로 전부 + 없는 `/api/*`는 JSON 404 |
| `tests/unit`, `tests/api`, `tests/fixtures` | 단위·API·카나리. 픽스처 카나리 카드: `CANARY-회사`·`CNRY`·`2099-01-02`·`42.42` |

`src/server/**`·`src/lib/server/**`는 모두 `import "server-only"` — 클라이언트 번들에 들어가면 빌드가 깨진다. Vitest는 이를 빈 모듈로, 스크립트는 `--conditions=react-server`로 푼다.

## 규칙(05 §0·§4·§7, ADR-0001·0002)

- 자료 세 등급: ① `cases`·`case_blocks`(판 payload = 계약 FlowPanel·NumbersPanel·ThenPanel) ② `case_outcomes`·`case_reveal`·`case_learning_points` ③ `case_internal`. 시드가 나누고, ①에 회사명·티커·누수 낱말·절대 날짜가 있으면 멈춘다.
- 오늘·카드·일지의 결과 대기 행·질문자 생성은 결과를 읽지 않는다. 질문자 응답은 누수 필터만 사전(결과에서 만든)을 쓴다.
- 비GET: `Origin === PUBLIC_ORIGIN` + JSON 본문(본문 없는 공개·로그아웃은 본문을 생략해도 된다). 오류 `{error:{code,message}}` — 400·401·403·404·409·413·415·422·429(Retry-After)·500, 문구는 고정(입력·DB 값을 되풀이하지 않음). 응답은 모두 `Cache-Control: private, no-store`.
- 세션 쿠키: `PUBLIC_ORIGIN`이 https면 `__Host-bokgi_sid`(Secure), http 개발 환경이면 `bokgi_sid`(브라우저가 Secure 없는 `__Host-`를 버리므로). HttpOnly·SameSite=Lax·Path=/, 180일. DB엔 sha256만.
- 초대 한도: `CF-Connecting-IP`(해시)당 10분 5회, 전체 시간당 30회(`rate_limits`). 실패 문구 하나.
- 하루 = `users.tz`(기본 `APP_TZ`, Asia/Seoul)의 날짜. 세트는 첫 조회 때 `daily_sessions`에 고정(미판단 live 카드 `deck_order` 순 3장). 덱 순서는 live 카드 사이에서만 유일(부분 유일 인덱스).
- 결과 세 상태: 시장 대비 %p를 계약의 `roundPp()`로 소수 첫째 자리 반올림 → ±1.0 이내 비슷함(hit=null). 공개 당시 채점(`judgment_outcomes`)을 유지.
- 시드는 upsert만: 개념 파일이 그 개념의 문제 목록의 원본이라 목록에서 빠진 문제는 `active=false`(풀이 기록 보존), 문제 순서는 active 문제 사이에서만 유일. 읽기 경로는 active 개념·문제만 쓴다.
- 복습: 맞히면 level+1(새 개념은 0), 틀리면 0, 기한 전 정답은 유지, 간격 1·3·7·21일, `due_on`은 date. 숙련도: 2번 이상·정답 3/4 이상이면 이해.
- 통계: 공개된 판단 20장 미만이면 잠금. 인사이트는 횟수 문장만(퍼센트 없음).
- AI: 기본 템플릿. `AI_ENABLED=true`면 LLM → numberGuard → leakFilter → 라벨(가드 뒤에 문장을 바꾸지 않음), 질문 카드당 2회·하루 20회, 하루 호출 상한 `AI_DAILY_CALL_CAP`. 05 §11에 따라 질문자 LLM은 누수 100문항 통과 전까지 켜지 않는다(`AI_ENABLED=false` 유지).

## 계약 보충(스키마 변경 없음)

- `GET /api/session/today?extra=1` — 세트를 다 판단했으면 `cards`에 세트 밖 카드 1장(오늘 판단하고 아직 공개하지 않은 '한 장 더'가 있으면 그 카드). 판단은 `isExtra: true`로 보낸다.
- `POST /api/events`의 `onboarding_done` → `users.onboarded_at`을 채운다(`GET /api/me`의 `onboarded`).
- 응답 본문(계약에 모양이 없는 것): `PUT …/self-check` → `{ok, selfCheck}`, `POST /api/reports` → 201 `{ok, reportId}`, `POST /api/events` → `{ok, accepted, duplicates, rejected}`, `POST /api/auth/logout` → `{ok}`, `POST /api/auth/invite` → `Me` + 쿠키. `POST /api/judgments`는 새 판단 201, 재전송 200.

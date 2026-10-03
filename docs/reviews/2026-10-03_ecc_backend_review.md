# 복기 백엔드 설계 검토 (ecc 체크리스트, 2026-10-03)

_대상: 05 §2–§8, ADR 0001–0004, 03 §4–5. 코드가 없어 설계만 본다. 맥미니 포트·백업·워치독은 읽어서 확인했다._

## ① 결론

큰 틀(Next 한 컨테이너와 Postgres, 판단 전·후 테이블 분리, 127.0.0.1 바인딩과 터널)은 지인 10명 초대 베타에 맞다. 판정은 **조건부 적합**. 다만 ADR-0001의 보장이 05 안에서 이미 샌다. 판단 전 테이블과 판 payload에 결과급 값이 있고, 세션 선택이 결과를 읽으며, 화이트리스트는 Route Handler에만 걸려 있어 서버 컴포넌트·일지의 결과 대기 행·AI 출력이 빠진다. 판단·되돌리기·공개에는 유일성과 원자성이 없고, 배포에는 마이그레이션·백업·롤백이 없다. 높음 6건은 W2 스키마 작업 전에 05에 반영하고, 나머지는 해당 주차에 처리하면 된다. 빼도 되는 것도 많다(⑤).

## ② 발견 표

|#|심각도|위치|문제|제안|
|---|---|---|---|---|
|1|높음|§3 `cases`, `then` payload|판단 전 쪽에 결과급 값이 있다: `data_cutoff`(절대 날짜), `notes[].source_ref_hidden`(원문 위치). 학습 포인트(02 §5가 결과 암시로 봄)와 사례별 연결 문장은 등급이 없다. ADR-0001이 거절한 '필드 빼기'다|`data_cutoff` 삭제(`start_date`와 중복), 출처·학습 포인트·연결 문장은 공개 쪽으로(④-1·④-2)|
|2|높음|§7 세션|'결과 균형'을 런타임에 계산하면 판단 전 경로가 `case_outcomes`를 읽는다. 규칙 자체가 단서다(두 장이 앞섬이면 셋째는 아님)|균형은 `pick_case.py`가 `cases.deck_order`로 굳히고 런타임은 그 순서만 읽는다|
|3|높음|§0-1, §4, §8|화이트리스트가 Route Handler에만 있다. 서버 컴포넌트의 직접 조회(RSC 페이로드), 일지의 결과 대기 행, 오류·AI 응답이 빠지고, 필드명 탐색은 jsonb 속 값을 못 잡는다|판단 전 읽기는 `toPublicCase()` 하나(zod `.strict()`), 결과 모듈은 `server-only`+린트, 시험은 카나리 값 원문 검색(④-1·④-6)|
|4|높음|§4 undo·reveal|유일성·원자성이 없어 2.5초 경계에서 되돌리기와 자동 공개가 둘 다 성공할 수 있다(결과를 본 뒤 재판단). 이중 탭은 판단 2건|되돌리기는 클라이언트 보류로, `unique (user_id, case_id)`로 재전송 멱등, 공개는 조건부 UPDATE(④-3). 버전은 키에 넣지 않는다: 공개 뒤 새 버전 재판단은 무의미|
|5|높음|§5 가드 체인|어조 레이어가 가드 뒤라 통과한 문장이 다시 바뀐다. server-only·요청 본문이 미정이고, 누수 사전(전 카드 회사명 = 정답표)이 번들될 수 있다. 재요청으로 누수를 낚을 수 있다|어조는 생성 프롬프트에, 가드는 맨 끝. 요청은 id만, 컨텍스트는 서버가 조립, 카드당 질문 2회(④-4)|
|6|높음|§2 배포|`migrate deploy`·배포 전 덤프·롤백·백업이 없다. `--build`는 이전 이미지를 덮고, standalone 산출물엔 prisma CLI가 없다|④-5(기존 `com.ifsave.pgbackup`에 bokgi-db 추가, 복원 리허설, 추가형 마이그레이션)|
|7|중간|§2 인증, §1|초대 코드 출처가 셋(`INVITE_CODES`·`invites`·`users.invite_code`), 세션이 둘(서명 쿠키·`sessions_auth`). 1회 소비 원자성·로그아웃·폐기·쿠키 분실 복구가 없다|DB 세션 하나, 소비·가입·세션 생성을 한 트랜잭션, 쿠키 `__Host-bokgi_sid`, 로그인 때 새 토큰, 관리자 재발급 스크립트(④-2)|
|8|중간|§2·§4 CSRF|Route Handler엔 Server Action 같은 Origin 검사가 없다. SameSite=Lax는 같은 사이트인 `*.ifsave.com`(같은 기기의 IfSave·데모)발 요청을 통과시킨다|비GET은 `Origin === PUBLIC_ORIGIN`·JSON 본문 강제, 인증은 `proxy.ts`만 믿지 말고 핸들러에서 재확인(CVE-2025-29927 교훈)|
|9|중간|§4 `/api/ai/*`·초대, 03 §5|속도 제한이 없다. 일일 상한이 메모리면 재배포마다 0, 누수 판정은 호출을 두 배로 쓴다. 터널 뒤 원격 IP는 늘 같은 주소다|`ai_usage_daily` 카운터(판정 포함), `CF-Connecting-IP` 기준, `AI_ENABLED` 스위치, 가능하면 복기 전용 키(④-3)|
|10|중간|§3 → Prisma|CHECK 6개와 부분 인덱스는 schema.prisma로 선언되지 않는다(현행 Prisma 기준). `DateTime` 기본은 `timestamp(3)`(시간대 없음). PK·인덱스·jsonb 검증이 없다|닫힌 집합은 Prisma enum, 범위·불변식은 `--create-only` SQL, 시각은 `@db.Timestamptz(3)`, payload는 kind별 zod `.strict()`|
|11|중간|§3 버전, §6 seed|판·결과에 버전 키가 없어 '그때의 카드'를 복원할 수 없고, 결과 정정 규칙도 없다. 시드가 버전을 매기면 환경마다 번호가 다르다|버전·uuid는 카드 원본 JSON에 고정(티커·날짜 슬러그 금지), 시드는 upsert·`--dry-run`·`deleteMany` 금지, 공개 당시 채점은 유지|
|12|중간|§4 today, §7|하루 경계를 클라이언트 시간대 쿠키가 정한다. 첫 조회가 겹치면 세트가 두 번 뽑히고, 카운터·퀴즈 이중 제출이 경합한다. 복습 기한이 시각이다|서버가 `users.tz`(기본 Asia/Seoul)로 날짜 계산·`local_date` 저장, 세트 고정, 카운터는 파생, `due_on date`, 기한 전 정답은 level 유지(④-2)|
|13|중간|§3·§4 누락|`ai_dialogs`, 개념 확인(○△✕), `quiz_attempts`(01 §14 간격별 유지 지표), `/api/me`·로그아웃이 없다. `/judgments/{id}` 소유 확인이 없고, 일지 '초기화'는 불변 기록과 충돌한다|④-2·④-3에 추가, 남의 판단은 404, 서버판에서 초기화 제거|
|14|낮음|§2 컨테이너·감시|non-root·메모리 상한·로그 회전·`.dockerignore`·env 시작 검증이 없다. 워치독은 IfSave 생성물(URL 1개, 복구는 IfSave만)이라 URL을 넣어도 복기를 못 살린다|IfSave 프론트 설정 복사(④-5), 헬스는 DB만, 감시는 UptimeRobot과 `restart`, 로그에 프롬프트·초대 코드 금지|
|15|낮음|§4 events·형식|상태 변화 기록을 클라이언트 배치에 맡기면 누락률을 잴 기준이 없다. 오류 봉투·상태 코드가 없다|상태 변화는 서버가 기록, 클라이언트는 UI 이벤트만, 오류는 `{error:{code,message}}`(④-3)|

## ③ 체크리스트별 요약

- **backend-patterns** 미비: 공개 DTO 경계, 중앙 오류 처리, 구조화 로그. 캐시·큐는 필요 없음(통과).
- **api-design** 부분: 자원·행위 경로는 무난. 입력 스키마·오류 봉투·상태 코드·소유 확인·속도 제한 미비.
- **postgres-patterns** 미비: PK·유일·`(user_id, created_at)` 인덱스·타임아웃 없음. RLS는 불필요.
- **prisma-patterns** 미비: CHECK·부분 인덱스 한계, Timestamptz, 트랜잭션 밖 외부 호출, DTO 매핑 미기재.
- **security-review** 부분: 쿠키 플래그·비밀값 env는 통과. CSRF·속도 제한·세션 폐기·보안 헤더·로그 위생·의존성 감사·백업 미비.
- **database-migrations** 미비: 배포 경로, 추가형 원칙, 스키마와 시드의 분리 없음.
- **deployment-patterns** 부분: 헬스 대기·UptimeRobot 통과. 롤백·이미지 태그·env 검증·자원 상한 미비.
- **docker-patterns** 부분: 127.0.0.1 바인딩 통과. non-root·로그 회전·`.dockerignore`·DB 포트 제거 미비.

## ④ 05에 바로 반영할 수정 문안

**④-1 §0 원칙 1 교체**

```markdown
1. **자료를 세 등급으로 나눈다.** ① 판단 전 `cases`·`case_blocks` ② 공개 뒤 `case_outcomes`·`case_reveal`(회사·티커·날짜·수익률·경로·원문 출처·학습 포인트·사후에 중요했던 것) ③ 서버 전용(누수 사전·제작 메모). ①의 행과 jsonb에는 ②③ 값이 없다. 판단 전 읽기는 `toPublicCase()` 하나로 한다(Route Handler·서버 컴포넌트·질문자 공통, zod `.strict()`). ②③ 모듈은 `import "server-only"`와 린트로 격리하고, 오늘·카드·일지의 결과 대기 행·질문자는 `case_outcomes`를 읽지 않는다. (`adr/0001`)
```

**④-2 §3 보강**

```sql
-- 판단 전에서 삭제: cases.data_cutoff, then.notes[].source_ref_hidden, concepts.link_sentence
cases: + deck_order int not null unique
case_blocks pk (case_id, version, kind); case_outcomes pk (case_id, version)
case_reveal (case_id, version, key_points jsonb, pk (case_id, version))
case_learning_points (case_id, concept_id, rank, link_sentence, pk (case_id, concept_id))  -- 공개 쪽
judgments: + local_date date not null, self_check, is_extra, direction not null,
           unique (user_id, case_id), index (user_id, created_at desc)
judgment_outcomes: check ((state = 'even') = (hit is null))
invites (code_hash pk, label, expires_at, used_at, used_by unique)
sessions_auth (token_hash pk, user_id, expires_at, revoked_at)
ai_dialogs (id, user_id, case_id, judgment_id, role, template_type, text, guard jsonb, latency_ms)
ai_usage_daily (day pk, calls)
concept_progress (user_id, concept_id, state, level, due_on date, pk (user_id, concept_id))  -- review_schedule 통합
quiz_attempts (id, user_id, concept_id, correct, via, level_before, client_attempt_id, unique (user_id, client_attempt_id))
daily_sessions (user_id, local_date, case_ids uuid[], pk (user_id, local_date))  -- 카운터 열 삭제
```

**④-3 §4 API 규칙**

```markdown
공통: 비GET은 `Origin === PUBLIC_ORIGIN`과 `application/json`만. 세션은 핸들러에서 확인. `/judgments/{id}/*`는 `{id, userId}`로 찾고 남의 것은 404. 오류 `{error:{code,message}}`(422·409·429+`Retry-After`). 응답 `Cache-Control: private, no-store`.

|경로|규칙|
|---|---|
|POST `/api/judgments`|2.5초 창이 끝나거나 [바로 공개]·탭 이탈 때 보낸다. 칩 id는 그 카드 것만. 같은 카드 재전송은 기존 판단 200|
|POST `…/undo`|삭제. 되돌리기는 클라이언트 보류, `undo`는 UI 이벤트로만|
|POST `…/reveal`|`SET revealed_at = coalesce(revealed_at, now()) WHERE id = ? AND user_id = ?`, 채점은 `ON CONFLICT DO NOTHING`. 반복 호출은 같은 응답. 해설은 템플릿 즉시, AI 해설은 따로|
|PUT `…/self-check`|공개 뒤에만|
|POST `/api/auth/invite`|`CF-Connecting-IP`당 10분 5회, 전체 시간당 30회, 실패 문구 하나|
|POST `/api/ai/question`|본문 `{caseId, evidenceId, confidence}`만. 하루 20회·카드당 2회, 넘으면 템플릿|
|POST `/api/ai/explain`|본문 `{judgmentId}`만. 1회 생성 후 캐시|
|POST `/api/events`|UI 이벤트 allow-list, ≤32KB, `clientEventId` 멱등|
|추가|GET `/api/me`, POST `/api/me/onboarded`, POST `/api/auth/logout`|
```

**④-4 §5 AI 추가**

```markdown
- `lib/ai/*`와 누수 사전은 `import "server-only"`. 사전은 `case_outcomes`에서 서버가 만들고 번들·`public/`에 두지 않는다.
- 질문자 입력은 `toPublicCase()`와 칩 라벨·확신도뿐. 사용자 자유 텍스트·닉네임·신고 메모는 넣지 않는다.
- 순서: 생성(어조는 시스템 프롬프트) → numberGuard → leakFilter → 라벨. 가드 뒤에 문장을 바꾸는 단계는 없다.
- 호출은 6초 제한, DB 트랜잭션 밖. 실패·한도·`AI_ENABLED=false`면 템플릿.
- 기록은 유형·가드 결과·지연만. 프롬프트 원문은 로그에 남기지 않는다.
```

**④-5 §2 배포·운영**

```markdown
- 배포: env 검증 → build(태그 = git sha) → `pg_dump -Fc` → `compose run --rm migrate`(prisma CLI가 든 별도 타깃, `migrate deploy`만) → `up -d` → `/api/health` 대기 → 실패 시 직전 태그로. 마이그레이션은 추가형만.
- compose: web `127.0.0.1:3100:3000`, `user: nextjs`, `restart: unless-stopped`, `mem_limit: 512m`, 로그 10m×3. db는 포트 게시 없음, `statement_timeout=15s`. `.dockerignore`에 `.env*`.
- 백업: IfSave 런북 5-1의 `pg-backup.sh`(03:00·AES-256·rclone·하트비트)에 bokgi-db 추가, W8 전 복원 리허설.
- 감시: UptimeRobot → `/api/health`(DB만, AI 제외). IfSave 워치독은 고치지 않는다.
```

**④-6 §8 시험 추가**

```markdown
|결과 유출(카나리)|가짜 회사명·티커·날짜·수익률 카드로 판단 전 HTML·RSC·API·오류·질문자 응답과 결과 대기 일지 행의 원문 검색|0건|
|경합|같은 판단·공개를 동시에 2회|판단 1건, 같은 응답|
|권한·CSRF·한도|남의 판단 id, 다른 Origin, 초대 6회|404·403·429|
|마이그레이션·시드·복원|운영 덤프 복사본에 `migrate deploy`, 시드 2회, 백업 복원|성공, 행 수 불변|
```

## ⑤ 베타에서 뺄 수 있는 것

- 시간대 쿠키 → 서버 고정 Asia/Seoul(`users.tz` 열만 예약).
- 서버 되돌리기 엔드포인트 → 클라이언트 보류 전송. 경합이 사라진다.
- `card_versions`(diff jsonb) → 카드 원본 JSON을 저장소에서 버전 관리, DB엔 `(case_id, version)` 키만.
- 카운터 열과 별도 `review_schedule` → 파생값과 `concept_progress` 하나.
- 어조 2종·문장 단위 라벨 분류 → 중립 1종, 출력 칸 고정 라벨(잘 읽은 것 📄·바꿀 것 🔍·개념 📄).
- (선택) 질문자 LLM → 누수 100문항 통과 전까지 템플릿 질문만. 그동안 판정 호출·방향 중립성 시험도 쉰다.
- 만들지 않는다: 결과 전용 DB 역할·별도 Prisma 클라이언트(모듈 경계와 카나리 시험으로 충분), Redis, 페이지네이션, `/v1`, OpenAPI, 관리자 화면, 이벤트 누락률 측정.

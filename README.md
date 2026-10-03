# 복기 (Bokgi)

**실제 과거 시장 사례를 두고 먼저 판단하고, 결과를 되짚어 금융 개념을 배우는 투자 학습 서비스.** 하루 카드 3장, 5분.

- 상태: 기획 v1.0(2026-10-03) · **웹앱 구현 1차(2026-10-04, 예시 카드 6장)** · 베타 목표 2026-11-30 · 합치기/새 앱 체크포인트 2026-12-12
- 가칭이며 상표·도메인 확정 전이다. 베타 주소는 `bokgi.ifsave.com`.
- IfSave 개편 워크시트(2026-09-30)에서 출발했고, 지금은 **독립 제품**으로 기획한다. 연구(LCHR)와는 자산만 공유한다.

## 문서 지도

| 읽을 순서 | 문서 | 내용 |
|---|---|---|
| 1 | [CONTEXT.md](CONTEXT.md) | 용어집. 다른 문서는 이 용어를 따른다 |
| 2 | [docs/00_결정기록.md](docs/00_결정기록.md) | 인터뷰로 정한 15건, 작성자 판단, 확인한 사실, 미결 |
| 3 | [docs/01_기획안_v1.0.md](docs/01_기획안_v1.0.md) | 기획 본문: 정의·카드·학습 구조·AI·품질·라이선스·단계 |
| 4 | [docs/02_UX_검토와_화면_변경.md](docs/02_UX_검토와_화면_변경.md) | 사용자 관점 검토와 화면 변경 |
| 5 | [docs/03_재사용_지도.md](docs/03_재사용_지도.md) | IfSave·연구 자산 → 복기 모듈(개발자용) |
| 6 | [docs/04_합치기_vs_새앱_판단표.md](docs/04_합치기_vs_새앱_판단표.md) | 12/12 체크포인트 판단표 |
| 7 | [docs/05_구현계획_v1.0.md](docs/05_구현계획_v1.0.md) | 스택·스키마·API·AI·제작 도구·13주 일정 |
| 8 | [docs/06_디자인시스템.md](docs/06_디자인시스템.md) | 학습지 디자인 시스템과 스와이프 규칙 |
| 9 | [docs/adr/](docs/adr/) | 되돌리기 어려운 결정 4건 |

원본 워크시트 문서는 `source/worksheet-2026-09-30/`에 수정 없이 보존한다.

## 프로토타입

`prototype/app/index.html`을 VS Code Live Server로 열거나 `file://`로 직접 연다. 380px 모바일 뷰가 의도한 레이아웃이다. 빌드 없음. 자세한 흐름과 변경 기록은 [prototype/README.md](prototype/README.md).

## 웹앱 (`web/`)

Next.js 16 풀스택(Route Handlers) + Postgres(Prisma). 판단 전·공개 뒤·서버 전용의 자료 세 등급과 단일 읽기 경로 `toPublicCase()`는 [docs/adr/0001](docs/adr/0001-판단-전후-자료-물리적-분리.md), API 계약은 `web/src/shared/contract.ts` 하나다. 실행·운영은 [web/README.md](web/README.md), 서버 구조는 [web/src/server/README.md](web/src/server/README.md), 구현 분담과 계약 변경 기록은 [web/BUILD_PLAN.md](web/BUILD_PLAN.md).

```
cd web && npm ci
npx prisma migrate deploy && npm run seed    # .env의 DATABASE_URL(개발 DB)에 ../content 시드
npm run invite -- create                     # 초대 코드(원문은 이때 한 번만 보인다)
npm run dev                                  # http://localhost:3000 · NEXT_PUBLIC_USE_MOCK=1 이면 서버 없이 목으로
```

## 카드 콘텐츠와 제작 도구 (`content/`, `tools/`)

카드 JSON은 `public`(판단 전)·`reveal`(공개 뒤)·`internal`(서버 전용) 세 구획이다. 지금 든 6장은 모두 **예시 자료**(실측 아님, `sources.kind = "예시"`)이고 베타 공개 전에 실제 카드 30장으로 바꾼다. 도구 설명은 [tools/README.md](tools/README.md).

```
python3 tools/cards/check_case.py content/cards    # 판단 전 구획에 회사명·티커·절대 날짜·결과 수치 0건, 출처·공시일, 덱 균형
python3 -m pytest tools/tests -q
```

## 검사

```
node scripts/validate-docs.mjs                 # 마크다운 링크·제어문자
cd web && npm test && npm run lint && npm run build   # 단위·API(카나리 포함) · lint · 운영 빌드
cd web && npm run e2e                          # 목 모드 Playwright(dev 서버를 3210에 직접 띄운다)
cd web && npm run e2e:real                     # 실제 API 카나리(카나리 카드를 시드한 DB + E2E_INVITE_CODE 필요)
```

## 규칙

- 기획 본문에는 브랜치·커밋·명령을 쓰지 않는다. 개발 세부는 03·05와 부록으로.
- 판단 전 코드는 결과 자료와 결과색을 쓰지 않는다. 적중률을 큰 숫자로 보여 주지 않는다.
- 커밋에 서명 줄을 넣지 않는다. 비밀값은 저장소에 두지 않는다.

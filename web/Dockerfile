# syntax=docker/dockerfile:1
#
# 복기(bokgi) 웹 — Next.js 16 standalone + Prisma 7, 맥미니 홈서버(compose 프로젝트 bokgi)
#
#   deps    : npm ci(락파일 그대로). Prisma schema-engine 바이너리도 이때 컨테이너 플랫폼에 맞게 받는다.
#   build   : prisma generate → next build → .next/standalone
#   migrate : prisma CLI가 든 1회용 타깃. 기본 명령은 `prisma migrate deploy` 하나뿐이다(scripts/migrate.sh).
#   runner  : standalone + .next/static + public, non-root nextjs, HEALTHCHECK /api/health  ← 기본(마지막) 타깃
#
# 빌드는 scripts/deploy.sh가 한다(태그 = git sha). 손으로 확인할 때:
#   docker build --target runner  -t bokgi-web:try .
#   docker build --target migrate -t bokgi-migrate:try .
#
# 아키텍처: --platform을 박지 않는다. node 이미지는 멀티아치라 맥미니(M1)에서는 arm64가 잡힌다.

ARG NODE_IMAGE=node:22-alpine

########################################
# base — 빌드 계열 공통(deps·build·migrate)
########################################
FROM ${NODE_IMAGE} AS base
# openssl: Prisma가 schema-engine 바이너리를 고를 때 OpenSSL 버전을 탐지한다. 없으면 엉뚱한 엔진을 받는다.
# libc6-compat: Next SWC(Turbopack) 네이티브 바이너리의 glibc 심볼 호환(Next 공식 with-docker 예시와 같다).
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

########################################
# deps — 의존성만(package*.json이 바뀔 때만 다시 돈다)
########################################
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

########################################
# build — prisma generate → next build
########################################
FROM deps AS build
ENV NODE_ENV=production
COPY . .
# 빌드 단계에는 DATABASE_URL도 비밀값도 없다(.env*는 .dockerignore로 컨텍스트에서 빠진다).
#   · prisma.config.ts는 DATABASE_URL이 없으면 datasource를 비운 채 로드된다 → generate는 접속 없이 돈다.
#   · next build가 DB를 건드리면 "DATABASE_URL is not set"(src/lib/server/db.ts)으로 여기서 깨진다
#     → 그 화면·라우트를 동적으로 바꿀 일이지, 빌드에 값을 넣을 일이 아니다.
# 생성물(src/server/generated/prisma)은 컨텍스트에 있어도 여기서 다시 만든다(package.json의 prebuild도
# 같은 일을 한 번 더 한다 — 0.5초, 무해). prisma/가 없으면 건너뛴다.
RUN if [ -d prisma ] || ls prisma.config.* prisma7.config.* >/dev/null 2>&1; then \
      ./node_modules/.bin/prisma generate; \
    else \
      echo "build: prisma/ 없음 — prisma generate 건너뜀"; \
    fi
# NEXT_PUBLIC_*(목 모드 NEXT_PUBLIC_USE_MOCK 등)은 여기서 비어 있다 = 실제 API로 굽힌다.
RUN npm run build
# 산출물 자리를 여기서 확인한다. 없으면 runner의 COPY가 원인과 무관한 메시지로 깨진다
# (그때는 next.config.ts의 output: "standalone"부터 본다).
RUN test -f .next/standalone/server.js \
 && test -d .next/static \
 && test -d public

########################################
# migrate — prisma CLI + web/ 소스(prisma/·prisma.config.ts·scripts/·src/)
#   docker compose --profile migrate run --rm migrate                 → prisma migrate deploy (기본)
#   docker compose --profile migrate run --rm migrate npm run invite  → 초대 코드(명시적으로 부를 때만)
#   시드는 저장소 루트의 content/(빌드 컨텍스트 밖)를 읽기 전용으로 붙여 부른다 — README "운영".
# DB 포트를 게시하지 않으므로 운영 DB에 닿는 일회성 작업은 이 이미지로 compose 네트워크 안에서 한다.
# deps 위에 얹는다(node_modules 레이어를 복사하지 않고 공유 — 태그가 늘어도 디스크는 소스 레이어만큼만 는다).
########################################
FROM deps AS migrate
ENV NODE_ENV=production
COPY . .
# seed·invite가 import하는 생성 클라이언트(src/server/generated/prisma). 깨끗한 체크아웃에는 없을 수 있다.
RUN if [ -d prisma ]; then ./node_modules/.bin/prisma generate; fi
USER node
CMD ["sh", "scripts/migrate.sh"]

########################################
# runner — 실행 이미지(기본 타깃). node만 있는 깨끗한 이미지에 standalone을 얹는다.
#   Prisma 7 클라이언트는 Rust 엔진이 없다(쿼리 컴파일러 wasm + 드라이버 어댑터) → openssl 불필요.
########################################
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Seoul
# HOSTNAME=0.0.0.0: 기본값(컨테이너 ID)이면 컨테이너 IP에만 묶여 healthcheck의 127.0.0.1이 닿지 않는다.
# 바깥 노출 범위는 여기가 아니라 compose의 "127.0.0.1:3100:3000"이 정한다.

RUN addgroup -S -g 1001 nodejs \
 && adduser -S -D -H -u 1001 -G nodejs -s /sbin/nologin nextjs

# standalone = server.js + 추적된 최소 node_modules + .next/server. static·public은 따로 복사해야 한다
# (빠지면 페이지는 200인데 CSS·이미지가 전부 깨진다 — IfSave frontend/Dockerfile의 같은 주석).
# .next 소유를 nextjs로 둔다: 런타임에 .next/cache(ISR·이미지 캐시)를 쓴다.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# 이미지에 curl이 없다 → node 22 전역 fetch. 계약(src/shared/contract.ts Health)의 ok===true까지 본다.
# /api/health는 DB만 확인한다(AI 제외). Docker는 unhealthy를 재시작하지 않는다 — 알림은 UptimeRobot 몫.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>r.ok?r.json():Promise.reject(r.status)).then(j=>process.exit(j&&j.ok===true?0:1)).catch(()=>process.exit(1))"]

# 배포 태그(git sha). 맨 끝에 둬야 태그가 바뀌어도 위 레이어 캐시가 산다.
# src/lib/server/env.ts의 version()이 APP_VERSION을 읽어 /api/health의 version으로 돌려준다 →
# deploy.sh가 그 값으로 "방금 올린 컨테이너가 응답한다"를 확인한다.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
LABEL org.opencontainers.image.title="bokgi-web" \
      org.opencontainers.image.version="${APP_VERSION}"

# standalone이 만든 최소 서버. next CLI는 없다(next start 아님).
CMD ["node", "server.js"]

#!/usr/bin/env bash
# =============================================================================
# 복기(bokgi) — 맥미니 배포
#
#   사용법:  scripts/deploy.sh                 배포
#            scripts/deploy.sh --dry-run       실행하지 않고 단계·명령만 보여 준다(읽기 전용 확인만 한다)
#            scripts/deploy.sh --rollback      .last_tag(직전 성공 태그)로 web만 되돌린다(DB는 그대로)
#            scripts/deploy.sh --allow-dirty   커밋 안 된 변경이 있어도 배포한다(태그에 -dirty-시각)
#   환경:    BOKGI_TAG=<태그>                  이미지 태그(기본: git rev-parse --short=12 HEAD)
#            BOKGI_HEALTH_TIMEOUT=180          /api/health 대기 초
#            BOKGI_DEV_ENV=<경로>              이 개발 .env와 같은 비밀값이면 거부(기본 ~/projects/bokgi/web/.env)
#
#   단계:    0 도구 → 1 env 검증 → 2 태그 → 3 build → 4 배포 전 pg_dump -Fc → 5 migrate → 6 up
#            → 7 /api/health 대기. 성공하면 bokgi-web:current = 새 태그, .last_tag = 직전 태그.
#            6·7에서 실패하면 직전 태그로 web을 되돌린다. 1~5에서 실패하면 아무것도 바꾸지 않고 멈춘다.
#
# 비밀값을 출력하지 않는다(env-check는 이름만 말하고, `docker compose config`는 부르지 않는다).
# bash 3.2(맥 기본) 문법만 쓴다 — IfSave scripts/deploy-macmini.sh와 같은 이유(연관배열·mapfile 없음).
# =============================================================================
set -eu
(set -o pipefail 2>/dev/null) && set -o pipefail

# 셸에 남은 compose 설정이 프로젝트·파일을 바꾸지 않게 한다.
unset COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_PROFILES 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WEB_DIR"

ENV_FILE="$WEB_DIR/.env"
COMPOSE_YML="$WEB_DIR/docker-compose.yml"
BACKUP_DIR="$WEB_DIR/backups"
LAST_TAG_FILE="$WEB_DIR/.last_tag"
LOCK_DIR="$BACKUP_DIR/.deploy.lock"
PROJECT="bokgi"
WEB_CONTAINER="bokgi-web"
DB_CONTAINER="bokgi-db"
WEB_PORT=3100
LOCAL_HEALTH_URL="http://127.0.0.1:$WEB_PORT/api/health"
HEALTH_TIMEOUT="${BOKGI_HEALTH_TIMEOUT:-180}"
ROLLBACK_TIMEOUT=120
KEEP_FILES=10
DEV_ENV="${BOKGI_DEV_ENV:-$HOME/projects/bokgi/web/.env}"

DRY_RUN=0
MODE=deploy
ALLOW_DIRTY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --rollback) MODE=rollback ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    -h|--help) sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'deploy: 모르는 인자: %s (--help)\n' "$arg" >&2; exit 2 ;;
  esac
done
case "$HEALTH_TIMEOUT" in ''|*[!0-9]*) HEALTH_TIMEOUT=180 ;; esac

# ── 출력 도우미 ───────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_RED="$(printf '\033[31m')"; C_YEL="$(printf '\033[33m')"; C_GRN="$(printf '\033[32m')"
  C_BLD="$(printf '\033[1m')"; C_DIM="$(printf '\033[2m')"; C_OFF="$(printf '\033[0m')"
else
  C_RED=""; C_YEL=""; C_GRN=""; C_BLD=""; C_DIM=""; C_OFF=""
fi
info() { printf '%s\n' "  $*"; }
step() { printf '\n%s\n' "${C_BLD}== $*${C_OFF}"; }
ok()   { printf '%s\n' "  ${C_GRN}OK${C_OFF}   $*"; }
warn() { printf '%s\n' "  ${C_YEL}WARN${C_OFF} $*"; }
die()  { printf '\n%s\n\n' "${C_RED}FAIL${C_OFF} $*" >&2; exit 1; }

# --dry-run이면 "실제로는 여기서 멈춘다"고 적고 계속 보여 준다. 아니면 멈춘다.
BLOCKERS=0
stop_here() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '%s\n' "  ${C_RED}STOP${C_OFF} $1  ${C_DIM}(실제 배포는 여기서 멈춘다)${C_OFF}"
    BLOCKERS=$((BLOCKERS + 1))
    return 0
  fi
  die "$1"
}

compose() { docker compose -p "$PROJECT" -f "$COMPOSE_YML" "$@"; }

# 실행한다. --dry-run이면 명령만 보여 준다.
run() {
  if [ "$DRY_RUN" = "1" ]; then
    if [ "$1" = "compose" ]; then shift; set -- docker compose -p "$PROJECT" -f "$COMPOSE_YML" "$@"; fi
    printf '%s\n' "  ${C_YEL}[dry-run]${C_OFF} $*"
    return 0
  fi
  "$@"
}

# .env에서 KEY의 값만 꺼낸다(비밀이 아닌 PUBLIC_ORIGIN에만 쓴다. 같은 키는 마지막 값 = compose 규칙).
env_value() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=//p" "$ENV_FILE" | tail -n 1 \
    | sed -e 's/[[:space:]]#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
          -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

# 컨테이너 필드 하나(없으면 빈 값). `docker inspect -f`는 대상이 없으면 빈 줄을 찍고 실패하므로
# `|| echo 기본값`으로 받으면 "\n기본값"이 된다 — 그래서 줄바꿈을 지우고 빈 값으로 받는다.
container_field() { docker inspect -f "$1" "$2" 2>/dev/null | tr -d '\r\n' || true; }

valid_tag() {  # 도커 태그 규칙 + 별칭 current 금지
  case "$1" in ''|.*|-*|current|*[!A-Za-z0-9_.-]*) return 1 ;; esac
  [ "${#1}" -le 128 ]
}

# 지금 bokgi-web 컨테이너가 쓰는 이미지의 태그(없으면 current 별칭의 태그, 그것도 없으면 빈 값).
running_tag() {
  rt_id="$(container_field '{{.Image}}' "$WEB_CONTAINER")"
  [ -n "$rt_id" ] || rt_id="$(docker image inspect -f '{{.Id}}' bokgi-web:current 2>/dev/null || true)"
  [ -n "$rt_id" ] || return 0
  docker images bokgi-web --no-trunc --format '{{.Tag}} {{.ID}}' 2>/dev/null \
    | awk -v id="$rt_id" '$2 == id && $1 != "current" && $1 != "<none>" { print $1; exit }'
}

HEALTH_BODY=""
HEALTH_FAIL=""
wait_health() {  # $1 = 최대 초. 성공하면 HEALTH_BODY, 실패하면 HEALTH_FAIL
  wh_limit="$1"; wh_waited=0
  while [ "$wh_waited" -lt "$wh_limit" ]; do
    wh_body="$(curl -fsS -m 5 "$LOCAL_HEALTH_URL" 2>/dev/null || true)"
    if printf '%s' "$wh_body" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then
      HEALTH_BODY="$wh_body"; return 0
    fi
    wh_state="$(container_field '{{.State.Status}}' "$WEB_CONTAINER")"
    [ -n "$wh_state" ] || wh_state=missing
    wh_restarts="$(container_field '{{.RestartCount}}' "$WEB_CONTAINER")"
    case "$wh_restarts" in ''|*[!0-9]*) wh_restarts=0 ;; esac
    case "$wh_state" in exited|dead|missing) HEALTH_FAIL="web state=$wh_state"; return 1 ;; esac
    if [ "$wh_restarts" -ge 3 ]; then HEALTH_FAIL="web 재시작 반복(restarts=$wh_restarts)"; return 1; fi
    sleep 3
    wh_waited=$((wh_waited + 3))
    if [ $((wh_waited % 30)) -eq 0 ]; then info "... ${wh_waited}s (web state=$wh_state)"; fi
  done
  HEALTH_FAIL="${wh_limit}초 안에 ok=true가 오지 않았다"
  return 1
}

show_web_logs() {
  printf '%s\n' "  ${C_DIM}── docker compose logs --tail $1 web ──${C_OFF}"
  compose logs --no-color --tail "$1" web 2>/dev/null | sed 's/^/    /' || true
}

# 같은 접두사의 파일을 최신 KEEP_FILES개만 남긴다.
rotate() {
  ls -1t "$BACKUP_DIR"/$1 2>/dev/null | sed -n "$((KEEP_FILES + 1)),\$p" | while IFS= read -r old; do
    rm -f -- "$old"
  done
}

LOCK_HELD=0
cleanup() { if [ "$LOCK_HELD" = "1" ]; then rmdir "$LOCK_DIR" 2>/dev/null || true; fi; }
trap cleanup EXIT

take_lock() {
  [ "$DRY_RUN" = "1" ] && return 0
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  # 덤프에는 사용자 기록이 들어 있다 — 이 폴더는 스스로를 git에서 뺀다(web/.gitignore를 몰라도 안전).
  [ -f "$BACKUP_DIR/.gitignore" ] || printf '*\n' > "$BACKUP_DIR/.gitignore"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    die "다른 배포가 진행 중이거나 잔재가 남았다: $LOCK_DIR
  진행 중인 배포가 없다면 지우고 다시 실행한다:  rmdir \"$LOCK_DIR\""
  fi
  LOCK_HELD=1
}

# =============================================================================
# 되돌리기 모드 — .last_tag로 web만 바꾼다
# =============================================================================
if [ "$MODE" = "rollback" ]; then
  printf '%s\n' "${C_BLD}복기 — 되돌리기${C_OFF}  (web: $WEB_DIR)"
  [ -f "$LAST_TAG_FILE" ] || die ".last_tag가 없다 — 한 번 이상 성공한 배포 뒤에 쓴다."
  TARGET="$(tr -d ' \r\n' < "$LAST_TAG_FILE")"
  valid_tag "$TARGET" || die ".last_tag의 태그 형식이 이상하다: $TARGET"
  docker image inspect "bokgi-web:$TARGET" >/dev/null 2>&1 || die "이미지 bokgi-web:$TARGET 가 없다(지워졌다)."
  CURRENT="$(running_tag)"
  info "지금 web: ${CURRENT:-없음}  →  되돌릴 태그: $TARGET"
  info "DB는 되돌리지 않는다(마이그레이션은 추가형). 스키마까지 되돌려야 하면 ops/BACKUP.md의 복원 절차."
  take_lock
  export BOKGI_TAG="$TARGET"
  run compose up -d --no-build web
  if [ "$DRY_RUN" = "1" ]; then
    info "[dry-run] 이어서 $LOCAL_HEALTH_URL 대기 → bokgi-web:current=$TARGET, .last_tag=${CURRENT:-그대로}"
    exit 0
  fi
  wait_health "$ROLLBACK_TIMEOUT" || { show_web_logs 60; die "되돌린 뒤 헬스 실패($HEALTH_FAIL) — 사람이 봐야 한다."; }
  docker tag "bokgi-web:$TARGET" bokgi-web:current
  if [ -n "$CURRENT" ] && [ "$CURRENT" != "$TARGET" ]; then printf '%s\n' "$CURRENT" > "$LAST_TAG_FILE"; fi
  ok "web=$TARGET (헬스 OK). .last_tag=${CURRENT:-그대로} — 한 번 더 --rollback 하면 다시 맞바꾼다."
  exit 0
fi

# =============================================================================
# 배포 모드
# =============================================================================
printf '%s\n' "${C_BLD}복기 — 맥미니 배포${C_OFF}  (web: $WEB_DIR)$( [ "$DRY_RUN" = "1" ] && printf '  %s[dry-run: 바꾸는 명령은 실행하지 않는다]%s' "$C_YEL" "$C_OFF")"

# ── 0. 도구 ───────────────────────────────────────────────────────────────────
step "0/7  도구 확인"
for t in docker git node curl; do
  command -v "$t" >/dev/null 2>&1 || stop_here "$t 가 없다(PATH 확인)."
done
DOCKER_OK=0
if command -v docker >/dev/null 2>&1; then
  if ! docker compose version >/dev/null 2>&1; then
    stop_here "'docker compose'(v2)를 쓸 수 없다."
  elif ! docker info >/dev/null 2>&1; then
    stop_here "docker 데몬이 응답하지 않는다(OrbStack이 떠 있는지 확인)."
  else
    DOCKER_OK=1
    ok "docker $(docker version -f '{{.Server.Version}}' 2>/dev/null || echo '?') · compose $(docker compose version --short 2>/dev/null || echo '?')"
  fi
fi
[ -f "$COMPOSE_YML" ] || stop_here "docker-compose.yml이 없다: $COMPOSE_YML"
take_lock

# ── 1. env 검증 ───────────────────────────────────────────────────────────────
step "1/7  .env 검증 (scripts/env-check.mjs --prod --compose)"
if [ "$DRY_RUN" = "1" ]; then info "${C_DIM}(읽기 전용이라 dry-run에서도 돌린다. 값은 출력하지 않는다)${C_OFF}"; fi
if [ ! -f "$ENV_FILE" ]; then
  stop_here ".env가 없다: $ENV_FILE — 만드는 법은 README '운영'(umask 077 && cp .env.example .env 뒤 운영 값)."
elif ! command -v node >/dev/null 2>&1; then
  stop_here "node가 없어 env 검증을 못 한다."
else
  set -- --prod --compose --env-file "$ENV_FILE"
  if [ -f "$DEV_ENV" ] && [ ! "$DEV_ENV" -ef "$ENV_FILE" ]; then set -- "$@" --dev-env "$DEV_ENV"; fi
  if node "$SCRIPT_DIR/env-check.mjs" "$@" | sed 's/^/  /'; then
    ok "env 검증 통과"
  else
    stop_here "env 검증 실패 — 위 FAIL 줄을 고친다."
  fi
fi

# ── 2. 태그 ───────────────────────────────────────────────────────────────────
step "2/7  태그"
GIT_SHA="$(git -C "$WEB_DIR" rev-parse --short=12 HEAD 2>/dev/null || true)"
if [ -n "${BOKGI_TAG:-}" ]; then TAG="$BOKGI_TAG"; TAG_SRC="환경변수 BOKGI_TAG"; else TAG="$GIT_SHA"; TAG_SRC="git HEAD"; fi
if [ -z "$TAG" ]; then
  stop_here "태그를 정할 수 없다(git 저장소가 아니거나 커밋이 없다) — BOKGI_TAG=<태그>로 준다."
  TAG="unknown"
fi
# 이미지는 web/만 담으므로 web/의 변경만 본다. --no-optional-locks: 다른 git 작업과 index.lock을 다투지 않는다.
DIRTY="$(git -C "$WEB_DIR" --no-optional-locks status --porcelain -- . ':(exclude).last_tag' ':(exclude)backups' 2>/dev/null || true)"
if [ -n "$DIRTY" ]; then
  if [ "$ALLOW_DIRTY" = "1" ]; then
    TAG="${TAG}-dirty-$(date +%Y%m%d%H%M%S)"
    warn "커밋 안 된 변경을 담는다(--allow-dirty) → 태그 $TAG"
  else
    info "커밋 안 된 web/ 변경($(printf '%s\n' "$DIRTY" | wc -l | tr -d ' ')개, 처음 5개):"
    printf '%s\n' "$DIRTY" | head -n 5 | sed 's/^/      /'
    stop_here "작업 트리가 깨끗하지 않다 — 태그(git sha)가 이미지 내용을 뜻하지 않게 된다. 커밋하거나 --allow-dirty."
  fi
fi
valid_tag "$TAG" || stop_here "태그 형식이 도커 규칙에 맞지 않는다(또는 예약어 current): $TAG"
PREV_TAG=""
if [ "$DOCKER_OK" = "1" ]; then PREV_TAG="$(running_tag)"; fi
LAST_TAG="$(cat "$LAST_TAG_FILE" 2>/dev/null | tr -d ' \r\n' || true)"
info "새 태그:        $TAG  ($TAG_SRC)"
info "지금 도는 태그: ${PREV_TAG:-없음(첫 배포)}   — 실패하면 여기로 되돌린다"
info ".last_tag:      ${LAST_TAG:-없음}"
if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" = "$TAG" ]; then
  warn "같은 태그를 다시 배포한다(재빌드·재기동). 실패하면 되돌릴 다른 태그가 없다."
  PREV_TAG=""
fi
export BOKGI_TAG="$TAG"
if [ "$DRY_RUN" = "1" ]; then printf '%s\n' "  ${C_YEL}[dry-run]${C_OFF} export BOKGI_TAG=$TAG"; fi

# ── 3. 빌드 ───────────────────────────────────────────────────────────────────
step "3/7  이미지 빌드 (bokgi-web:$TAG · bokgi-migrate:$TAG)"
info "첫 빌드는 npm 의존성·Prisma 엔진을 받느라 몇 분 걸린다(이후는 캐시)."
run compose --profile migrate build || die "빌드 실패 — 아무것도 바꾸지 않았다."

# ── 4. 배포 전 덤프 ───────────────────────────────────────────────────────────
step "4/7  배포 전 덤프 (pg_dump -Fc → backups/)"
DUMP=""
DB_STATE=""
if [ "$DOCKER_OK" = "1" ]; then DB_STATE="$(container_field '{{.State.Status}}' "$DB_CONTAINER")"; fi
[ -n "$DB_STATE" ] || DB_STATE="missing"
if [ "$DB_STATE" = "missing" ]; then
  info "$DB_CONTAINER 가 아직 없다(첫 배포) — 덤프할 DB가 없다. 다음 단계의 migrate가 빈 DB를 만든다."
else
  if [ "$DB_STATE" != "running" ]; then
    warn "$DB_CONTAINER 상태=$DB_STATE → 덤프를 위해 먼저 올린다."
    run compose up -d --wait db || die "$DB_CONTAINER 를 올리지 못했다 — migrate하지 않는다."
  fi
  DUMP="$BACKUP_DIR/bokgi-predeploy-$(date +%Y%m%d-%H%M%S)-${PREV_TAG:-none}.dump"
  if [ "$DRY_RUN" = "1" ]; then
    printf '%s\n' "  ${C_YEL}[dry-run]${C_OFF} docker exec $DB_CONTAINER pg_dump -U bokgi -Fc bokgi > $DUMP   (600, 최신 ${KEEP_FILES}개 보관)"
    printf '%s\n' "  ${C_YEL}[dry-run]${C_OFF} docker exec -i $DB_CONTAINER pg_restore --list < $DUMP   (읽히는 덤프인지)"
  else
    if ! ( umask 077; docker exec "$DB_CONTAINER" pg_dump -U bokgi -Fc bokgi > "$DUMP" ); then
      rm -f -- "$DUMP"; die "pg_dump 실패 — 백업 없이 migrate하지 않는다."
    fi
    [ -s "$DUMP" ] || { rm -f -- "$DUMP"; die "빈 덤프가 나왔다 — 백업 없이 migrate하지 않는다."; }
    docker exec -i "$DB_CONTAINER" pg_restore --list < "$DUMP" >/dev/null 2>&1 \
      || die "덤프를 pg_restore가 읽지 못한다: $DUMP — migrate하지 않는다."
    ok "$(basename "$DUMP")  ($(wc -c < "$DUMP" | tr -d ' ') bytes, 권한 600)"
    rotate 'bokgi-predeploy-*.dump'
  fi
fi

# ── 5. 마이그레이션 ───────────────────────────────────────────────────────────
step "5/7  마이그레이션 (bokgi-migrate:$TAG → prisma migrate deploy)"
if ! run compose --profile migrate run --rm migrate; then
  die "migrate 실패 — up 하지 않았다(지금 도는 web=${PREV_TAG:-없음}은 그대로다).
  · 원인:  위 prisma 출력. 마이그레이션 한 파일은 한 트랜잭션이라 실패한 파일은 반쯤 적용되지 않는다.
  · 실패 기록이 남아 다음 deploy를 막으면, 고친 뒤:
        docker compose --profile migrate run --rm migrate ./node_modules/.bin/prisma migrate resolve --rolled-back <마이그레이션 이름>
  · 배포 전 덤프: ${DUMP:-없음(첫 배포)}"
fi

# ── 6. 기동 ───────────────────────────────────────────────────────────────────
step "6/7  기동 (docker compose up -d → 127.0.0.1:$WEB_PORT)"
if [ "$DOCKER_OK" = "1" ]; then
  HOLDER="$(docker ps --filter "publish=$WEB_PORT" --format '{{.Names}}' 2>/dev/null | grep -v "^$WEB_CONTAINER\$" || true)"
  if [ -n "$HOLDER" ]; then
    stop_here "127.0.0.1:$WEB_PORT 를 다른 컨테이너가 쓴다: $(printf '%s' "$HOLDER" | tr '\n' ' ')
  IfSave 베타 스택이면 볼륨을 남기고 내린다(ops/TUNNEL.md 순서대로):  cd ~ && docker compose -p ifsave-beta down"
  fi
fi
# 컨테이너가 아닌 호스트 프로세스(예: next start -p 3100)도 본다. OrbStack에서는 같은 포트에 컨테이너를
# 붙여도 오류 없이 호스트 프로세스가 응답을 가로챌 수 있다(2026-10-04 실측). 게시 포트는 OrbStack 이름으로 보인다.
if command -v lsof >/dev/null 2>&1; then
  HOST_HOLDER="$(lsof -nP -iTCP:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null \
    | awk 'NR > 1 && $1 !~ /^(OrbStack|com\.docke|vpnkit|docker-pr)/ { print $1 "(pid " $2 ")" }' | sort -u | tr '\n' ' ' || true)"
  if [ -n "$HOST_HOLDER" ]; then
    stop_here "127.0.0.1:$WEB_PORT 를 컨테이너가 아닌 프로세스가 쓴다: ${HOST_HOLDER}— 그 프로세스를 끈다(lsof -nP -iTCP:$WEB_PORT -sTCP:LISTEN)."
  fi
fi
if [ "$DRY_RUN" != "1" ] && docker inspect "$WEB_CONTAINER" >/dev/null 2>&1; then
  # 재생성하면 json-file 로그가 사라진다 — 교체 직전 끝부분을 남긴다(장애 회고용).
  WEB_LOG="$BACKUP_DIR/web-${PREV_TAG:-unknown}-$(date +%Y%m%d-%H%M%S).log"
  ( umask 077; docker logs --tail 2000 "$WEB_CONTAINER" > "$WEB_LOG" 2>&1 ) || true
  rotate 'web-*.log'
fi
if ! run compose up -d --no-build; then
  UP_FAILED=1
else
  UP_FAILED=0
fi

# ── 되돌리기(6·7 실패 시) ─────────────────────────────────────────────────────
rollback() {
  printf '\n%s\n' "${C_RED}FAIL${C_OFF} $1"
  show_web_logs 60
  if [ -z "$PREV_TAG" ]; then
    die "되돌릴 직전 태그가 없다(첫 배포이거나 같은 태그 재배포). 위 로그를 보고 고친 뒤 다시 배포한다.
  더 보기: docker compose logs --tail=200 web"
  fi
  docker image inspect "bokgi-web:$PREV_TAG" >/dev/null 2>&1 || die "직전 이미지 bokgi-web:$PREV_TAG 가 없다 — 손으로 복구해야 한다."
  step "되돌리기 → bokgi-web:$PREV_TAG"
  export BOKGI_TAG="$PREV_TAG"
  compose up -d --no-build web || die "되돌리기 up 실패 — 손으로 복구해야 한다."
  if wait_health "$ROLLBACK_TIMEOUT"; then
    docker tag "bokgi-web:$PREV_TAG" bokgi-web:current
    die "배포 실패 → 직전 태그 $PREV_TAG 로 되돌렸다(헬스 OK). 실패한 이미지 bokgi-web:$TAG 는 남겨 두었다.
  DB는 되돌리지 않았다(마이그레이션은 추가형이라 옛 코드가 그대로 돈다). 스키마까지 되돌려야 하면
  배포 전 덤프 ${DUMP:-없음}로 ops/BACKUP.md의 복원 절차를 따른다."
  fi
  die "되돌린 뒤에도 헬스 실패($HEALTH_FAIL) — 사람이 봐야 한다:  docker compose logs --tail=200 web"
}

[ "$UP_FAILED" = "0" ] || rollback "docker compose up 실패"

# ── 7. 헬스 대기 ──────────────────────────────────────────────────────────────
step "7/7  헬스 대기 ($LOCAL_HEALTH_URL, ok=true, 최대 ${HEALTH_TIMEOUT}s)"
if [ "$DRY_RUN" = "1" ]; then
  printf '%s\n' "  ${C_YEL}[dry-run]${C_OFF} curl -fsS $LOCAL_HEALTH_URL  → \"ok\":true 가 올 때까지(최대 ${HEALTH_TIMEOUT}s)"
  info "성공하면: docker tag bokgi-web:$TAG bokgi-web:current · .last_tag ← ${PREV_TAG:-(직전 태그 없음 — 그대로)}"
  if [ -n "$PREV_TAG" ]; then
    info "실패하면: BOKGI_TAG=$PREV_TAG docker compose up -d --no-build web 로 되돌린 뒤 헬스 재확인"
  else
    info "실패하면: 되돌릴 태그가 없다 — web 로그를 보여 주고 멈춘다"
  fi
  printf '\n%s\n\n' "${C_BLD}dry-run 끝${C_OFF} — 실제로 돌리면 멈출 곳: ${BLOCKERS}개"
  exit 0
fi
wait_health "$HEALTH_TIMEOUT" || rollback "헬스 실패: $HEALTH_FAIL"
ok "/api/health ok=true"
VERSION_SEEN="$(printf '%s' "$HEALTH_BODY" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
if [ "$VERSION_SEEN" = "$TAG" ]; then
  ok "version=$VERSION_SEEN — 방금 올린 컨테이너가 응답한다"
else
  warn "health version=${VERSION_SEEN:-없음} ≠ $TAG (이미지의 APP_VERSION을 앱이 돌려주는지 확인)"
fi

# 성공 기록: current 별칭 = 마지막 성공, .last_tag = 그 직전(--rollback 대상)
docker tag "bokgi-web:$TAG" bokgi-web:current
docker tag "bokgi-migrate:$TAG" bokgi-migrate:current 2>/dev/null || true
if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$TAG" ]; then printf '%s\n' "$PREV_TAG" > "$LAST_TAG_FILE"; fi

# 공개 주소(터널) — 실패해도 배포는 성공이다(터널·DNS는 ops/TUNNEL.md).
PUBLIC_ORIGIN="$(env_value PUBLIC_ORIGIN)"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN%/}"
if [ -n "$PUBLIC_ORIGIN" ]; then
  PUB_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$PUBLIC_ORIGIN/api/health" 2>/dev/null || true)"
  if [ "$PUB_CODE" = "200" ]; then ok "$PUBLIC_ORIGIN/api/health → 200"
  else warn "$PUBLIC_ORIGIN/api/health → ${PUB_CODE:-000}. 터널 인그레스·DNS를 확인한다(ops/TUNNEL.md)."
  fi
fi

compose ps
printf '\n%s\n' "${C_GRN}완료${C_OFF} — web=$TAG (직전 ${PREV_TAG:-없음}) · $((SECONDS / 60))분 $((SECONDS % 60))초"
info "로그:      docker compose logs -f web"
info "되돌리기:  scripts/deploy.sh --rollback   (.last_tag=$(cat "$LAST_TAG_FILE" 2>/dev/null || echo 없음))"
info "덤프:      ${DUMP:-없음(첫 배포)}"

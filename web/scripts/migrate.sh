#!/bin/sh
# 복기 migrate 타깃의 진입점 — `prisma migrate deploy` 하나만 돈다.
#   docker compose --profile migrate run --rm migrate      (scripts/deploy.sh가 부른다)
#
# migrate deploy는 저장소의 prisma/migrations 중 아직 적용 안 된 것만 순서대로 적용한다. 스키마를 DB에
# '맞추려고' 무엇을 지우는 일은 없다. 그래서 운영에서는 이것만 쓴다 — migrate dev·db push·migrate reset은
# 운영 DB에서 테이블을 지우거나 다시 만들 수 있으므로 이 이미지로도 부르지 않는다.
# 마이그레이션은 추가형만(열·테이블 추가, 삭제·이름 변경 금지) — 그래야 deploy.sh가 직전 태그로 되돌려도
# 옛 코드가 새 스키마 위에서 돈다.
set -eu
cd "$(dirname "$0")/.."

if [ ! -d prisma ] && ! ls prisma.config.* prisma7.config.* >/dev/null 2>&1; then
  echo "migrate: 이미지에 prisma/와 prisma.config.*가 없다 — 스키마·마이그레이션이 들어간 소스로 다시 빌드한다." >&2
  exit 3
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "migrate: DATABASE_URL이 비어 있다 — docker-compose.yml이 POSTGRES_PASSWORD로 만든다(.env 확인)." >&2
  exit 3
fi

count="$(ls -d prisma/migrations/*/ 2>/dev/null | wc -l | tr -d ' ')"
echo "migrate: 이미지 안의 마이그레이션 ${count}개 기준으로 prisma migrate deploy"
exec ./node_modules/.bin/prisma migrate deploy

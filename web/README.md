This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 운영

맥미니(IfSave와 같은 기기)에서 compose 프로젝트 `bokgi`로 돈다. `bokgi-web`(Next standalone, `127.0.0.1:3100` → 터널 `https://bokgi.ifsave.com`)과 `bokgi-db`(Postgres 16, 포트 게시 없음, 볼륨 `bokgi_pgdata`)로 이루어진다. 1회용 `migrate`(Prisma CLI, `prisma migrate deploy`만)가 붙는다. 배포는 `scripts/deploy.sh` 하나로 한다.

| 문서 | 내용 |
|---|---|
| [ops/TUNNEL.md](ops/TUNNEL.md) | 베타 스택을 내리고 3100을 넘겨받는 순서, 인그레스·DNS, 무중단 반영, 되돌리기 |
| [ops/BACKUP.md](ops/BACKUP.md) | 배포 전 덤프, IfSave `pg-backup.sh`에 bokgi-db를 넣는 패치(`ops/pg-backup-bokgi.patch`), 복원 리허설 |
| [ops/MONITORING.md](ops/MONITORING.md) | UptimeRobot 설정, IfSave 워치독이 복기에 해 주지 않는 것, 알림 대응 |

### 처음 한 번

개발 체크아웃(`~/projects/bokgi`, `.env` = 개발 DB `bokgi-dev-db`)과 운영 체크아웃을 나눈다. compose의 `.env`는 운영 값이어야 하고, 이미지 태그(git sha)는 커밋된 내용을 가리켜야 하기 때문이다.

```bash
git -C ~/projects/bokgi worktree add --detach ~/bokgi-prod main     # 운영 체크아웃(한 번)
cd ~/bokgi-prod/web
umask 077 && cat > .env <<'EOF'
POSTGRES_PASSWORD=
SESSION_SECRET=
PUBLIC_ORIGIN=https://bokgi.ifsave.com
APP_TZ=Asia/Seoul
AI_ENABLED=false
AI_DAILY_CALL_CAP=300
EOF
```

- `POSTGRES_PASSWORD`에는 `openssl rand -hex 24`의 출력을 넣는다(hex만 쓴다: compose가 이 값으로 `DATABASE_URL=postgresql://bokgi:…@db:5432/bokgi`를 만든다). 한 번 띄운 뒤에는 바꾸지 않는다. 바꾸면 이미 만들어진 볼륨의 비밀번호와 어긋난다.
- `SESSION_SECRET`에는 `openssl rand -base64 32`의 출력을 넣는다. 개발 `.env`의 값을 쓰면 검사에서 실패한다.
- `DATABASE_URL`은 적지 않는다(compose가 만든다). AI를 켤 때만 `AI_API_KEY`·`AI_BASE_URL`·`AI_MODEL`을 채운다. `AI_FALLBACK_*` 세 개는 모두 채우거나 모두 비운다.
- 두 비밀값은 비밀번호 관리자에도 복사해 둔다. 값은 화면 공유 중에 만들지 않고, `cat .env`로 열지 않는다.

```bash
node scripts/env-check.mjs --prod --compose    # 값은 출력하지 않는다. 키 이름과 판정만
scripts/deploy.sh --dry-run                    # 단계·명령과 "실제로 돌리면 멈출 곳"을 보여 준다
```

첫 배포는 IfSave 베타 스택을 내리는 순서와 묶여 있다. [ops/TUNNEL.md](ops/TUNNEL.md)의 0절 표대로 한다.

### 배포

```bash
cd ~/bokgi-prod && git fetch origin && git checkout --detach origin/main     # 올릴 커밋으로
web/scripts/deploy.sh
```

`deploy.sh`는 차례대로 다음을 한다. env 검증 → `docker compose --profile migrate build`(태그 = git sha 12자리, `BOKGI_TAG`로 바꿀 수 있다) → `bokgi-db`가 있으면 `pg_dump -Fc`를 `backups/`에 남김(최신 10개) → `migrate` → `up -d` → `http://127.0.0.1:3100/api/health`가 `"ok":true`를 줄 때까지 대기(180초). 그다음 공개 주소도 확인한다. 성공하면 `bokgi-web:current`가 새 태그를, `.last_tag`가 직전 태그를 가리킨다. `up`이나 헬스에서 실패하면 web을 직전 태그로 되돌리고 실패로 끝난다. 그 앞 단계에서 실패하면 아무것도 바꾸지 않는다. 작업 트리가 깨끗하지 않으면 멈춘다(`--allow-dirty`로 넘길 수 있다).

### 되돌리기

```bash
web/scripts/deploy.sh --rollback     # .last_tag로 web만 바꾼다. 한 번 더 하면 다시 맞바꾼다
```

DB는 되돌리지 않는다. 마이그레이션은 추가형만 쓰기 때문에 옛 코드가 새 스키마 위에서 그대로 돈다. 스키마까지 되돌려야 하면 [ops/BACKUP.md](ops/BACKUP.md) 4절의 복원 절차를 따른다.

### 자주 쓰는 명령 (`~/bokgi-prod/web`에서)

```bash
docker compose ps                                   # 상태(healthy 확인)
docker compose logs -f web                          # 로그
docker exec -it bokgi-db psql -U bokgi bokgi        # DB 셸(포트를 게시하지 않으므로 이 방법뿐)
docker compose up -d --force-recreate web           # .env를 고친 뒤(restart로는 .env가 다시 읽히지 않는다)

# DB에 닿는 일회성 작업은 migrate 이미지로 compose 네트워크 안에서 한다(태그 생략 = current).
# 시드: 카드·개념은 저장소 루트 content/(빌드 컨텍스트 밖)라 읽기 전용으로 붙인다. --dry-run 먼저.
docker compose --profile migrate run --rm -v "$(cd .. && pwd)/content:/content:ro" -e CONTENT_DIR=/content migrate npm run seed -- --dry-run
docker compose --profile migrate run --rm -v "$(cd .. && pwd)/content:/content:ro" -e CONTENT_DIR=/content migrate npm run seed
# 초대 코드: 원문은 이때 한 번만 화면에 나온다(DB에는 해시만). 로그·채팅에 붙이지 않고 받을 사람에게만 전한다.
docker compose --profile migrate run --rm migrate npm run invite -- create --count 5 --label 베타1
docker compose --profile migrate run --rm migrate npm run invite -- list
```

### 치지 않는 명령

| 명령 | 일어나는 일 |
|---|---|
| `docker compose down -v` | 볼륨 `bokgi_pgdata`가 지워진다. 모든 기록이 사라진다 |
| `docker compose config`(화면 공유·로그에) | `.env` 값이 평문으로 펼쳐진다. 문법 검사는 `docker compose config -q`로 한다 |
| 손으로 `docker compose build`나 `up -d --build` | `current` 태그가 검사 없이 지금 작업 트리로 바뀐다. 배포는 `deploy.sh`로만 한다 |
| 운영 DB에 `prisma migrate dev`·`db push`·`migrate reset` | 테이블을 지우거나 다시 만들 수 있다 |

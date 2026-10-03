# 터널·DNS: bokgi.ifsave.com → 127.0.0.1:3100

_운영자(맥미니 주인)가 직접 하는 절차. 2026-10-04에 `~/.cloudflared/config.yml`, `~/ifsave-ops/tunnel.sh`, `docker compose ls`, IfSave `OPERATOR_COMMANDS §14-B`(ops/beta-stack 브랜치)를 읽고 썼다. 이 문서를 쓰면서 터널 설정·DNS·IfSave 컨테이너는 하나도 건드리지 않았다._

## 0. 한눈에

| 순서 | 할 일 | 끊기는 것 |
|---|---|---|
| 1 | 운영 체크아웃·`.env` 준비, `scripts/deploy.sh --dry-run` | 없음 |
| 2 | (선택) 베타 DB 보관 덤프 | 없음 |
| 3 | DNS 라우트 추가(`cloudflared tunnel route dns ifsave bokgi.ifsave.com`) | 없음. 인그레스 전이라 404 |
| 4 | `scripts/deploy.sh` 1차: 빌드·migrate까지 하고 3100 점검에서 멈춘다(정상) | 없음 |
| 5 | 베타 스택 내리기(`docker compose -p ifsave-beta down`, 볼륨 유지) | beta.ifsave.com |
| 6 | `scripts/deploy.sh` 2차: 3100에 복기가 뜬다(빌드는 캐시). 이어서 시드(`--dry-run` 먼저)와 초대 코드 발급(README "운영"의 자주 쓰는 명령) | 없음 |
| 7 | 인그레스에서 beta 줄을 bokgi 줄로 바꾸고 무중단 반영 | 없음. ifsave.com·demo는 그대로 |
| 8 | 네 주소 확인, UptimeRobot(MONITORING.md), 백업 패치(BACKUP.md) | 없음 |

5와 6 사이에는 beta.ifsave.com이 502, 6과 7 사이에는 같은 주소가 잠깐 복기 화면을 보여 준다. 두 구간 모두 몇 분이고, 그동안 쓰기 요청은 `PUBLIC_ORIGIN` 검사로 막힌다. 결정 D3("beta 서브도메인은 거의 쓰지 않아 그 자리를 물려받는다")에 따라 받아들인다.

## 1. 지금 구성 (2026-10-04 확인)

- 터널은 named tunnel **`ifsave`** 하나다(ID·자격 증명 파일 이름은 여기 적지 않는다). 설정은 `~/.cloudflared/config.yml`이고, 계정 인증서 `~/.cloudflared/cert.pem`이 있어 이 계정에서 `route dns`를 칠 수 있다.
- 실제로 트래픽을 받는 커넥터는 **LaunchAgent `com.ifsave.tunnel`** 이다. 이것이 `~/ifsave-ops/tunnel.sh` → `cloudflared --config ~/.cloudflared/config.yml --no-autoupdate tunnel run`을 돌리고, 로그는 `~/ifsave-ops/tunnel.log`에 남는다. `ps`에 root의 `/opt/homebrew/bin/cloudflared`(LaunchDaemon `com.cloudflare.cloudflared`, 인자 없음, 로그 0바이트)도 보이지만, 이 절차는 그것을 다루지 않는다.
- 인그레스:

  | 호스트 | 오리진 |
  |---|---|
  | `ifsave.com`, `www.ifsave.com` | `http://localhost:3000`(IfSave 운영) |
  | `beta.ifsave.com` | `http://localhost:3100`(IfSave 베타, compose 프로젝트 `ifsave-beta`) |
  | `demo.ifsave.com` | `http://localhost:3120`(IfSave 데모) |
  | 그 밖 | `http_status:404`(맨 끝 필수 규칙) |

- 실행 중인 cloudflared는 설정 파일을 **다시 읽지 않는다.** IfSave가 2026-09-17에 실측했다(편집 뒤에도 새 호스트는 404). 그래서 7단계에서 커넥터를 무중단으로 갈아 끼운다.
- 베타 스택: 컨테이너 `ifsave-beta-frontend`(127.0.0.1:3100), `ifsave-beta-backend`, `ifsave-beta-postgres`(127.0.0.1:5433), 볼륨 `ifsave-beta_*`. 복기 db는 포트를 게시하지 않으므로 5433은 비워 둔다.

## 2. (선택) 베타 DB 보관 덤프

베타는 IfSave 백업·워치독 대상이 아니다(OPERATOR_COMMANDS §14-B). `down`은 볼륨을 지우지 않지만, 테스트 응답을 오래 남기려면 내리기 전에 한 벌 뜬다. 이름이 `keep-`으로 시작하면 IfSave의 회전과 게이트가 건드리지 않는다.

```bash
docker exec ifsave-beta-postgres pg_dump -U ifsave -Fc ifsave > ~/ifsave-backups/keep-beta-final-$(date +%F).dump
chmod 600 ~/ifsave-backups/keep-beta-final-$(date +%F).dump && ls -l ~/ifsave-backups/keep-beta-final-*
```

## 3. DNS 라우트

언제 해도 안전하다. 인그레스에 호스트가 없는 동안에는 맨 끝 규칙이 404를 돌려준다.

```bash
cloudflared tunnel route dns ifsave bokgi.ifsave.com
#   bokgi.ifsave.com → <터널 ID>.cfargotunnel.com 프록시 CNAME이 생긴다(출력에 ID가 보이면 공유하지 않는다)
dig +short bokgi.ifsave.com        # Cloudflare 주소가 나오면 된다(프록시라 CNAME이 아니라 A로 보인다)
```

## 4·5·6. 스택 교체

운영 체크아웃과 `.env` 만들기는 README "운영"에 있다.

```bash
cd ~/bokgi-prod/web
scripts/deploy.sh --dry-run          # 멈출 곳 확인. 3100 STOP 하나만 남아야 한다
scripts/deploy.sh                    # 1차: 빌드 → (덤프 없음) → migrate → "3100을 ifsave-beta-frontend가 쓴다"에서 멈춘다

# 5) 베타를 내린다 — 볼륨은 남는다(-v를 붙이지 않는다)
#    compose 파일이 없는 디렉터리에서 프로젝트 이름만으로 내린다(2026-10-04 `ps`로 이 방식이 통함을 확인)
cd ~ && docker compose -p ifsave-beta ps && docker compose -p ifsave-beta down
docker ps --filter publish=3100      # 비어 있어야 한다

# 6) 2차: 이미지는 캐시, migrate는 "No pending migrations", 3100에 bokgi-web
cd ~/bokgi-prod/web && scripts/deploy.sh
curl -s http://127.0.0.1:3100/api/health    # {"ok":true,"db":true,"version":"<git sha>"}
```

`deploy.sh`는 IfSave 컨테이너를 스스로 내리지 않는다. 3100을 다른 컨테이너가 쥐고 있으면 이름과 위의 내리기 명령을 보여 주고 멈춘다.

## 7. 인그레스 바꾸기 (무중단)

### 7-1. 편집

```bash
cp -p ~/.cloudflared/config.yml ~/.cloudflared/config.yml.bak-$(date +%F)
```

`beta.ifsave.com` 블록을 아래 블록으로 바꾼다. 다른 줄과 순서는 그대로 두고, 맨 끝 `- service: http_status:404`도 남긴다.

```diff
-  # 베타(테스트 공개) 스택 — scripts/deploy-beta.sh 가 띄우는 두 번째 프론트(127.0.0.1:3100). 운영과 DB·계정이 다르다.
-  - hostname: beta.ifsave.com
-    service: http://localhost:3100
+  # 복기(bokgi) — compose 프로젝트 bokgi의 web(127.0.0.1:3100). beta 슬롯을 물려받았다(beta.ifsave.com은 404).
+  - hostname: bokgi.ifsave.com
+    service: http://127.0.0.1:3100
```

오리진은 `localhost`가 아니라 `127.0.0.1`로 쓴다. 컨테이너 포트가 IPv4 루프백에만 묶여 있어서, `localhost`가 `::1`로 먼저 풀리는 경우를 피한다.

### 7-2. 검증 (반영 전)

```bash
cloudflared --config ~/.cloudflared/config.yml tunnel ingress validate
cloudflared --config ~/.cloudflared/config.yml tunnel ingress rule https://bokgi.ifsave.com/api/health   # bokgi 규칙이 잡혀야 한다
cloudflared --config ~/.cloudflared/config.yml tunnel ingress rule https://beta.ifsave.com/              # 맨 끝 404 규칙
cloudflared --config ~/.cloudflared/config.yml tunnel ingress rule https://ifsave.com/login               # 그대로 3000
```

### 7-3. 반영: 임시 커넥터 → 에이전트 재기동 → 임시 종료

IfSave가 2026-09-17에 무중단으로 쓴 순서다. 같은 터널에 커넥터가 둘 붙어 있는 동안에는 엣지가 둘로 나눠 보내므로 끊기지 않는다.

```bash
# ① 새 설정으로 임시 커넥터를 하나 더 띄운다
cloudflared --config ~/.cloudflared/config.yml --no-autoupdate tunnel run > /tmp/cf-temp.log 2>&1 &
TEMP_PID=$!
sleep 10; grep -c "Registered tunnel connection" /tmp/cf-temp.log     # 1 이상이면 붙었다

# ② 에이전트를 곱게 내리고 다시 올린다(tunnel.sh는 IfSave 3000이 응답하면 바로 붙는다)
AGENT_PID="$(launchctl list | awk '$3=="com.ifsave.tunnel"{print $1}')"; echo "agent pid=$AGENT_PID"
kill -TERM "$AGENT_PID"
sleep 5; launchctl kickstart gui/$(id -u)/com.ifsave.tunnel
sleep 15; tail -3 ~/ifsave-ops/tunnel.log                               # Registered tunnel connection

# ③ 두 주소가 200이면 임시 커넥터를 내린다
curl -s -o /dev/null -w "bokgi %{http_code}\n" https://bokgi.ifsave.com/api/health
curl -s -o /dev/null -w "ifsave %{http_code}\n" https://ifsave.com/login
kill -TERM "$TEMP_PID"
```

## 8. 확인

```bash
curl -s -o /dev/null -w "bokgi  %{http_code}\n" https://bokgi.ifsave.com/api/health   # 200
curl -s -o /dev/null -w "ifsave %{http_code}\n" https://ifsave.com/login              # 200
curl -s -o /dev/null -w "demo   %{http_code}\n" https://demo.ifsave.com/              # 200
curl -s -o /dev/null -w "beta   %{http_code}\n" https://beta.ifsave.com/              # 404
curl -sI https://bokgi.ifsave.com/api/health | grep -i -E "^HTTP|cache-control"      # private, no-store
```

브라우저에서는 초대 코드 → 닉네임 → 새로고침 뒤에도 로그인이 유지되는지 본다. 쿠키 `__Host-bokgi_sid`는 https에서만 선다. `http://127.0.0.1:3100`으로 직접 열면 로그인이 유지되지 않는 것이 정상이다.

`beta.ifsave.com`의 DNS CNAME은 남겨 둬도 404만 돌려준다. 지우려면 Cloudflare 대시보드의 DNS 화면에서 지운다(`cloudflared`에는 DNS 삭제 명령이 없다).

## 9. 되돌리기 (베타로 돌아가기)

복기를 내리고 베타를 원래 파일로 다시 올린다. 파일 경로는 `docker compose ls`에 나온 것이고, `~/ifsave-beta/docker-compose.beta.yml`이 ops/beta-stack 브랜치의 판과 같음을 2026-10-04에 확인했다.

```bash
cd ~/bokgi-prod/web && docker compose down            # 복기 내리기(볼륨 bokgi_pgdata 유지)
IFSAVE_BETA_DIR="$HOME/ifsave-beta" docker compose -p ifsave-beta --env-file ~/ifsave-beta/.env \
  -f ~/ifsave-beta/src/docker-compose.yml -f ~/ifsave-beta/docker-compose.beta.yml up -d
cp -p ~/.cloudflared/config.yml.bak-<날짜> ~/.cloudflared/config.yml   # 그리고 7-3을 다시 한다
```

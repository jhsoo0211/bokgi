# 복기 감시

_운영자용. 2026-10-04에 `~/ifsave-ops/watchdog.sh`(com.ifsave.watchdog, 5분), IfSave 런북 5-5(UptimeRobot·Healthchecks), `scripts/ops-dashboard.py`를 읽고 썼다. 원칙(구현계획 05 §2): 감시는 UptimeRobot과 `restart`가 맡고, IfSave 워치독은 고치지 않는다._

## 1. UptimeRobot 모니터 (외부 감시, 1개 추가)

IfSave 모니터를 만든 같은 계정에서 **Add New Monitor**를 누른다.

| 항목 | 값 |
|---|---|
| Monitor Type | **Keyword**(무료 플랜에 있다). 없으면 HTTP(s) |
| Friendly Name | `복기 bokgi /api/health` |
| URL | `https://bokgi.ifsave.com/api/health` |
| Keyword | `"ok":true` (Alert when: **Keyword not exists**, 대소문자 구분) |
| Monitoring Interval | 5 minutes |
| Request Timeout | 30 seconds |
| HTTP Method | GET(인증·헤더 없음) |
| Alert Contacts | IfSave 모니터와 같은 이메일 |
| (HTTP(s)로 만들 때) | 성공 상태 200. `/api/health`는 DB가 죽으면 503이라 상태 코드만으로도 잡힌다 |

왜 이 주소인가:

- `/api/health`는 **DB만** 확인한다(`SELECT 1`). AI 공급자 장애로는 알림이 오지 않는다(의도). 응답은 `{"ok":true,"db":true,"version":"<git sha>"}`이고 `Cache-Control: private, no-store`라서 Cloudflare가 캐시하지 않는다.
- 이 모니터 하나로 맥미니 꺼짐, OrbStack 미기동, 터널·DNS 장애, 컨테이너 죽음, DB 장애가 모두 같은 증상(타임아웃·502·503)으로 잡힌다.

만든 뒤 확인(장애를 일부러 1회 낸다. 한밤에는 하지 않는다):

```bash
cd ~/bokgi-prod/web
docker compose stop db          # 1~2분 안에 /api/health 503 → 다음 5분 주기에 알림
curl -s -w ' [%{http_code}]\n' https://bokgi.ifsave.com/api/health
docker compose start db         # 복구 알림 확인
```

재부팅 직후에 오는 알림은 정상이다. 로그인하고 OrbStack이 올라와 컨테이너가 돌아오기까지(IfSave 실측 약 2분) 바깥에서는 응답이 없다. 재부팅 시각을 적어 두고 대조한다(런북 5-5와 같다).

## 2. IfSave 워치독이 복기에 해 주지 않는 것

`~/ifsave-ops/watchdog.sh`는 `homeserver.sh install`이 생성하는 파일이고, 직접 고치지 않는다.

| 워치독이 하는 일 | 복기에는 |
|---|---|
| 5분마다 `https://ifsave.com/login` **하나만** 확인 | 복기가 죽어도 모른다 |
| 무응답이면 `homeserver.sh up`으로 **IfSave 스택만** 되살림 | 복기 컨테이너는 되살리지 않는다(확인 URL에 복기를 넣어도 마찬가지 — 그래서 고치지 않는다) |
| 외부 dead-man 핑(Healthchecks `uptime-ping-url`) | 맥미니 자체가 꺼지면 IfSave 쪽 알림이 온다. 복기만 죽은 경우에는 오지 않는다 |
| `homeserver.sh status`·`ops-dashboard.py` 계기판 | `ifsave` 이름의 컨테이너만 보여 준다. 복기는 계기판에 없다 |

그 빈칸을 메우는 것:

1. **`restart: unless-stopped`**(web·db). 프로세스가 죽거나 OOM으로 꺼지면 Docker가 다시 세운다. 재부팅하면 자동 로그인 → OrbStack → 컨테이너 순으로 돌아온다. 다음 계획된 재부팅 뒤에 `docker ps --filter name=bokgi`로 한 번 확인한다.
2. **이미지 HEALTHCHECK**(`/api/health`의 `ok===true`, 15초 간격). `docker ps`에 `healthy`/`unhealthy`로 보인다. Docker는 unhealthy 컨테이너를 **재시작하지 않는다.** DB가 죽어 web이 unhealthy인 상태는 사람이 볼 때까지 이어진다. 그래서 UptimeRobot 알림이 신호다.
3. **UptimeRobot**(위 1절): 바깥에서 본 생존.
4. **백업 하트비트**: `pg-backup.sh` v2.2 패치를 적용하고 `BOKGI_REQUIRED=1`로 두면, 복기 덤프가 실패할 때 IfSave와 같은 Healthchecks 체크가 실패로 바뀐다(BACKUP.md 2절).

## 3. 알림이 왔을 때 (바깥에서 안으로)

```bash
curl -s -m 10 -w ' [%{http_code}]\n' https://bokgi.ifsave.com/api/health   # 1겹: 공개 주소
curl -s -m 5  -w ' [%{http_code}]\n' http://127.0.0.1:3100/api/health      # 2겹: 터널을 건너뛰고 직접
docker ps --filter name=bokgi --format '{{.Names}}  {{.Status}}'            # 3겹: 컨테이너
docker info >/dev/null 2>&1 && echo "OrbStack OK" || echo "OrbStack 꺼짐"   # 4겹: 런타임
```

| 증상 | 볼 곳 · 할 일 |
|---|---|
| 1겹만 실패, 2겹 200 | 터널. `tail -30 ~/ifsave-ops/tunnel.log`. ifsave.com도 죽었다면 IfSave 쪽 절차(OPERATOR_COMMANDS §3-A). 복기만 404라면 인그레스에서 bokgi 줄이 빠졌다(TUNNEL.md 7) |
| 2겹 503 `{"ok":false,"db":false}` | DB. `docker compose logs --tail=100 db`, `docker compose up -d db` |
| 2겹 연결 거부, web `Restarting`/`Exited` | `docker compose logs --tail=200 web`. 직전 배포 뒤라면 `scripts/deploy.sh --rollback` |
| 컨테이너가 아예 없음 | `docker compose up -d`(태그는 `current` = 마지막 성공 배포) |
| OrbStack 꺼짐 | IfSave와 같이 죽은 상황이다. IfSave 워치독·런북 절차가 OrbStack을 살리면 복기도 `restart`로 같이 돌아온다 |

로그: web·db 모두 json-file 10MB×3이다. 컨테이너를 다시 만들면 이전 로그가 사라지므로, `deploy.sh`가 교체 직전 web 로그 끝부분 2000줄을 `backups/web-<태그>-<시각>.log`(600)에 남긴다. 앱은 프롬프트 원문·초대 코드·닉네임을 로그에 쓰지 않는다(구현계획 05 §2).

## 4. 가끔 보는 것

```bash
docker stats --no-stream bokgi-web bokgi-db                 # 상한 512m씩. 2026-10-04 시험 이미지 web 약 70MiB
df -h / | awk 'NR==2{print $4" 남음"}'                        # 이미지는 배포마다 web 레이어(수십 MB)만큼 는다
docker images 'bokgi-*' --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}  {{.Size}}'
docker image rm bokgi-web:<오래된 sha> bokgi-migrate:<오래된 sha>   # current·.last_tag·지금 태그는 남긴다
```

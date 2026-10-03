# 복기 백업·복원

_운영자용. 대상은 맥미니의 compose 프로젝트 `bokgi`(컨테이너 `bokgi-db`, 볼륨 `bokgi_pgdata`)다. 2026-10-04에 IfSave 설치본 `~/ifsave-ops/pg-backup.sh`(v2.1, 2026-09-06)와 `com.ifsave.pgbackup`(매일 03:00)을 읽고 맞췄다. 아래 명령은 운영 체크아웃 `~/bokgi-prod/web`을 기준으로 쓴다(README "운영")._

## 1. 무엇을 어디에 남기나

| 겹 | 언제 | 무엇 | 어디 | 보관 |
|---|---|---|---|---|
| 배포 전 덤프 | `scripts/deploy.sh` 4단계, 배포할 때마다 | `pg_dump -Fc` 전체 | `web/backups/bokgi-predeploy-<시각>-<직전 태그>.dump`(파일 600, 폴더 700, 폴더가 스스로 git에서 빠진다) | 최신 10개, 이 디스크에만, 평문 |
| 매일 백업 | 03:00 `com.ifsave.pgbackup`(아래 패치를 적용한 뒤) | 같은 형식의 덤프를 IfSave 번들에 함께 넣어 AES-256으로 잠그고, rclone으로 오프사이트에 올리고, 하트비트를 보낸다 | `~/ifsave-backups/bokgi-backup-<날짜>.dump`(평문 600, 즉시 복원용)와 `bundle-<날짜>.tar.enc` 안 | 로컬 7일, 오프사이트 14일 |

백업하지 않는 것:

- **이미지.** git sha로 다시 만든다. 다만 직전 태그 이미지는 지우지 않는다(`--rollback`의 대상).
- **`.env`.** `POSTGRES_PASSWORD`와 `SESSION_SECRET`은 비밀번호 관리자에 손으로 복사해 둔다. `POSTGRES_PASSWORD`를 잃으면 컨테이너 안(로컬 소켓은 비밀번호 없이 붙는다)에서 `docker exec bokgi-db psql -U bokgi -d bokgi -c "ALTER USER bokgi PASSWORD '<새 값>'"`로 바꾸고 `.env`를 같은 값으로 고친 뒤 `docker compose up -d --force-recreate web`.
- **카드·개념 JSON.** 저장소에 있다.

덤프에는 닉네임과 판단 기록이 들어 있다. 평문 덤프는 이 기기 밖으로 옮기지 않는다. 오프사이트에는 IfSave 번들의 암호화로만 나간다.

## 2. 매일 백업에 bokgi-db 넣기: `pg-backup.sh` 패치안 (v2.1 → v2.2)

`~/ifsave-ops/pg-backup.sh`는 사람이 설치한 파일이다. `homeserver.sh install`이 만드는 `watchdog.sh`·`tunnel.sh`와 달리, 고쳐도 다시 덮이지 않는다. 패치는 네 군데를 바꾼다.

1. **설정.** `BOKGI_CONTAINER=bokgi-db`, `BOKGI_REQUIRED=0`, `BOKGI_DUMP=~/ifsave-backups/bokgi-backup-<날짜>.dump`.
2. **1b 단계.** `bokgi-db`가 떠 있으면 `pg_dump -U bokgi -Fc bokgi`를 뜬다. 빈 덤프면 실패로 처리한다. 컨테이너가 없으면 `BOKGI_REQUIRED=0`일 때는 건너뛰고(`bokgi=없음`), `1`일 때는 백업 전체를 실패시킨다(상태 FAIL, `/fail` 핑).
3. **번들과 회전.** 덤프를 같은 tar에 넣어 같은 열쇠로 잠근다. `bokgi-backup-*.dump`를 7일 회전에 넣는다. 0바이트 잔재 정리 목록에도 넣는다.
4. **로그 한 줄.** `… · bokgi=<크기>bytes · offsite=OK · heartbeat=OK`. `homeserver.sh`와 `ops-dashboard.py`가 찾는 형태(`OK: … bundle-….tar.enc … heartbeat=OK`)는 그대로다(2026-10-04 두 파서의 정규식·패턴으로 확인).

### 적용

```bash
cp -p ~/ifsave-ops/pg-backup.sh ~/ifsave-ops/pg-backup.sh.bak-$(date +%F)
patch --dry-run ~/ifsave-ops/pg-backup.sh < ~/bokgi-prod/web/ops/pg-backup-bokgi.patch
patch ~/ifsave-ops/pg-backup.sh < ~/bokgi-prod/web/ops/pg-backup-bokgi.patch
/bin/bash -n ~/ifsave-ops/pg-backup.sh && echo "문법 OK"
```

### 확인

launchd를 거쳐 한 번 돌린다. v2.1은 백엔드를 세우지 않으므로 낮에 돌려도 서비스가 끊기지 않는다. 평소 03:00에 하는 일(IfSave 덤프·업로드·하트비트)을 그대로 한 번 더 한다.

```bash
launchctl kickstart -k gui/$(id -u)/com.ifsave.pgbackup
sleep 20; tail -1 ~/Library/Logs/ifsave-pgbackup.out.log
#   복기 공개 전:  … · bokgi=없음 · offsite=OK · heartbeat=OK
#   복기 공개 뒤:  … · bokgi=48211bytes · offsite=OK · heartbeat=OK
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$HOME/ifsave-ops/backup-passphrase \
  -in ~/ifsave-backups/bundle-$(date +%F).tar.enc | tar -tf -
#   기대: backup-<날짜>.dump · volumes-<날짜>.tar · bokgi-backup-<날짜>.dump
```

**복기를 공개한 날** `BOKGI_REQUIRED`를 1로 바꾼다. 그 뒤로는 `bokgi-db`가 죽어 있거나 덤프가 실패하면 IfSave와 같은 Healthchecks 경로로 실패 알림이 온다.

```bash
sed -i '' 's/^BOKGI_REQUIRED=0/BOKGI_REQUIRED=1/' ~/ifsave-ops/pg-backup.sh && grep -n '^BOKGI_REQUIRED' ~/ifsave-ops/pg-backup.sh
```

IfSave 런북 5-1의 "설치본 현황"에 "v2.2: 복기 bokgi-db 포함(bokgi web/ops/BACKUP.md)" 한 줄을 남겨 두면 다음 사람이 헷갈리지 않는다. 그 파일은 IfSave 저장소라 여기서 고치지 않았다.

런북 5-1의 age 판(canonical, 아직 설치 전)으로 갈아 끼울 때도 같은 세 군데를 넣는다. 덤프를 `$WORK_DIR`에 뜨고, `tar -cf - -C "$WORK_DIR" …` 목록에 넣고, 행 수 메타가 필요하면 `bokgi_users=` 같은 줄을 더한다. 그 판은 평문 덤프를 남기지 않으므로 회전 줄은 필요 없다.

### 패치 원문 (`ops/pg-backup-bokgi.patch`)

설치본 사본에 적용해 v2.2와 바이트 단위로 같아지는 것을 확인했다. `bash -n`을 통과했고, 1b 단계만 떼어 세 경우(떠 있음, 없음+0, 없음+1)를 따로 돌려 기대대로 동작함을 확인했다. IfSave 백업 자체는 돌리지 않았다.

```diff
--- pg-backup.sh (설치본 v2.1)
+++ pg-backup.sh (v2.2 복기 추가)
@@ -24,6 +24,10 @@
 #   런북 5-1의 age 기반 canonical 스크립트(백엔드 정지 스냅샷·atomic rename)는 심사 창(9/7~9/11)
 #   이후 설치한다 — 새벽 3시 백엔드 정지는 그 창의 다운타임 금지와 충돌한다.
 #
+# v2.2(복기 추가) — 같은 맥미니의 복기 DB(compose 프로젝트 bokgi, 컨테이너 bokgi-db)를 같은 번들에 넣는다.
+#   원문: bokgi 저장소 web/ops/BACKUP.md. 복기 공개 전(컨테이너 없음)에는 건너뛰고 로그에 bokgi=없음을 남긴다.
+#   복기를 공개한 뒤 BOKGI_REQUIRED=1로 바꾼다 — 그때부터 복기 덤프 실패는 이 백업 전체의 실패(/fail 핑)다.
+#
 # launchd는 로그인 셸 PATH를 상속하지 않는다 — 외부 명령은 전부 절대경로.
 set -euo pipefail
 
@@ -40,6 +44,9 @@
 DUMP="$BACKUP_DIR/backup-$STAMP.dump"
 BUNDLE="$BACKUP_DIR/bundle-$STAMP.tar.enc"
 STARTED_AT="$(/bin/date +%s)"
+BOKGI_CONTAINER="bokgi-db"
+BOKGI_REQUIRED=0                                 # 복기 공개 뒤 1 (web/ops/BACKUP.md)
+BOKGI_DUMP="$BACKUP_DIR/bokgi-backup-$STAMP.dump"
 
 # ── 하트비트·상태 파일 ──────────────────────────────────────────────────
 # URL은 토큰이라 어디에도 출력하지 않는다(런북 5-5). 심볼릭 링크·빈 파일이면 미설정으로 본다.
@@ -67,7 +74,7 @@
 on_exit() {
   rc=$?
   if [ "$rc" -ne 0 ]; then
-    for f in "$DUMP" "$BUNDLE" "$BACKUP_DIR/volumes-$STAMP.tar"; do
+    for f in "$DUMP" "$BOKGI_DUMP" "$BUNDLE" "$BACKUP_DIR/volumes-$STAMP.tar"; do
       [ -f "$f" ] && [ ! -s "$f" ] && /bin/rm -f "$f"
     done
     write_status FAIL || true
@@ -89,6 +96,25 @@
 fi
 /bin/chmod 600 "$DUMP"
 
+# ── 1b) 복기 DB 덤프 (v2.2) ─────────────────────────────────────────────
+# 같은 -Fc 형식. bokgi-db는 포트를 게시하지 않으므로 docker exec로만 뜬다. 복기에는 파일 볼륨이 없다.
+BOKGI_NOTE="bokgi=없음"
+BOKGI_FILES=""
+if [ "$("$DOCKER" inspect -f '{{.State.Running}}' "$BOKGI_CONTAINER" 2>/dev/null || true)" = "true" ]; then
+  "$DOCKER" exec "$BOKGI_CONTAINER" pg_dump -U bokgi -Fc bokgi > "$BOKGI_DUMP"
+  if [ ! -s "$BOKGI_DUMP" ]; then
+    echo "[$(/bin/date -Iseconds)] FAIL: empty bokgi dump $BOKGI_DUMP" >&2
+    /bin/rm -f "$BOKGI_DUMP"
+    exit 1
+  fi
+  /bin/chmod 600 "$BOKGI_DUMP"
+  BOKGI_FILES="bokgi-backup-$STAMP.dump"
+  BOKGI_NOTE="bokgi=$(/usr/bin/stat -f%z "$BOKGI_DUMP")bytes"
+elif [ "$BOKGI_REQUIRED" = "1" ]; then
+  echo "[$(/bin/date -Iseconds)] FAIL: $BOKGI_CONTAINER 가 실행 중이 아니다(BOKGI_REQUIRED=1)" >&2
+  exit 1
+fi
+
 # ── 2) 업로드 볼륨 tar ──────────────────────────────────────────────────
 # 컨테이너를 세우지 않고 볼륨만 읽기 마운트해 뜬다 — 서비스 무중단.
 VOLTAR="$BACKUP_DIR/volumes-$STAMP.tar"
@@ -102,7 +128,9 @@
 # ── 3) 묶어서 암호화 ────────────────────────────────────────────────────
 # 덤프+볼륨을 한 파일로 묶고 AES-256(-pbkdf2)으로 잠근다. 복호는:
 #   openssl enc -d -aes-256-cbc -pbkdf2 -pass file:<암호파일> -in bundle-날짜.tar.enc | tar -xf -
-/usr/bin/tar -cf - -C "$BACKUP_DIR" "backup-$STAMP.dump" "volumes-$STAMP.tar" \
+# v2.2: 복기가 떠 있으면 bokgi-backup-날짜.dump도 같은 번들에 들어간다($BOKGI_FILES, 없으면 빈 값).
+# shellcheck disable=SC2086
+/usr/bin/tar -cf - -C "$BACKUP_DIR" "backup-$STAMP.dump" "volumes-$STAMP.tar" $BOKGI_FILES \
   | "$OPENSSL" enc -aes-256-cbc -pbkdf2 -salt -pass "file:$PASS_FILE" -out "$BUNDLE"
 if [ ! -s "$BUNDLE" ]; then
   echo "[$(/bin/date -Iseconds)] FAIL: empty bundle $BUNDLE" >&2
@@ -131,6 +159,7 @@
 
 # ── 5) 로컬 회전 ────────────────────────────────────────────────────────
 /usr/bin/find "$BACKUP_DIR" -name 'backup-*.dump' -mtime +7 -delete
+/usr/bin/find "$BACKUP_DIR" -name 'bokgi-backup-*.dump' -mtime +7 -delete
 /usr/bin/find "$BACKUP_DIR" -name 'bundle-*.tar.enc' -mtime +7 -delete
 
 # ── 6) 하트비트 + 상태 파일 + 결과 로그 ─────────────────────────────────
@@ -146,8 +175,8 @@
     HEARTBEAT="heartbeat=FAIL"
   fi
   write_status OK
-  echo "[$(/bin/date -Iseconds)] OK: dump $(/usr/bin/basename "$DUMP") ($(/usr/bin/stat -f%z "$DUMP") bytes) · bundle $BUNDLE_NAME ($(/usr/bin/stat -f%z "$BUNDLE") bytes) · $OFFSITE · $HEARTBEAT"
+  echo "[$(/bin/date -Iseconds)] OK: dump $(/usr/bin/basename "$DUMP") ($(/usr/bin/stat -f%z "$DUMP") bytes) · bundle $BUNDLE_NAME ($(/usr/bin/stat -f%z "$BUNDLE") bytes) · $BOKGI_NOTE · $OFFSITE · $HEARTBEAT"
 else
   write_status PARTIAL
-  echo "[$(/bin/date -Iseconds)] PARTIAL: local bundle $BUNDLE_NAME ($(/usr/bin/stat -f%z "$BUNDLE") bytes) · $OFFSITE · $(fail_ping_label)"
+  echo "[$(/bin/date -Iseconds)] PARTIAL: local bundle $BUNDLE_NAME ($(/usr/bin/stat -f%z "$BUNDLE") bytes) · $BOKGI_NOTE · $OFFSITE · $(fail_ping_label)"
 fi
```

## 3. 복원 리허설: 운영 DB를 건드리지 않는다 (W8 전 1회, 그 뒤 월 1회)

임시 Postgres에 복원해 행 수를 맞춰 본다. 구현계획의 시험 항목 "운영 덤프 복사본에 `migrate deploy` · 백업 복원 → 성공, 행 수 불변"이 이 절차다. 2026-10-04 샌드박스에서 실제 migrate 이미지로 끝까지 돌렸다(복원 1초, 표별 행 수 일치, 복사본 migrate는 "No pending migrations").

```bash
cd ~/bokgi-prod/web
COUNT_SQL="select table_name || '=' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"

# 1) 덤프를 고른다 — 셋 중 하나
DUMP=/tmp/bokgi-drill.dump
#  (a) 지금 새로 뜨고, 같은 순간의 운영 행 수를 기록한다(리허설 기본)
docker exec bokgi-db pg_dump -U bokgi -Fc bokgi > "$DUMP"
docker exec bokgi-db psql -U bokgi -d bokgi -tAc "$COUNT_SQL" > /tmp/bokgi-drill.live
#  (b) 매일 번들에서 꺼낸다(오프사이트 사본이면 rclone copy로 먼저 내려받는다)
#      openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$HOME/ifsave-ops/backup-passphrase \
#        -in ~/ifsave-backups/bundle-<날짜>.tar.enc | tar -xf - -C /tmp bokgi-backup-<날짜>.dump
#  (c) 배포 전 덤프: backups/bokgi-predeploy-<시각>-<태그>.dump

# 2) 임시 Postgres(운영과 다른 이름·네트워크, 포트 게시 없음)
docker network create bokgi-restore-net
docker run -d --name bokgi-restore-test --network bokgi-restore-net \
  -e POSTGRES_USER=bokgi -e POSTGRES_DB=bokgi -e POSTGRES_PASSWORD=restore-only postgres:16
# TCP로 기다린다 — 초기화 중 임시 서버는 소켓만 열어서, 소켓으로 물으면 너무 일찍 ready가 나온다
until docker exec bokgi-restore-test pg_isready -h 127.0.0.1 -U bokgi -d bokgi >/dev/null 2>&1; do sleep 1; done

# 3) 복원(시간을 잰다)
time docker exec -i bokgi-restore-test pg_restore -U bokgi -d bokgi --no-owner --no-privileges --exit-on-error < "$DUMP"

# 4) 행 수 비교 — (a)라면 /tmp/bokgi-drill.live와 글자 그대로 같아야 한다
docker exec bokgi-restore-test psql -U bokgi -d bokgi -tAc "$COUNT_SQL" > /tmp/bokgi-drill.restored
diff /tmp/bokgi-drill.live /tmp/bokgi-drill.restored && echo "행 수 일치"

# 5) (선택·배포 전 권장) 다음 배포의 마이그레이션을 운영 복사본에 먼저 돌려 본다
#    deploy.sh를 한 번 돌려 빌드만 끝난 태그가 있거나, 손으로 빌드한 bokgi-migrate:<새 태그>
docker run --rm --network bokgi-restore-net \
  -e DATABASE_URL=postgresql://bokgi:restore-only@bokgi-restore-test:5432/bokgi bokgi-migrate:current

# 6) 정리
docker rm -f bokgi-restore-test && docker network rm bokgi-restore-net
rm -f "$DUMP" /tmp/bokgi-drill.live /tmp/bokgi-drill.restored
```

기록할 것: 날짜, 덤프 이름, 복원 시간, 행 수 일치 여부, 5)의 결과. 같은 형식의 기록이 IfSave `DEPLOY_LOG_TEMPLATE.md`에 있다.

## 4. 실제 복원 (장애 때): 운영 DB를 덮어쓴다

덤프 뒤에 들어온 기록은 사라진다. 먼저 지금 상태를 한 벌 더 떠 둔다.

```bash
cd ~/bokgi-prod/web
docker compose stop web                                              # 쓰기를 멈춘다(db는 그대로)
docker exec bokgi-db pg_dump -U bokgi -Fc bokgi > backups/bokgi-before-restore-$(date +%Y%m%d-%H%M%S).dump
# DB를 통째로 다시 만든다. --clean 복원은 덤프에 없는 새 테이블을 남겨 다음 migrate가 "already exists"로 깨진다.
docker exec bokgi-db psql -U bokgi -d postgres \
  -c "DROP DATABASE bokgi WITH (FORCE)" -c "CREATE DATABASE bokgi OWNER bokgi"
docker exec -i bokgi-db pg_restore -U bokgi -d bokgi --no-owner --no-privileges --exit-on-error < <고른 덤프>
docker compose --profile migrate run --rm migrate                    # 덤프가 옛 스키마면 그 뒤 마이그레이션을 다시 적용
docker compose up -d web
curl -s http://127.0.0.1:3100/api/health                             # {"ok":true,"db":true,...}
```

`pg_dump`와 `pg_restore`는 자기 세션의 `statement_timeout`을 0으로 바꾼다. 그래서 db의 15초 상한은 백업과 복원에 걸리지 않는다.

## 5. 마이그레이션 규칙 (배포·백업과 맞물리는 것)

- **추가형만** 쓴다(열·테이블·인덱스 추가). 삭제·이름 변경·타입 축소는 두 번의 배포로 나눈다. 먼저 코드가 그 열을 안 쓰게 배포하고, 다음 배포에서 지운다. 그래야 `deploy.sh`의 자동 되돌리기(이미지만 직전 태그로)가 안전하다.
- **db의 `statement_timeout=15s`.** 한 문장이 15초를 넘을 무거운 마이그레이션은 그 `migration.sql` 맨 위에 `SET LOCAL statement_timeout = 0;`을 둔다. Prisma는 마이그레이션 파일 하나를 한 트랜잭션으로 보내므로 그 파일에만 적용된다.
- **실패 기록이 남았을 때.** 실패한 마이그레이션은 `_prisma_migrations`에 남아 다음 `migrate deploy`를 막는다. 원인을 고친 뒤 이렇게 푼다.
  `docker compose --profile migrate run --rm migrate ./node_modules/.bin/prisma migrate resolve --rolled-back <이름>`
- **운영에서 쓰지 않는 명령.** `prisma migrate dev`·`db push`·`migrate reset`은 운영 DB에서 테이블을 지우거나 다시 만들 수 있다.

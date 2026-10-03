#!/usr/bin/env node
/**
 * 복기 환경변수 검사 — 값은 절대 출력하지 않는다(키 이름과 판정만).
 *
 *   node scripts/env-check.mjs                     # 개발 기준으로 ./.env 검사
 *   node scripts/env-check.mjs --prod --compose    # 운영(docker compose) 기준 — scripts/deploy.sh가 부른다
 *
 * 옵션
 *   --env-file <경로>   검사할 파일(기본: 이 스크립트 기준 ../.env)
 *   --example <경로>    필수 이름의 기준(기본: ../.env.example)
 *   --prod | --dev      운영/개발 기준(기본: NODE_ENV=production이면 운영, 아니면 개발)
 *   --compose           DATABASE_URL은 docker-compose.yml이 POSTGRES_PASSWORD로 만든다 → POSTGRES_PASSWORD를 요구
 *   --dev-env <경로>    이 파일(개발 .env)과 같은 비밀값을 쓰면 실패
 *
 * 필수 이름: .env.example의 모든 키. 단 ① 주석에 "선택"/"optional"이 있으면 선택,
 *            ② AI_*(AI_ENABLED 제외)는 AI_ENABLED=true일 때만 필수(AI_FALLBACK_*은 셋 다 있거나 셋 다 없거나).
 * 종료 코드: 0 통과(경고 허용) · 1 실패 · 2 사용법·파일 오류
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..");

// ---------- 인자 ----------
const argv = process.argv.slice(2);
const opts = { envFile: resolve(WEB, ".env"), example: resolve(WEB, ".env.example"), mode: null, compose: false, devEnv: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    const v = argv[++i];
    if (!v) usage(`${a}에 값이 없다`);
    return resolve(process.cwd(), v);
  };
  if (a === "--env-file") opts.envFile = next();
  else if (a === "--example") opts.example = next();
  else if (a === "--dev-env") opts.devEnv = next();
  else if (a === "--prod") opts.mode = "prod";
  else if (a === "--dev") opts.mode = "dev";
  else if (a === "--compose") opts.compose = true;
  else if (a === "-h" || a === "--help") usage(null);
  else usage(`모르는 옵션: ${a}`);
}
if (!opts.mode) opts.mode = process.env.NODE_ENV === "production" ? "prod" : "dev";
const PROD = opts.mode === "prod";

function usage(err) {
  const lines = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  const text = lines.slice(1, lines.findIndex((l) => l.trim() === "*/")).join("\n");
  if (err) console.error(`env-check: ${err}\n`);
  console.error(text.replace(/^ ?\/?\*+\/? ?/gm, ""));
  process.exit(err ? 2 : 0);
}

// ---------- .env 파서(compose·dotenv와 같은 규칙: 같은 키는 마지막 값, 따옴표 없는 값의 " #" 뒤는 주석) ----------
function parseEnv(path) {
  const map = new Map();
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const rest = m[2];
    let value = "";
    let comment = "";
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const end = rest.indexOf(rest[0], 1);
      value = end === -1 ? rest.slice(1) : rest.slice(1, end);
      comment = end === -1 ? "" : rest.slice(end + 1).replace(/^\s*#?\s*/, "");
    } else {
      const hash = rest.search(/\s#/);
      value = (hash === -1 ? rest : rest.slice(0, hash)).trim();
      comment = hash === -1 ? "" : rest.slice(hash).replace(/^\s*#\s*/, "");
    }
    map.set(key, { value, comment });
  }
  return map;
}

// ---------- 판정 도우미 ----------
const results = [];
const ok = (key, msg = "") => results.push({ level: "ok", key, msg });
const warn = (key, msg) => results.push({ level: "warn", key, msg });
const fail = (key, msg) => results.push({ level: "fail", key, msg });

/** .env.example의 자리표시자("…")나 흔한 임시값이면 true */
function isPlaceholder(v) {
  return v.includes("…") || /^(\.\.\.|<.*>|todo|tbd|changeme|change_me|change-me|xxx+|replace_me|your[-_].*)$/i.test(v);
}
/** 저장소·개발 .env에 적힌 종류의 값(누구나 아는 값)이면 true */
function looksLikeDevSecret(v) {
  return [/^dev[-_.]/i, /insecure/i, /change[-_]?me/i, /placeholder/i, /example/i, /not[-_]?secret/i, /^(secret|password|test)$/i]
    .some((re) => re.test(v));
}
const uniqueChars = (v) => new Set(v).size;

// ---------- 읽기 ----------
for (const [label, p] of [["검사 파일", opts.envFile], ["기준 파일", opts.example]]) {
  if (!existsSync(p)) {
    console.error(`env-check: ${label}이 없다: ${p}`);
    if (label === "검사 파일") console.error("  만들기: umask 077 && cp .env.example .env  (값 채우는 법은 README '운영')");
    process.exit(2);
  }
}
const env = parseEnv(opts.envFile);
const example = parseEnv(opts.example);
const val = (k) => env.get(k)?.value ?? "";
const has = (k) => val(k) !== "";

const aiEnabledRaw = val("AI_ENABLED");
const aiOn = aiEnabledRaw === "true";
const isAi = (k) => k.startsWith("AI_") && k !== "AI_ENABLED";
const isFallback = (k) => k.startsWith("AI_FALLBACK_");
const COMPOSE_PROVIDED = new Set(opts.compose ? ["DATABASE_URL"] : []);
const COMPOSE_REQUIRED = opts.compose ? ["POSTGRES_PASSWORD"] : [];

const required = [];
const optional = [];
const aiGated = [];
for (const [k, { comment }] of example) {
  if (COMPOSE_PROVIDED.has(k)) continue;
  if (isAi(k)) aiGated.push(k);
  else if (/선택|optional/i.test(comment)) optional.push(k);
  else required.push(k);
}

// ---------- 1. 파일 권한 ----------
try {
  const mode = statSync(opts.envFile).mode & 0o777;
  if (PROD && (mode & 0o077) !== 0) warn("(파일)", `권한이 ${mode.toString(8)}다 — 같은 기기의 다른 계정이 읽는다 → chmod 600`);
} catch {
  /* 권한을 못 읽어도 검사는 계속한다 */
}

// ---------- 2. 필수 이름 ----------
for (const k of [...required, ...COMPOSE_REQUIRED]) {
  if (!has(k)) fail(k, "비어 있다(필수)");
  else if (isPlaceholder(val(k))) fail(k, ".env.example의 자리표시자 그대로다");
}
for (const k of optional) {
  if (has(k) && isPlaceholder(val(k))) warn(k, "선택 항목인데 자리표시자 그대로다 — 쓰지 않으면 줄을 지우거나 비운다");
}

// ---------- 3. SESSION_SECRET ----------
if (has("SESSION_SECRET") && !isPlaceholder(val("SESSION_SECRET"))) {
  const s = val("SESSION_SECRET");
  const bad = [];
  if (Buffer.byteLength(s, "utf8") < 32) bad.push("32바이트보다 짧다");
  if (PROD && looksLikeDevSecret(s)) bad.push("개발용 기본값이다(저장소·개발 .env에 적힌 종류)");
  if (PROD && uniqueChars(s) < 12) bad.push("같은 글자가 반복된다(무작위가 아니다)");
  if (bad.length) fail("SESSION_SECRET", `${bad.join(", ")} → openssl rand -base64 32`);
  else ok("SESSION_SECRET", "32바이트 이상" + (PROD ? " · 개발 기본값 아님" : ""));
}

// ---------- 4. PUBLIC_ORIGIN ----------
if (has("PUBLIC_ORIGIN") && !isPlaceholder(val("PUBLIC_ORIGIN"))) {
  let u = null;
  try {
    u = new URL(val("PUBLIC_ORIGIN"));
  } catch {
    fail("PUBLIC_ORIGIN", "URL로 읽히지 않는다(예: https://bokgi.ifsave.com)");
  }
  if (u) {
    const raw = val("PUBLIC_ORIGIN");
    const local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/.test(u.hostname);
    if (raw !== u.origin && raw !== `${u.origin}/`) fail("PUBLIC_ORIGIN", "경로·쿼리 없이 origin만 쓴다(브라우저 Origin 헤더와 글자 그대로 비교된다)");
    else if (PROD && u.protocol !== "https:") fail("PUBLIC_ORIGIN", "운영은 https여야 한다(쿠키 Secure·__Host- 접두사가 https를 요구한다)");
    else if (PROD && local) fail("PUBLIC_ORIGIN", "운영에 localhost 주소다(공개 주소 https://bokgi.ifsave.com)");
    else {
      if (raw.endsWith("/")) warn("PUBLIC_ORIGIN", "끝 슬래시는 앱이 떼어 쓰지만 없는 편이 정확하다");
      ok("PUBLIC_ORIGIN", `${u.protocol.replace(":", "")} origin`);
    }
  }
}

// ---------- 5. APP_TZ ----------
if (has("APP_TZ")) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: val("APP_TZ") });
    ok("APP_TZ", "IANA 시간대");
  } catch {
    fail("APP_TZ", "IANA 시간대 이름이 아니다(예: Asia/Seoul)");
  }
}

// ---------- 6. DATABASE_URL / POSTGRES_PASSWORD ----------
if (opts.compose) {
  if (has("DATABASE_URL")) warn("DATABASE_URL", "compose가 POSTGRES_PASSWORD로 만들어 덮어쓴다 — 이 줄은 무시된다(지워도 된다)");
  const pw = val("POSTGRES_PASSWORD");
  if (pw && !isPlaceholder(pw)) {
    const bad = [];
    if (!/^[A-Za-z0-9._~-]+$/.test(pw)) bad.push("URL에 그대로 못 넣는 글자가 있다(compose가 DATABASE_URL에 넣는다)");
    if (PROD && pw.length < 24) bad.push("24자보다 짧다");
    if (/^(bokgi|bokgi-dev|postgres|password)$/i.test(pw) || (PROD && looksLikeDevSecret(pw))) bad.push("알려진 값이다");
    if (bad.length) fail("POSTGRES_PASSWORD", `${bad.join(", ")} → openssl rand -hex 24`);
    else ok("POSTGRES_PASSWORD", "URL 안전 · 길이 충족");
    if (pw === val("SESSION_SECRET")) fail("POSTGRES_PASSWORD", "SESSION_SECRET과 같은 값이다 — 비밀값을 돌려 쓰지 않는다");
  }
} else if (has("DATABASE_URL") && !isPlaceholder(val("DATABASE_URL"))) {
  try {
    const u = new URL(val("DATABASE_URL"));
    if (!/^postgres(ql)?:$/.test(u.protocol)) fail("DATABASE_URL", "postgresql:// 주소가 아니다");
    else ok("DATABASE_URL", "postgresql URL");
  } catch {
    fail("DATABASE_URL", "URL로 읽히지 않는다(비밀번호에 @ : / # 가 있으면 퍼센트 인코딩)");
  }
}

// ---------- 7. AI_* ----------
if (aiEnabledRaw !== "" && aiEnabledRaw !== "true" && aiEnabledRaw !== "false") {
  fail("AI_ENABLED", "true 또는 false만 쓴다(앱은 정확히 \"true\"일 때만 켠다)");
}
if (aiOn) {
  const primary = aiGated.filter((k) => !isFallback(k));
  const fallback = aiGated.filter(isFallback);
  for (const k of primary) {
    if (!has(k)) fail(k, "AI_ENABLED=true인데 비어 있다");
    else if (isPlaceholder(val(k))) fail(k, "자리표시자 그대로다");
  }
  const setFallback = fallback.filter(has);
  if (setFallback.length && setFallback.length !== fallback.length) {
    fail("AI_FALLBACK_*", `셋 다 채우거나 셋 다 비운다(채워진 것: ${setFallback.join(", ")})`);
  }
  for (const k of aiGated.filter((k) => k.endsWith("_BASE_URL") && has(k))) {
    try {
      if (new URL(val(k)).protocol !== "https:") fail(k, "https 주소가 아니다");
    } catch {
      fail(k, "URL로 읽히지 않는다");
    }
  }
  if (has("AI_DAILY_CALL_CAP")) {
    const cap = val("AI_DAILY_CALL_CAP");
    if (!/^\d+$/.test(cap) || Number(cap) < 1) fail("AI_DAILY_CALL_CAP", "1 이상의 정수여야 한다");
    else if (Number(cap) > 1000) warn("AI_DAILY_CALL_CAP", "1000회를 넘는다 — IfSave와 같은 키를 쓰므로 운영 한도를 먹을 수 있다");
  }
  if (!results.some((r) => r.level === "fail" && (isAi(r.key) || r.key === "AI_FALLBACK_*"))) ok("AI_*", "켜짐 · 필수 키·주소·상한 일관");
} else if (aiEnabledRaw === "false") {
  ok("AI_*", "꺼짐(AI_ENABLED=false) — 템플릿 질문·해설만, AI 키 검사 생략");
}

// ---------- 8. 개발 .env와 같은 비밀값 ----------
if (opts.devEnv) {
  if (!existsSync(opts.devEnv)) warn("(개발 .env)", "비교할 파일이 없다 — 건너뜀");
  else {
    const dev = parseEnv(opts.devEnv);
    for (const k of ["SESSION_SECRET", "POSTGRES_PASSWORD", "INVITE_ADMIN_TOKEN"]) {
      const a = val(k);
      const b = dev.get(k)?.value ?? "";
      if (a && b && a === b) fail(k, "개발 .env와 같은 값이다 — 운영 비밀은 새로 만든다");
    }
  }
}

// ---------- 9. 기준에 없는 키(오타 의심) ----------
const KNOWN_EXTRA = new Set(["POSTGRES_PASSWORD"]);
for (const k of env.keys()) {
  if (example.has(k) || KNOWN_EXTRA.has(k)) continue;
  if (k.startsWith("NEXT_PUBLIC_")) warn(k, "NEXT_PUBLIC_*는 빌드 때 굽힌다 — 실행 때 .env로는 바뀌지 않는다");
  else if (k === "NODE_ENV") warn(k, "compose·이미지가 production으로 고정한다 — 이 줄은 무시된다");
  else warn(k, ".env.example에 없는 이름이다(오타?)");
}

// ---------- 출력 ----------
const C = process.stdout.isTTY ? { r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", b: "\x1b[1m", o: "\x1b[0m" } : { r: "", y: "", g: "", b: "", o: "" };
const tag = { ok: `${C.g}OK  ${C.o}`, warn: `${C.y}WARN${C.o}`, fail: `${C.r}FAIL${C.o}` };
console.log(`${C.b}env-check${C.o} (${PROD ? "운영" : "개발"}${opts.compose ? " · compose" : ""}) — ${opts.envFile}`);
console.log(
  `  기준: ${opts.example} — 필수 ${required.length + COMPOSE_REQUIRED.length} · AI 조건부 ${aiGated.length} · 선택 ${optional.length}` +
    (opts.compose ? " (DATABASE_URL은 compose가 만든다)" : ""),
);
const shown = new Set();
for (const r of results) {
  shown.add(r.key);
  console.log(`  ${tag[r.level]} ${r.key}${r.msg ? `  ${r.msg}` : ""}`);
}
for (const k of [...required, ...COMPOSE_REQUIRED]) if (!shown.has(k)) console.log(`  ${tag.ok} ${k}`);
const nFail = results.filter((r) => r.level === "fail").length;
const nWarn = results.filter((r) => r.level === "warn").length;
console.log(nFail ? `${C.r}실패 ${nFail}${C.o} · 경고 ${nWarn}` : `${C.g}통과${C.o} · 경고 ${nWarn}`);
process.exit(nFail ? 1 : 0);

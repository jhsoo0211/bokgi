import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { INFO_PRESETS, Me } from "@/shared/contract";
import type { z } from "zod";
type MeT = z.infer<typeof Me>;

import { POST as invite } from "@/app/api/auth/invite/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/me/route";
import { hashInviteCode } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { call, resetUserData } from "./helpers";

async function makeInvite(code: string, data: { expiresAt?: Date; forUserId?: string } = {}) {
  await db().invite.create({ data: { codeHash: hashInviteCode(code), ...data } });
}

let ipSeq = 0;
const ip = () => ({ "cf-connecting-ip": `10.0.${Math.floor(++ipSeq / 200)}.${ipSeq % 200}` });

beforeAll(resetUserData);
afterEach(() => {
  process.env.PUBLIC_ORIGIN = "http://localhost:3000";
});

describe("초대 코드 → DB 세션", () => {
  it("코드는 한 번만: 첫 사용 200 + HttpOnly 쿠키, 두 번째는 같은 실패 문구", async () => {
    await makeInvite("TEST-AAAA-0001");
    const r1 = await call<{ user: { id: string; nickname: string; onboarded: boolean; tz: string } }>(invite, {
      body: { code: "test aaaa 0001", nickname: "  가나  " },
      headers: ip(),
    });
    expect(r1.status).toBe(200);
    expect(r1.json.user).toMatchObject({ nickname: "가나", onboarded: false, tz: "Asia/Seoul" });
    const cookie = r1.headers.getSetCookie()[0];
    expect(cookie).toMatch(/^bokgi_sid=[A-Za-z0-9_-]{40,}/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i); // http 개발 환경
    expect(r1.headers.get("cache-control")).toBe("private, no-store");

    const r2 = await call(invite, { body: { code: "TEST-AAAA-0001", nickname: "다라" }, headers: ip() });
    const r3 = await call(invite, { body: { code: "NOPE-NOPE-NOPE", nickname: "다라" }, headers: ip() });
    expect(r2.status).toBe(400);
    expect(r3.status).toBe(400);
    expect(r2.json).toEqual({ error: { code: "invite_invalid", message: "초대 코드를 확인해 주세요." } });
    expect(r3.json).toEqual(r2.json);
    expect(await db().user.count({ where: { nickname: "다라" } })).toBe(0);
  });

  it("같은 코드를 동시에 두 번 써도 한 번만 성공한다", async () => {
    await makeInvite("RACE-0000-0001");
    const [a, b] = await Promise.all([
      call(invite, { body: { code: "RACE-0000-0001", nickname: "동시1" }, headers: ip() }),
      call(invite, { body: { code: "RACE-0000-0001", nickname: "동시2" }, headers: ip() }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    const used = await db().invite.findUniqueOrThrow({ where: { codeHash: hashInviteCode("RACE-0000-0001") } });
    expect(used.usedBy).not.toBeNull();
    expect(await db().user.count({ where: { nickname: { in: ["동시1", "동시2"] } } })).toBe(1);
  });

  it("만료된 코드는 같은 실패 문구", async () => {
    await makeInvite("OLD0-0000-0001", { expiresAt: new Date(Date.now() - 1000) });
    const r = await call(invite, { body: { code: "OLD0-0000-0001", nickname: "만료" }, headers: ip() });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: { code: "invite_invalid", message: "초대 코드를 확인해 주세요." } });
  });

  it("재발급 코드는 같은 계정에 새 세션을 준다(닉네임 무시)", async () => {
    await makeInvite("FRST-0000-0001");
    const first = await call<{ user: { id: string } }>(invite, { body: { code: "FRST-0000-0001", nickname: "원래" }, headers: ip() });
    await makeInvite("RCVR-0000-0001", { forUserId: first.json.user.id });
    const again = await call<{ user: { id: string; nickname: string } }>(invite, { body: { code: "RCVR-0000-0001", nickname: "다른이름" }, headers: ip() });
    expect(again.status).toBe(200);
    expect(again.json.user).toMatchObject({ id: first.json.user.id, nickname: "원래" });
    expect(await db().sessionAuth.count({ where: { userId: first.json.user.id } })).toBe(2);
  });

  it("초대 응답(Me)에 정보 수준·토글·되돌리기 시간: 새 사용자는 기본값, 재발급은 저장된 설정", async () => {
    await makeInvite("PREF-0000-0001");
    const r = await call<MeT>(invite, { body: { code: "PREF-0000-0001", nickname: "설정" }, headers: ip() });
    expect(r.status).toBe(200);
    expect(Me.safeParse(r.json).success).toBe(true);
    expect(r.json.user).toMatchObject({ infoLevel: "standard", panelPrefs: INFO_PRESETS.standard, undoSeconds: 2.5 });
    const prefs = { ...INFO_PRESETS.basic, riskChips: true };
    await db().user.update({ where: { id: r.json.user.id }, data: { infoLevel: "custom", panelPrefs: prefs, undoSeconds: 10 } });
    await makeInvite("PREF-0000-0002", { forUserId: r.json.user.id });
    const again = await call<MeT>(invite, { body: { code: "PREF-0000-0002", nickname: "설정" }, headers: ip() });
    expect(again.json.user).toMatchObject({ id: r.json.user.id, infoLevel: "custom", panelPrefs: prefs, undoSeconds: 10 });
  });

  it("GET /api/me: 쿠키가 있으면 사용자, 없으면 401", async () => {
    await makeInvite("MEME-0000-0001");
    const r = await call(invite, { body: { code: "MEME-0000-0001", nickname: "나" }, headers: ip() });
    const cookie = r.headers.getSetCookie()[0].split(";")[0];
    const ok = await call<{ user: { nickname: string } }>(me, { cookie });
    expect(ok.status).toBe(200);
    expect(ok.json.user.nickname).toBe("나");
    const no = await call(me, {});
    expect(no.status).toBe(401);
    expect(no.json).toEqual({ error: { code: "unauthorized", message: "로그인이 필요해요." } });
    const forged = await call(me, { cookie: "bokgi_sid=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
    expect(forged.status).toBe(401);
  });

  it("로그아웃: 세션 폐기 + 쿠키 삭제, 이후 401", async () => {
    await makeInvite("BYEB-0000-0001");
    const r = await call(invite, { body: { code: "BYEB-0000-0001", nickname: "잘가" }, headers: ip() });
    const cookie = r.headers.getSetCookie()[0].split(";")[0];
    const out = await call(logout, { method: "POST", cookie });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie()[0]).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect((await call(me, { cookie })).status).toBe(401);
    // 다시 해도 200
    expect((await call(logout, { method: "POST", cookie })).status).toBe(200);
  });

  it("https 운영 원점이면 __Host- 쿠키 + Secure", async () => {
    process.env.PUBLIC_ORIGIN = "https://bokgi.ifsave.com";
    await makeInvite("HOST-0000-0001");
    const r = await call(invite, { body: { code: "HOST-0000-0001", nickname: "운영" }, headers: ip(), origin: "https://bokgi.ifsave.com" });
    expect(r.status).toBe(200);
    const cookie = r.headers.getSetCookie()[0];
    expect(cookie).toMatch(/^__Host-bokgi_sid=/);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });
});

describe("요청 공통 규칙", () => {
  it("Origin이 PUBLIC_ORIGIN과 다르거나 없으면 403", async () => {
    const other = await call(invite, { body: { code: "XXXX-XXXX-XXXX", nickname: "a" }, origin: "https://demo.ifsave.com", headers: ip() });
    expect(other.status).toBe(403);
    expect(other.json).toEqual({ error: { code: "forbidden_origin", message: "허용되지 않은 요청이에요." } });
    const none = await call(invite, { body: { code: "XXXX-XXXX-XXXX", nickname: "a" }, origin: null, headers: ip() });
    expect(none.status).toBe(403);
  });

  it("application/json이 아니면 415, 깨진 JSON은 400, 계약 밖 본문은 422", async () => {
    const form = await call(invite, { rawBody: "code=x&nickname=y", contentType: "application/x-www-form-urlencoded", headers: ip() });
    expect(form.status).toBe(415);
    const broken = await call(invite, { rawBody: "{oops", headers: ip() });
    expect(broken.status).toBe(400);
    const extra = await call(invite, { body: { code: "XXXX-XXXX", nickname: "a", admin: true }, headers: ip() });
    expect(extra.status).toBe(422);
    const blankName = await call(invite, { body: { code: "XXXX-XXXX", nickname: "   " }, headers: ip() });
    expect(blankName.status).toBe(422);
  });
});

describe("초대 시도 한도", () => {
  it("CF-Connecting-IP당 10분 5회: 6번째는 429 + Retry-After", async () => {
    const h = { "cf-connecting-ip": "203.0.113.7" };
    for (let i = 0; i < 5; i++) {
      const r = await call(invite, { body: { code: `BAD0-0000-000${i}`, nickname: "a" }, headers: h });
      expect(r.status).toBe(400);
    }
    const sixth = await call(invite, { body: { code: "BAD0-0000-0009", nickname: "a" }, headers: h });
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(sixth.headers.get("retry-after"))).toBeLessThanOrEqual(600);
    expect(sixth.json).toEqual({ error: { code: "rate_limited", message: "잠시 뒤에 다시 시도해 주세요." } });
    // 다른 IP는 아직 된다
    const other = await call(invite, { body: { code: "BAD0-0000-0010", nickname: "a" }, headers: { "cf-connecting-ip": "203.0.113.8" } });
    expect(other.status).toBe(400);
  });

  it("전체 시간당 30회: 31번째는 429", async () => {
    await db().rateLimit.deleteMany({});
    for (let i = 0; i < 30; i++) {
      const r = await call(invite, { body: { code: `GLB0-0000-${String(i).padStart(4, "0")}`, nickname: "a" }, headers: { "cf-connecting-ip": `198.51.100.${i}` } });
      expect(r.status).toBe(400);
    }
    const r31 = await call(invite, { body: { code: "GLB0-0000-9999", nickname: "a" }, headers: { "cf-connecting-ip": "198.51.100.200" } });
    expect(r31.status).toBe(429);
    expect(r31.headers.get("retry-after")).not.toBeNull();
    await db().rateLimit.deleteMany({});
  });
});

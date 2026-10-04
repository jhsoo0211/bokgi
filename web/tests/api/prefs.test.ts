import { beforeAll, describe, expect, it } from "vitest";
import { INFO_PRESETS, Me, type PanelPrefs } from "@/shared/contract";
import type { z } from "zod";
type MeT = z.infer<typeof Me>;

import { GET as me } from "@/app/api/me/route";
import { PUT as putPrefs } from "@/app/api/me/prefs/route";
import { db } from "@/lib/server/db";
import { call, createUser, resetUserData } from "./helpers";

beforeAll(resetUserData);

const put = (cookie: string, body: unknown, over: Parameters<typeof call>[1] = {}) => call<MeT>(putPrefs, { method: "PUT", cookie, body, ...over });

async function stored(userId: string) {
  const u = await db().user.findUniqueOrThrow({ where: { id: userId }, select: { infoLevel: true, panelPrefs: true, undoSeconds: true } });
  return { infoLevel: u.infoLevel, panelPrefs: u.panelPrefs, undoSeconds: u.undoSeconds.toNumber() };
}

describe("GET /api/me — 정보 수준", () => {
  it("새 사용자는 중급(standard)·중급 프리셋 토글·되돌리기 2.5초", async () => {
    const u = await createUser("설정0");
    const r = await call<MeT>(me, { cookie: u.cookie });
    expect(r.status).toBe(200);
    expect(Me.safeParse(r.json).success).toBe(true);
    expect(r.json.user).toMatchObject({ infoLevel: "standard", panelPrefs: INFO_PRESETS.standard, undoSeconds: 2.5 });
    expect(await stored(u.userId)).toEqual({ infoLevel: "standard", panelPrefs: null, undoSeconds: 2.5 });
  });
});

describe("PUT /api/me/prefs — 정규화", () => {
  it("custom이 아니면 프리셋으로 저장(panel_prefs NULL), 응답 토글은 그 프리셋", async () => {
    const u = await createUser("설정1");
    const r = await put(u.cookie, { infoLevel: "basic" });
    expect(r.status).toBe(200);
    expect(Me.safeParse(r.json).success).toBe(true);
    expect(r.json.user).toMatchObject({ infoLevel: "basic", panelPrefs: INFO_PRESETS.basic, undoSeconds: 2.5 });
    expect(await stored(u.userId)).toEqual({ infoLevel: "basic", panelPrefs: null, undoSeconds: 2.5 });
    const std = await put(u.cookie, { infoLevel: "standard" });
    expect(std.json.user).toMatchObject({ infoLevel: "standard", panelPrefs: INFO_PRESETS.standard });
    expect((await stored(u.userId)).panelPrefs).toBeNull();
  });

  it("custom이 아닐 때 보낸 토글은 무시한다", async () => {
    const u = await createUser("설정2");
    const r = await put(u.cookie, { infoLevel: "basic", panelPrefs: INFO_PRESETS.advanced });
    expect(r.status).toBe(200);
    expect(r.json.user).toMatchObject({ infoLevel: "basic", panelPrefs: INFO_PRESETS.basic });
    expect(await stored(u.userId)).toMatchObject({ infoLevel: "basic", panelPrefs: null });
  });

  it("custom인데 토글이 없으면 422 validation_failed(저장하지 않음)", async () => {
    const u = await createUser("설정3");
    const r = await put(u.cookie, { infoLevel: "custom" });
    expect(r.status).toBe(422);
    expect(r.json).toEqual({ error: { code: "validation_failed", message: "요청 형식이 올바르지 않아요." } });
    expect(await stored(u.userId)).toEqual({ infoLevel: "standard", panelPrefs: null, undoSeconds: 2.5 });
  });

  it("custom인데 고급 프리셋과 같은 토글이면 advanced + NULL로 저장", async () => {
    const u = await createUser("설정4");
    const r = await put(u.cookie, { infoLevel: "custom", panelPrefs: INFO_PRESETS.advanced });
    expect(r.status).toBe(200);
    expect(r.json.user).toMatchObject({ infoLevel: "advanced", panelPrefs: INFO_PRESETS.advanced });
    expect(await stored(u.userId)).toMatchObject({ infoLevel: "advanced", panelPrefs: null });
  });

  it("custom이고 프리셋과 다르면 custom + 토글 저장, GET /api/me도 같은 토글", async () => {
    const u = await createUser("설정5");
    const prefs: PanelPrefs = { ...INFO_PRESETS.standard, fxCommodity: true, riskChips: false };
    const r = await put(u.cookie, { infoLevel: "custom", panelPrefs: prefs });
    expect(r.status).toBe(200);
    expect(r.json.user).toMatchObject({ infoLevel: "custom", panelPrefs: prefs });
    expect(await stored(u.userId)).toEqual({ infoLevel: "custom", panelPrefs: prefs, undoSeconds: 2.5 });
    const got = await call<MeT>(me, { cookie: u.cookie });
    expect(got.json.user).toMatchObject({ infoLevel: "custom", panelPrefs: prefs });
    // custom → 프리셋으로 바꾸면 저장된 토글은 지운다
    const back = await put(u.cookie, { infoLevel: "advanced" });
    expect(back.json.user).toMatchObject({ infoLevel: "advanced", panelPrefs: INFO_PRESETS.advanced });
    expect(await stored(u.userId)).toMatchObject({ infoLevel: "advanced", panelPrefs: null });
  });

  it("멱등: 같은 본문을 두 번 보내면 같은 응답·같은 저장값", async () => {
    const u = await createUser("설정6");
    const body = { infoLevel: "custom", panelPrefs: { ...INFO_PRESETS.basic, marketLine: true }, undoSeconds: 5 };
    const a = await put(u.cookie, body);
    const before = await stored(u.userId);
    const b = await put(u.cookie, body);
    expect(b.status).toBe(200);
    expect(b.json).toEqual(a.json);
    expect(await stored(u.userId)).toEqual(before);
  });

  it("undoSeconds: 보내면 바꾸고, 생략하면 그대로", async () => {
    const u = await createUser("설정7");
    expect((await put(u.cookie, { infoLevel: "standard", undoSeconds: 5 })).json.user.undoSeconds).toBe(5);
    const kept = await put(u.cookie, { infoLevel: "basic" });
    expect(kept.json.user).toMatchObject({ infoLevel: "basic", undoSeconds: 5 });
    expect((await stored(u.userId)).undoSeconds).toBe(5);
    expect((await put(u.cookie, { infoLevel: "basic", undoSeconds: 10 })).json.user.undoSeconds).toBe(10);
    expect((await put(u.cookie, { infoLevel: "basic", undoSeconds: 2.5 })).json.user.undoSeconds).toBe(2.5);
    expect((await call<MeT>(me, { cookie: u.cookie })).json.user.undoSeconds).toBe(2.5);
  });

  it("계약 밖 값은 422: undoSeconds 3.0, 모르는 수준·묶음·키", async () => {
    const u = await createUser("설정8");
    const bad = [
      await put(u.cookie, undefined, { rawBody: '{"infoLevel":"standard","undoSeconds":3.0}' }),
      await put(u.cookie, { infoLevel: "standard", undoSeconds: 0 }),
      await put(u.cookie, { infoLevel: "expert" }),
      await put(u.cookie, { infoLevel: "custom", panelPrefs: { ...INFO_PRESETS.basic, peg: true } }),
      await put(u.cookie, { infoLevel: "custom", panelPrefs: { marketLine: true } }),
      await put(u.cookie, { infoLevel: "custom", panelPrefs: { ...INFO_PRESETS.basic, volume: "yes" } }),
      await put(u.cookie, { infoLevel: "standard", admin: true }),
      await put(u.cookie, {}),
    ];
    for (const r of bad) expect(r.status).toBe(422);
    expect(await stored(u.userId)).toEqual({ infoLevel: "standard", panelPrefs: null, undoSeconds: 2.5 });
  });

  it("비GET 규칙: 다른 Origin·Origin 없음 403, JSON이 아니면 415, 로그인하지 않으면 401", async () => {
    const u = await createUser("설정9");
    const other = await put(u.cookie, { infoLevel: "basic" }, { origin: "https://evil.ifsave.com" });
    expect(other.status).toBe(403);
    expect(other.json).toEqual({ error: { code: "forbidden_origin", message: "허용되지 않은 요청이에요." } });
    expect((await put(u.cookie, { infoLevel: "basic" }, { origin: null })).status).toBe(403);
    expect((await put(u.cookie, undefined, { rawBody: "infoLevel=basic", contentType: "text/plain" })).status).toBe(415);
    expect((await call(putPrefs, { method: "PUT", body: { infoLevel: "basic" } })).status).toBe(401);
    expect(await stored(u.userId)).toMatchObject({ infoLevel: "standard" });
  });

  it("다른 사용자의 설정은 바뀌지 않는다", async () => {
    const a = await createUser("설정10");
    const b = await createUser("설정11");
    await put(a.cookie, { infoLevel: "advanced", undoSeconds: 10 });
    expect(await stored(b.userId)).toEqual({ infoLevel: "standard", panelPrefs: null, undoSeconds: 2.5 });
    expect((await call<MeT>(me, { cookie: b.cookie })).json.user).toMatchObject({ infoLevel: "standard", undoSeconds: 2.5 });
  });
});

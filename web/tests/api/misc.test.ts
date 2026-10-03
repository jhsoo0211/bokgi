import { beforeAll, describe, expect, it } from "vitest";
import { Health, UI_EVENTS } from "@/shared/contract";
import type { z } from "zod";
type HealthT = z.infer<typeof Health>;

import { GET as notFoundGet, POST as notFoundPost } from "@/app/api/[...rest]/route";
import { POST as events } from "@/app/api/events/route";
import { GET as health } from "@/app/api/health/route";
import { GET as me } from "@/app/api/me/route";
import { POST as reports } from "@/app/api/reports/route";
import { db } from "@/lib/server/db";
import { C001, call, createUser, resetUserData, uuid } from "./helpers";

beforeAll(resetUserData);

const ev = (event: string, over: Record<string, unknown> = {}) => ({ clientEventId: uuid(), event, caseId: null, caseVersion: null, payload: null, ts: new Date().toISOString(), ...over });

describe("GET /api/health", () => {
  it("DB 확인 결과와 버전, no-store", async () => {
    const r = await call<HealthT>(health, {});
    expect(r.status).toBe(200);
    expect(Health.safeParse(r.json).success).toBe(true);
    expect(r.json).toMatchObject({ ok: true, db: true });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("POST /api/events", () => {
  it("allow-list 밖 이벤트는 거르고, clientEventId로 멱등", async () => {
    const u = await createUser("이벤트1");
    const a = ev("card_view", { caseId: C001, caseVersion: 1, payload: { panel: "numbers" } });
    const r1 = await call<{ accepted: number; duplicates: number; rejected: number }>(events, { cookie: u.cookie, body: { events: [a, ev("judge"), ev("reveal")] } });
    expect(r1.status).toBe(200);
    expect(r1.json).toMatchObject({ accepted: 1, duplicates: 0, rejected: 2 });
    const r2 = await call<{ accepted: number; duplicates: number }>(events, { cookie: u.cookie, body: { events: [a] } });
    expect(r2.json).toMatchObject({ accepted: 0, duplicates: 1 });
    expect(await db().event.count({ where: { userId: u.userId } })).toBe(1);
    expect(UI_EVENTS).not.toContain("judge");
  });

  it("onboarding_done을 받으면 온보딩 완료로 기록", async () => {
    const u = await createUser("이벤트2");
    expect(((await call<{ user: { onboarded: boolean } }>(me, { cookie: u.cookie })).json).user.onboarded).toBe(false);
    await call(events, { cookie: u.cookie, body: { events: [ev("onboarding_done")] } });
    expect(((await call<{ user: { onboarded: boolean } }>(me, { cookie: u.cookie })).json).user.onboarded).toBe(true);
  });

  it("본문 32KB 초과는 413, 51개 이상은 422", async () => {
    const u = await createUser("이벤트3");
    const big = { events: [ev("card_view", { payload: { blob: "x".repeat(33 * 1024) } })] };
    const r = await call(events, { cookie: u.cookie, body: big });
    expect(r.status).toBe(413);
    const many = { events: Array.from({ length: 51 }, () => ev("card_view")) };
    expect((await call(events, { cookie: u.cookie, body: many })).status).toBe(422);
  });
});

describe("POST /api/reports", () => {
  it("카드 버전과 함께 접수 201, 없는 카드 404, 모르는 유형 422", async () => {
    const u = await createUser("신고");
    const r = await call<{ reportId: string }>(reports, { cookie: u.cookie, body: { caseId: C001, caseVersion: 1, category: "data_error", note: "PER이 공시와 달라요" } });
    expect(r.status).toBe(201);
    const row = await db().report.findUniqueOrThrow({ where: { id: r.json.reportId } });
    expect(row).toMatchObject({ caseVersion: 1, category: "data_error", status: "open" });
    expect((await call(reports, { cookie: u.cookie, body: { caseId: uuid(), caseVersion: 1, category: "other", note: null } })).status).toBe(404);
    expect((await call(reports, { cookie: u.cookie, body: { caseId: C001, caseVersion: 1, category: "spam", note: null } })).status).toBe(422);
    expect((await call(reports, { cookie: u.cookie, body: { caseId: C001, caseVersion: 9, category: "other", note: null } })).status).toBe(422);
  });
});

describe("없는 /api 경로", () => {
  it("JSON 오류 봉투 404, no-store", async () => {
    for (const h of [notFoundGet, notFoundPost]) {
      const r = await call(h, { method: h === notFoundGet ? "GET" : "POST", path: "/api/nope" });
      expect(r.status).toBe(404);
      expect(r.json).toEqual({ error: { code: "not_found", message: "찾을 수 없어요." } });
      expect(r.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});

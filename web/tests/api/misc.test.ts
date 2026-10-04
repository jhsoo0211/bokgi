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
import { C001, C002, call, createUser, resetUserData, uuid } from "./helpers";

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

  it("2차 UI 이벤트(정보 수준 시트·더 보기·길 보기)는 받는다 — allow-list는 계약 UI_EVENTS", async () => {
    const u = await createUser("이벤트새");
    const names = ["info_level_open", "panel_expand", "concept_path_view"];
    for (const n of names) expect(UI_EVENTS).toContain(n);
    const r = await call<{ accepted: number; duplicates: number; rejected: number }>(events, {
      cookie: u.cookie,
      body: { events: [ev("info_level_open"), ev("panel_expand", { caseId: C001, caseVersion: 1, payload: { groups: ["valuationDetail"] } }), ev("concept_path_view")] },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ accepted: 3, duplicates: 0, rejected: 0 });
    const rows = await db().event.findMany({ where: { userId: u.userId }, select: { event: true } });
    expect(rows.map((x) => x.event).sort()).toEqual([...names].sort());
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
  const report = (over: Record<string, unknown> = {}) => ({ clientReportId: uuid(), caseId: C001, caseVersion: 1, category: "other", note: null, ...over });

  it("카드 버전과 함께 접수 201, 없는 카드 404, 모르는 유형 422", async () => {
    const u = await createUser("신고");
    const r = await call<{ ok: boolean; reportId: string }>(reports, { cookie: u.cookie, body: report({ category: "data_error", note: "PER이 공시와 달라요" }) });
    expect(r.status).toBe(201);
    expect(r.json.ok).toBe(true);
    const row = await db().report.findUniqueOrThrow({ where: { id: r.json.reportId } });
    expect(row).toMatchObject({ caseVersion: 1, category: "data_error", status: "open" });
    expect((await call(reports, { cookie: u.cookie, body: report({ caseId: uuid() }) })).status).toBe(404);
    expect((await call(reports, { cookie: u.cookie, body: report({ category: "spam" }) })).status).toBe(422);
    expect((await call(reports, { cookie: u.cookie, body: report({ caseVersion: 9 }) })).status).toBe(422);
  });

  it("clientReportId 멱등: 첫 접수 201, 같은 id 재전송 200 + 같은 reportId(행 1개)", async () => {
    const u = await createUser("신고멱등");
    const body = report({ category: "missing_info", note: "출처가 빠졌어요" });
    const first = await call<{ ok: boolean; reportId: string }>(reports, { cookie: u.cookie, body });
    expect(first.status).toBe(201);
    const again = await call<{ ok: boolean; reportId: string }>(reports, { cookie: u.cookie, body });
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ ok: true, reportId: first.json.reportId });
    expect(await db().report.count({ where: { userId: u.userId } })).toBe(1);
    expect(await db().report.findUniqueOrThrow({ where: { id: first.json.reportId } })).toMatchObject({ clientReportId: body.clientReportId, category: "missing_info" });
    // 같은 사용자가 같은 id를 다른 카드에 쓰면 409(신고를 섞지 않는다)
    const misuse = await call(reports, { cookie: u.cookie, body: { ...body, caseId: C002 } });
    expect(misuse.status).toBe(409);
    expect((misuse.json as { error: { code: string } }).error.code).toBe("report_conflict");
    expect(await db().report.count({ where: { userId: u.userId } })).toBe(1);
  });

  it("다른 사용자는 같은 clientReportId를 써도 따로 접수된다", async () => {
    const a = await createUser("신고A");
    const b = await createUser("신고B");
    const body = report();
    const ra = await call<{ reportId: string }>(reports, { cookie: a.cookie, body });
    const rb = await call<{ reportId: string }>(reports, { cookie: b.cookie, body });
    expect([ra.status, rb.status]).toEqual([201, 201]);
    expect(ra.json.reportId).not.toBe(rb.json.reportId);
    expect(await db().report.count({ where: { clientReportId: body.clientReportId } })).toBe(2);
  });

  it("같은 신고를 동시에 보내도 1행(하나는 201, 하나는 200 같은 reportId)", async () => {
    const u = await createUser("신고동시");
    const body = report();
    const rs = await Promise.all([1, 2, 3].map(() => call<{ reportId: string }>(reports, { cookie: u.cookie, body })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(rs.map((r) => r.json.reportId)).size).toBe(1);
    expect(await db().report.count({ where: { userId: u.userId } })).toBe(1);
  });

  it("clientReportId가 없거나 uuid가 아니면 422(.strict() 본문)", async () => {
    const u = await createUser("신고형식");
    const without: Record<string, unknown> = report();
    delete without.clientReportId;
    expect((await call(reports, { cookie: u.cookie, body: without })).status).toBe(422);
    expect((await call(reports, { cookie: u.cookie, body: report({ clientReportId: "abc" }) })).status).toBe(422);
    expect((await call(reports, { cookie: u.cookie, body: report({ clientReportId: null }) })).status).toBe(422);
    expect(await db().report.count({ where: { userId: u.userId } })).toBe(0);
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

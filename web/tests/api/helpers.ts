import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { expect } from "vitest";
import { createSession, sessionCookieName } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const ORIGIN = "http://localhost:3000";

/** 시드된 시험 카드 */
export const CANARY_CASE = "8be0bf0e-3014-4d6a-9021-f3b3dad37688";
export const C001 = "0bde43b6-e233-4bcc-b6af-320c84f10330"; // 난이도 2
export const C002 = "994ebb34-1442-48cf-a776-2ea3b1003108";
export const C003 = "696bab49-3ad3-4cde-93b3-a4cd832586c2"; // 난이도 1(개념 확인 없음)

/** 카나리 값: 판단 전 응답 원문에 하나라도 나오면 실패 */
export const CANARY_STRINGS = ["CANARY-회사", "CNRY", "2099-01-02", "42.42"] as const;

export function expectNoCanary(text: string, where: string): void {
  for (const s of CANARY_STRINGS) expect(text.includes(s), `${where}에 카나리 값 '${s}'`).toBe(false);
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export interface CallResult<T = unknown> {
  status: number;
  text: string;
  json: T;
  headers: Headers;
}

export async function call<T = unknown>(
  handler: (req: NextRequest, ctx: never) => Promise<Response>,
  opts: {
    method?: string;
    path?: string;
    body?: unknown;
    rawBody?: string;
    cookie?: string;
    origin?: string | null;
    contentType?: string | null;
    headers?: Record<string, string>;
    params?: Record<string, string>;
  } = {},
): Promise<CallResult<T>> {
  const method = opts.method ?? (opts.body !== undefined || opts.rawBody !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (method !== "GET" && opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  const bodyText = opts.rawBody ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined);
  if (bodyText !== undefined && opts.contentType !== null) headers["content-type"] = opts.contentType ?? "application/json";
  const req = new NextRequest(new URL(opts.path ?? "/api/test", ORIGIN), { method, headers, body: bodyText });
  const res = await (handler as unknown as Handler)(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json: json as T, headers: res.headers };
}

/** DB에 직접 사용자 + 세션을 만든다(초대 흐름은 auth 시험에서 따로 본다). */
export async function createUser(nickname = "시험"): Promise<{ userId: string; cookie: string }> {
  const prisma = db();
  const user = await prisma.user.create({ data: { nickname, tz: "Asia/Seoul" } });
  const { token } = await createSession(prisma, user.id);
  return { userId: user.id, cookie: `${sessionCookieName()}=${token}` };
}

export function judgmentBody(caseId: string, over: Record<string, unknown> = {}) {
  return {
    caseId,
    caseVersion: 1,
    keyEvidenceId: caseId === CANARY_CASE ? "ev-a" : "ev-rev",
    riskId: null,
    direction: "outperform",
    confidence: 3,
    recognized: false,
    panelsViewed: ["numbers"],
    gesture: { via: "button" },
    isExtra: false,
    ...over,
  };
}

export const uuid = () => randomUUID();

/** 사용자 자료만 비운다(카드·개념은 남긴다). 시험 DB에서만. */
export async function resetUserData(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!new URL(url).pathname.endsWith("_test")) throw new Error("시험 DB가 아니면 비우지 않는다");
  await db().$executeRawUnsafe(
    `TRUNCATE "users", "invites", "sessions_auth", "judgments", "judgment_outcomes", "ai_dialogs", "ai_usage_daily",
      "concept_progress", "quiz_attempts", "daily_sessions", "reports", "events", "rate_limits" RESTART IDENTITY CASCADE`,
  );
}

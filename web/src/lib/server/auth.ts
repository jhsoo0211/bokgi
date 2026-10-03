import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { db, type Db } from "./db";
import { env } from "./env";
import { Errors } from "./http";
import { hashToken, newToken } from "./crypto";
import { isValidTz } from "./time";

export { hashInviteCode, hashToken, normalizeInviteCode, sha256Hex } from "./crypto";

/**
 * DB 세션 하나(05 §2). 쿠키에는 토큰 원문, DB(sessions_auth.token_hash)에는 sha256만 둔다.
 * 쿠키 이름: PUBLIC_ORIGIN이 https면 `__Host-bokgi_sid`(Secure·Path=/·Domain 없음 — 접두사 규칙).
 * http 개발 환경에서는 브라우저가 Secure 없는 `__Host-` 쿠키를 버리므로 `bokgi_sid`를 쓴다.
 */
export const SESSION_DAYS = 180;
const HOST_COOKIE = "__Host-bokgi_sid";
const DEV_COOKIE = "bokgi_sid";

export function isSecureCookie(): boolean {
  return env.publicOrigin().startsWith("https://");
}

export function sessionCookieName(): string {
  return isSecureCookie() ? HOST_COOKIE : DEV_COOKIE;
}

export interface AuthedUser {
  id: string;
  nickname: string;
  tz: string;
  onboardedAt: Date | null;
  tokenHash: string;
}

export function userTz(tz: string | null | undefined): string {
  return tz && isValidTz(tz) ? tz : env.appTz();
}

/** 새 세션(로그인 때마다 새 토큰). */
export async function createSession(tx: Db, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await tx.sessionAuth.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date): void {
  res.cookies.set({
    name: sessionCookieName(),
    value: token,
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: sessionCookieName(),
    value: "",
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function readToken(req: NextRequest): string | null {
  const v = req.cookies.get(sessionCookieName())?.value;
  return v && v.length >= 20 && v.length <= 128 ? v : null;
}

/** 세션이 있으면 사용자, 없으면 null. 미들웨어가 아니라 핸들러에서 매번 확인한다. */
export async function currentUser(req: NextRequest): Promise<AuthedUser | null> {
  const token = readToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const s = await db().sessionAuth.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!s || s.revokedAt || s.expiresAt.getTime() <= Date.now()) return null;
  return { id: s.user.id, nickname: s.user.nickname, tz: userTz(s.user.tz), onboardedAt: s.user.onboardedAt, tokenHash };
}

export async function requireUser(req: NextRequest): Promise<AuthedUser> {
  const u = await currentUser(req);
  if (!u) throw Errors.unauthorized();
  return u;
}

/** 로그아웃: 세션 폐기(되돌릴 수 없음). 쿠키가 없거나 이미 폐기됐어도 성공으로 본다. */
export async function revokeSession(req: NextRequest): Promise<void> {
  const token = readToken(req);
  if (!token) return;
  await db().sessionAuth.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

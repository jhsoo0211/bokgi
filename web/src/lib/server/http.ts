import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { env } from "./env";

/**
 * API 공통: 오류 봉투 {error:{code,message}}, Cache-Control: private, no-store,
 * 비GET은 Origin === PUBLIC_ORIGIN 과 application/json 만 받는다(05 §4).
 * 오류 문구는 고정 문장만 쓴다 — 입력값·DB 값(결과급 값 포함)을 오류 본문에 되풀이하지 않는다.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  badRequest: (code = "bad_request", message = "요청을 처리할 수 없어요.") => new ApiError(400, code, message),
  badJson: () => new ApiError(400, "bad_json", "요청 본문을 읽을 수 없어요."),
  unauthorized: () => new ApiError(401, "unauthorized", "로그인이 필요해요."),
  forbiddenOrigin: () => new ApiError(403, "forbidden_origin", "허용되지 않은 요청이에요."),
  notFound: () => new ApiError(404, "not_found", "찾을 수 없어요."),
  conflict: (code: string, message: string) => new ApiError(409, code, message),
  tooLarge: () => new ApiError(413, "payload_too_large", "요청이 너무 커요."),
  unsupportedMedia: () => new ApiError(415, "unsupported_media_type", "JSON 형식으로 보내 주세요."),
  validation: (code = "validation_failed", message = "요청 형식이 올바르지 않아요.") => new ApiError(422, code, message),
  rateLimited: (retryAfterSec: number) => new ApiError(429, "rate_limited", "잠시 뒤에 다시 시도해 주세요.", retryAfterSec),
  internal: () => new ApiError(500, "internal", "잠시 뒤에 다시 시도해 주세요."),
};

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export function json<T>(data: T, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(data, { status: init.status ?? 200, headers: { ...BASE_HEADERS, ...init.headers } });
}

/** 계약 스키마로 응답을 한 번 더 걸러 보낸다(.strict() — 모르는 키가 섞이면 500으로 막힌다). */
export function contractJson<S extends z.ZodType>(schema: S, data: z.input<S>, init: { status?: number } = {}): NextResponse {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    logError("contract", new Error(`response failed contract: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`));
    throw Errors.internal();
  }
  return json(parsed.data, init);
}

export function errorResponse(err: ApiError): NextResponse {
  const headers: Record<string, string> = {};
  if (err.status === 429 && err.retryAfterSec !== undefined) headers["Retry-After"] = String(Math.max(1, Math.ceil(err.retryAfterSec)));
  return json({ error: { code: err.code, message: err.message } }, { status: err.status, headers });
}

function logError(where: string, e: unknown): void {
  if (env.isProduction()) {
    // 운영 로그에는 이름·코드만 남긴다(Prisma 오류 문구에는 쿼리 인자가 섞일 수 있다)
    const name = e instanceof Error ? e.name : typeof e;
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    console.error(`[api] ${where} ${name} ${code}`.trim());
  } else {
    console.error(`[api] ${where}`, e);
  }
}

/** 핸들러 감싸기: 예상한 오류는 봉투로, 나머지는 고정 문구 500으로. */
export function route<C = unknown>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status >= 500) logError(req.nextUrl.pathname, e);
        return errorResponse(e);
      }
      logError(req.nextUrl.pathname, e);
      return errorResponse(Errors.internal());
    }
  };
}

/** 비GET: Origin은 PUBLIC_ORIGIN과 정확히 같아야 한다(같은 사이트 *.ifsave.com 의 다른 앱 차단). */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin || origin.replace(/\/+$/, "") !== env.publicOrigin()) throw Errors.forbiddenOrigin();
}

function isJsonContentType(req: Request): boolean {
  const ct = req.headers.get("content-type");
  if (!ct) return false;
  return ct.split(";")[0].trim().toLowerCase() === "application/json";
}

/** 본문이 없는 비GET(공개·로그아웃): Origin 확인, 본문이 있으면 JSON이어야 한다. */
export function assertMutation(req: Request): void {
  assertSameOrigin(req);
  // 서버가 받은 요청은 본문이 없어도 빈 스트림을 가질 수 있어 헤더로 판단한다
  const len = req.headers.get("content-length");
  const hasBody = len !== null ? Number(len) > 0 : req.headers.get("transfer-encoding") !== null;
  if (hasBody && !isJsonContentType(req)) throw Errors.unsupportedMedia();
}

/** 비GET 본문: Origin → content-type → 크기 → JSON → 스키마(422). */
export async function readJson<S extends z.ZodType>(req: Request, schema: S, maxBytes = 16 * 1024): Promise<z.output<S>> {
  assertSameOrigin(req);
  if (!isJsonContentType(req)) throw Errors.unsupportedMedia();
  const declared = req.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) throw Errors.tooLarge();
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw Errors.tooLarge();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw Errors.badJson();
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw Errors.validation();
  return parsed.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 경로의 id가 uuid가 아니면 404(존재 여부를 흘리지 않는다). */
export function uuidParam(id: string | undefined): string {
  if (!id || !UUID_RE.test(id)) throw Errors.notFound();
  return id.toLowerCase();
}

export type IdContext = { params: Promise<{ id: string }> };

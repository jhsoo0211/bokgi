import { Errors, errorResponse } from "@/lib/server/http";

/** 없는 /api/* 경로도 JSON 오류 봉투(404)로 답한다. */
const notFound = async () => errorResponse(Errors.notFound());

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;

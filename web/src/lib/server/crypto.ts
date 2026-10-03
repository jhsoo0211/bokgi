import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";

/** 해시·토큰·초대 코드(스크립트에서도 쓰므로 next/* 를 가져오지 않는다) */
export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export const hashToken = sha256Hex;

/** 초대 코드: 공백·하이픈 무시, 대문자로 */
export function normalizeInviteCode(code: string): string {
  return code.replace(/[\s-]+/g, "").toUpperCase();
}

export function hashInviteCode(code: string): string {
  return sha256Hex(`invite:${normalizeInviteCode(code)}`);
}

/** 사람이 옮겨 적기 쉬운 코드(Crockford base32, I·L·O·U 없음): XXXX-XXXX-XXXX (60비트) */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function generateInviteCode(): string {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

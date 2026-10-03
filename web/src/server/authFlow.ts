import "server-only";
import type { InviteBody } from "@/shared/contract";
import type { z } from "zod";
import { createSession, hashInviteCode } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { ApiError, Errors } from "@/lib/server/http";
import type { User } from "@/server/generated/prisma/client";

/** 실패 문구는 하나(없는 코드·쓴 코드·만료 코드를 구분해 알려 주지 않는다) */
export const INVITE_INVALID = () => new ApiError(400, "invite_invalid", "초대 코드를 확인해 주세요.");

export function cleanNickname(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060-\u206F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 초대 코드 소비 → (새 사용자 | 재발급 코드면 기존 사용자) → 세션 생성을 한 트랜잭션에서.
 * 소비는 조건부 UPDATE(used_at IS NULL AND 만료 전)라 같은 코드를 동시에 두 번 써도 한 번만 성공한다.
 */
export async function redeemInvite(body: z.infer<typeof InviteBody>): Promise<{ user: User; token: string; expiresAt: Date }> {
  const nickname = cleanNickname(body.nickname);
  if (nickname.length < 1 || nickname.length > 20) throw Errors.validation("invalid_nickname", "닉네임은 1~20자로 적어 주세요.");
  const codeHash = hashInviteCode(body.code);
  return db().$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.invite.updateMany({
      where: { codeHash, usedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw INVITE_INVALID();
    const invite = await tx.invite.findUniqueOrThrow({ where: { codeHash } });
    let user: User;
    if (invite.forUserId) {
      const existing = await tx.user.findUnique({ where: { id: invite.forUserId } });
      if (!existing) throw INVITE_INVALID();
      user = existing;
    } else {
      user = await tx.user.create({ data: { nickname, tz: env.appTz() } });
      await tx.invite.update({ where: { codeHash }, data: { usedBy: user.id } });
    }
    const s = await createSession(tx, user.id);
    return { user, ...s };
  });
}

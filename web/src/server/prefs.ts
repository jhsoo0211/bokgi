import "server-only";
import type { InfoLevel, Me, PrefsBody } from "@/shared/contract";
import type { z } from "zod";
import { userTz, type AuthedUser } from "@/lib/server/auth";
import { db, Prisma } from "@/lib/server/db";
import { Errors } from "@/lib/server/http";
import { effectivePrefs, normalizePrefs, undoSecondsOf } from "./rules";

type MeT = z.infer<typeof Me>;
type PrefsBodyT = z.infer<typeof PrefsBody>;

/** Me를 만들 수 있는 사용자 모양(AuthedUser 또는 users 행) */
export interface MeSource {
  id: string;
  nickname: string;
  tz: string;
  onboardedAt: Date | null;
  infoLevel: InfoLevel;
  panelPrefs: unknown;
  undoSeconds: number | { toNumber(): number };
}

/**
 * GET /api/me · POST /api/auth/invite · PUT /api/me/prefs 공용 응답.
 * panelPrefs는 '실제로 쓸 토글'이다: custom이면 저장된 토글, 프리셋 수준이면 그 프리셋 값(DB에는 NULL).
 */
export function meOf(u: MeSource): MeT {
  const undo = typeof u.undoSeconds === "number" ? u.undoSeconds : u.undoSeconds.toNumber();
  return {
    user: {
      id: u.id,
      nickname: u.nickname,
      onboarded: u.onboardedAt !== null,
      tz: userTz(u.tz),
      infoLevel: u.infoLevel,
      panelPrefs: effectivePrefs(u.infoLevel, u.panelPrefs),
      undoSeconds: undoSecondsOf(undo),
    },
  };
}

/**
 * PUT /api/me/prefs — rules.normalizePrefs로 정규화해 저장(멱등: 같은 본문을 다시 보내도 같은 행·같은 응답).
 * custom인데 panelPrefs가 없으면 422 validation_failed. undoSeconds를 생략하면 그대로 둔다.
 */
export async function updatePrefs(user: AuthedUser, body: PrefsBodyT): Promise<MeT> {
  const n = normalizePrefs(body.infoLevel, body.panelPrefs);
  if (!n) throw Errors.validation();
  const row = await db().user.update({
    where: { id: user.id },
    data: {
      infoLevel: n.infoLevel,
      panelPrefs: n.panelPrefs ?? Prisma.DbNull,
      ...(body.undoSeconds !== undefined ? { undoSeconds: body.undoSeconds } : {}),
    },
  });
  return meOf(row);
}

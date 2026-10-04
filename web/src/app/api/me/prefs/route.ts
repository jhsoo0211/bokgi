import { Me, PrefsBody } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { contractJson, readJson, route } from "@/lib/server/http";
import { updatePrefs } from "@/server/prefs";

/**
 * PUT /api/me/prefs {infoLevel, panelPrefs?, undoSeconds?} → Me(200).
 * custom이 아니면 panelPrefs는 무시(프리셋), custom이면 필수(없으면 422), 프리셋과 같은 토글이면 그 수준으로 저장. 멱등.
 */
export const PUT = route(async (req) => {
  const body = await readJson(req, PrefsBody, 2 * 1024);
  const user = await requireUser(req);
  return contractJson(Me, await updatePrefs(user, body));
});

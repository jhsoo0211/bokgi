import { QuizBody, QuizResult } from "@/shared/contract";
import { requireUser } from "@/lib/server/auth";
import { Errors, contractJson, readJson, route, type IdContext } from "@/lib/server/http";
import { answerQuiz } from "@/server/concepts";

const CONCEPT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** POST /api/concepts/{id}/quiz — 서버 채점, clientAttemptId 멱등, 다음 복습일 */
export const POST = route<IdContext>(async (req, ctx) => {
  const body = await readJson(req, QuizBody, 2 * 1024);
  const user = await requireUser(req);
  const { id } = await ctx.params;
  if (!CONCEPT_ID.test(id)) throw Errors.notFound();
  return contractJson(QuizResult, await answerQuiz(user, id, body));
});

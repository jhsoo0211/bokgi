-- DropIndex
DROP INDEX "quizzes_concept_id_ord_key";

-- CreateIndex
CREATE INDEX "quizzes_concept_id_idx" ON "quizzes"("concept_id");

-- 손으로 더한 부분: 문제 순서는 active 문제 사이에서만 유일. 시드는 개념의 문제를 먼저 비활성으로 돌리고
-- 개념 파일의 목록을 다시 활성으로 upsert한다(목록에서 빠진 문제는 지우지 않고 active=false로 남는다).
CREATE UNIQUE INDEX "quizzes_active_concept_ord_key" ON "quizzes" ("concept_id", "ord") WHERE "active";

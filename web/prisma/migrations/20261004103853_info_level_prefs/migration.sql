-- 2차(2026-10-04, D16·D17·D18): 정보 수준·되돌리기 시간·판단 때 수준·신고 멱등·개념 갈래 안 순서. 모두 추가형.

-- CreateEnum
CREATE TYPE "info_level" AS ENUM ('basic', 'standard', 'advanced', 'custom');

-- AlterTable
ALTER TABLE "concepts" ALTER COLUMN "ord" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "info_level" "info_level" NOT NULL DEFAULT 'standard',
ADD COLUMN     "panel_prefs" JSONB,
ADD COLUMN     "undo_seconds" DECIMAL(3,1) NOT NULL DEFAULT 2.5;

-- AlterTable
ALTER TABLE "judgments" ADD COLUMN     "hidden_groups" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "info_level" "info_level" NOT NULL DEFAULT 'standard';

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "client_report_id" UUID;

-- ============================================================================
-- 손으로 더한 부분: 자료 고침, CHECK 제약, 부분 인덱스 (Prisma 스키마로 선언되지 않는다)
-- ============================================================================

-- 개념 순서: 지금까지 ord는 개념 파일 전체의 나열 순서(0부터)였다 → 갈래 안 순서(1부터, 계약 ConceptListItem.order).
-- 같은 파일 순서를 갈래별로 다시 센 것이라 다음 시드가 계산할 값과 같다(active 개념이 먼저 1..n).
UPDATE "concepts" AS c
SET "ord" = s."rn"
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "branch" ORDER BY "active" DESC, "ord", "id") AS "rn"
  FROM "concepts"
) AS s
WHERE c."id" = s."id";

ALTER TABLE "concepts"
  ADD CONSTRAINT "concepts_ord_check" CHECK ("ord" >= 1);

-- 정보 수준: panel_prefs가 NULL이면 info_level의 프리셋이고, custom일 때만 묶음 토글 객체를 둔다.
ALTER TABLE "users"
  ADD CONSTRAINT "users_panel_prefs_check" CHECK (("info_level" = 'custom') = ("panel_prefs" IS NOT NULL)),
  ADD CONSTRAINT "users_panel_prefs_object_check" CHECK ("panel_prefs" IS NULL OR jsonb_typeof("panel_prefs") = 'object'),
  ADD CONSTRAINT "users_undo_seconds_check" CHECK ("undo_seconds" IN (2.5, 5, 10));

-- 판단 때 숨겨져 있던 묶음: 이름 배열(이름 검사는 계약 InfoGroup — 묶음이 늘어도 이 제약은 그대로)
ALTER TABLE "judgments"
  ADD CONSTRAINT "judgments_hidden_groups_check" CHECK (jsonb_typeof("hidden_groups") = 'array');

-- 신고 멱등: 같은 사용자의 같은 client_report_id는 한 행(예전 행은 NULL이라 제외). 사용자가 다르면 같은 id를 써도 된다.
CREATE UNIQUE INDEX "reports_user_client_report_key" ON "reports" ("user_id", "client_report_id") WHERE "client_report_id" IS NOT NULL;

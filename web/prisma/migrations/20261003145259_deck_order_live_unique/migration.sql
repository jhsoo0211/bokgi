-- AlterEnum
ALTER TYPE "case_status" ADD VALUE 'reviewed';

-- DropIndex
DROP INDEX "cases_deck_order_key";

-- 손으로 더한 부분: 덱 순서는 live 카드 사이에서만 유일(카드 원본 스키마 content/schema/card.schema.json의 규칙).
-- 초안(draft·reviewed)·내린 카드(retired)는 덱 순서가 겹쳐도 된다.
DROP INDEX "cases_live_deck_order_idx";
CREATE UNIQUE INDEX "cases_live_deck_order_key" ON "cases" ("deck_order") WHERE "status" = 'live';

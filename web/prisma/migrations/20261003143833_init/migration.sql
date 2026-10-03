-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('draft', 'live', 'retired');

-- CreateEnum
CREATE TYPE "panel_kind" AS ENUM ('flow', 'numbers', 'then');

-- CreateEnum
CREATE TYPE "direction" AS ENUM ('outperform', 'underperform');

-- CreateEnum
CREATE TYPE "result_state" AS ENUM ('ahead', 'behind', 'even');

-- CreateEnum
CREATE TYPE "self_check" AS ENUM ('o', 'tri', 'x');

-- CreateEnum
CREATE TYPE "concept_branch" AS ENUM ('outcome', 'numbers', 'then', 'self');

-- CreateEnum
CREATE TYPE "concept_state" AS ENUM ('new', 'learning', 'review', 'known');

-- CreateEnum
CREATE TYPE "quiz_via" AS ENUM ('reveal', 'review', 'concepts');

-- CreateEnum
CREATE TYPE "report_category" AS ENUM ('data_error', 'identifiable', 'missing_info', 'outcome_explanation', 'concept_unclear', 'source_error', 'ai_as_fact', 'other');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('open', 'triaged', 'fixed', 'rejected');

-- CreateEnum
CREATE TYPE "ai_role" AS ENUM ('questioner', 'explainer');

-- CreateEnum
CREATE TYPE "ai_source" AS ENUM ('template', 'llm');

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "year_public" INTEGER NOT NULL,
    "sector_public" TEXT NOT NULL,
    "size_bucket" TEXT NOT NULL,
    "horizon_days" INTEGER NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "status" "case_status" NOT NULL DEFAULT 'draft',
    "deck_order" INTEGER NOT NULL,
    "evidence_options" JSONB NOT NULL,
    "risk_options" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_blocks" (
    "case_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "panel_kind" NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "case_blocks_pkey" PRIMARY KEY ("case_id","version","kind")
);

-- CreateTable
CREATE TABLE "concepts" (
    "id" TEXT NOT NULL,
    "branch" "concept_branch" NOT NULL,
    "title" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "ord" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" TEXT NOT NULL,
    "concept_id" TEXT NOT NULL,
    "ord" INTEGER NOT NULL DEFAULT 0,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "answer_index" INTEGER NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_outcomes" (
    "case_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "company_name" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "period" TEXT NOT NULL,
    "start_price" DECIMAL(14,4),
    "end_price" DECIMAL(14,4),
    "return_pct" DECIMAL(10,4) NOT NULL,
    "bench_return_pct" DECIMAL(10,4) NOT NULL,
    "sector_return_pct" DECIMAL(10,4),
    "bench_name" TEXT NOT NULL,
    "price_path" JSONB NOT NULL,
    "bench_path" JSONB NOT NULL,
    "sources" JSONB NOT NULL,

    CONSTRAINT "case_outcomes_pkey" PRIMARY KEY ("case_id","version")
);

-- CreateTable
CREATE TABLE "case_reveal" (
    "case_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "key_points" JSONB NOT NULL,

    CONSTRAINT "case_reveal_pkey" PRIMARY KEY ("case_id","version")
);

-- CreateTable
CREATE TABLE "case_learning_points" (
    "case_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "concept_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "link_sentence" TEXT NOT NULL,

    CONSTRAINT "case_learning_points_pkey" PRIMARY KEY ("case_id","version","concept_id")
);

-- CreateTable
CREATE TABLE "case_internal" (
    "case_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "leak_terms" JSONB NOT NULL,
    "data_cutoff" DATE,

    CONSTRAINT "case_internal_pkey" PRIMARY KEY ("case_id","version")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nickname" TEXT NOT NULL,
    "tz" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboarded_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "code_hash" TEXT NOT NULL,
    "label" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "used_at" TIMESTAMPTZ(3),
    "used_by" UUID,
    "for_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("code_hash")
);

-- CreateTable
CREATE TABLE "sessions_auth" (
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_auth_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateTable
CREATE TABLE "judgments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "case_version" INTEGER NOT NULL,
    "local_date" DATE NOT NULL,
    "key_evidence_id" TEXT NOT NULL,
    "key_evidence" TEXT NOT NULL,
    "risk_id" TEXT,
    "risk_factor" TEXT,
    "direction" "direction" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "recognized" BOOLEAN NOT NULL DEFAULT false,
    "self_check" "self_check",
    "self_check_at" TIMESTAMPTZ(3),
    "is_extra" BOOLEAN NOT NULL DEFAULT false,
    "panels_viewed" JSONB NOT NULL DEFAULT '[]',
    "gesture" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealed_at" TIMESTAMPTZ(3),

    CONSTRAINT "judgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judgment_outcomes" (
    "judgment_id" UUID NOT NULL,
    "relative_pp" DECIMAL(8,2) NOT NULL,
    "state" "result_state" NOT NULL,
    "hit" BOOLEAN,
    "scored_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judgment_outcomes_pkey" PRIMARY KEY ("judgment_id")
);

-- CreateTable
CREATE TABLE "ai_dialogs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "judgment_id" UUID,
    "role" "ai_role" NOT NULL,
    "source" "ai_source" NOT NULL,
    "template_type" INTEGER,
    "text" TEXT NOT NULL,
    "guard" JSONB,
    "latency_ms" INTEGER,
    "local_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_dialogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_daily" (
    "day" DATE NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "concept_progress" (
    "user_id" UUID NOT NULL,
    "concept_id" TEXT NOT NULL,
    "state" "concept_state" NOT NULL DEFAULT 'new',
    "level" INTEGER NOT NULL DEFAULT 0,
    "due_on" DATE,
    "quiz_correct" INTEGER NOT NULL DEFAULT 0,
    "quiz_total" INTEGER NOT NULL DEFAULT 0,
    "last_seen" TIMESTAMPTZ(3),

    CONSTRAINT "concept_progress_pkey" PRIMARY KEY ("user_id","concept_id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "concept_id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "option_index" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "via" "quiz_via" NOT NULL,
    "level_before" INTEGER,
    "level_after" INTEGER NOT NULL,
    "state_after" "concept_state" NOT NULL,
    "due_on_after" DATE NOT NULL,
    "local_date" DATE NOT NULL,
    "client_attempt_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_sessions" (
    "user_id" UUID NOT NULL,
    "local_date" DATE NOT NULL,
    "case_ids" UUID[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_sessions_pkey" PRIMARY KEY ("user_id","local_date")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "case_version" INTEGER NOT NULL,
    "category" "report_category" NOT NULL,
    "note" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "session_id" UUID,
    "event" TEXT NOT NULL,
    "case_id" UUID,
    "case_version" INTEGER,
    "payload" JSONB,
    "client_event_id" UUID NOT NULL,
    "ts" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cases_deck_order_key" ON "cases"("deck_order");

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_concept_id_ord_key" ON "quizzes"("concept_id", "ord");

-- CreateIndex
CREATE UNIQUE INDEX "case_learning_points_case_id_version_rank_key" ON "case_learning_points"("case_id", "version", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "invites_used_by_key" ON "invites"("used_by");

-- CreateIndex
CREATE INDEX "sessions_auth_user_id_idx" ON "sessions_auth"("user_id");

-- CreateIndex
CREATE INDEX "judgments_user_id_created_at_idx" ON "judgments"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "judgments_user_id_local_date_idx" ON "judgments"("user_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "judgments_user_id_case_id_key" ON "judgments"("user_id", "case_id");

-- CreateIndex
CREATE INDEX "ai_dialogs_user_id_case_id_role_idx" ON "ai_dialogs"("user_id", "case_id", "role");

-- CreateIndex
CREATE INDEX "ai_dialogs_user_id_local_date_role_idx" ON "ai_dialogs"("user_id", "local_date", "role");

-- CreateIndex
CREATE INDEX "quiz_attempts_user_id_via_local_date_idx" ON "quiz_attempts"("user_id", "via", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_user_id_client_attempt_id_key" ON "quiz_attempts"("user_id", "client_attempt_id");

-- CreateIndex
CREATE INDEX "reports_case_id_case_version_idx" ON "reports"("case_id", "case_version");

-- CreateIndex
CREATE INDEX "events_user_id_ts_idx" ON "events"("user_id", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "events_user_id_client_event_id_key" ON "events"("user_id", "client_event_id");

-- AddForeignKey
ALTER TABLE "case_blocks" ADD CONSTRAINT "case_blocks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_outcomes" ADD CONSTRAINT "case_outcomes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_reveal" ADD CONSTRAINT "case_reveal_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_learning_points" ADD CONSTRAINT "case_learning_points_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_learning_points" ADD CONSTRAINT "case_learning_points_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_internal" ADD CONSTRAINT "case_internal_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_for_user_id_fkey" FOREIGN KEY ("for_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions_auth" ADD CONSTRAINT "sessions_auth_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judgments" ADD CONSTRAINT "judgments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judgments" ADD CONSTRAINT "judgments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judgment_outcomes" ADD CONSTRAINT "judgment_outcomes_judgment_id_fkey" FOREIGN KEY ("judgment_id") REFERENCES "judgments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_dialogs" ADD CONSTRAINT "ai_dialogs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_dialogs" ADD CONSTRAINT "ai_dialogs_judgment_id_fkey" FOREIGN KEY ("judgment_id") REFERENCES "judgments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_progress" ADD CONSTRAINT "concept_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_progress" ADD CONSTRAINT "concept_progress_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sessions" ADD CONSTRAINT "daily_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- 손으로 더한 부분: CHECK 제약과 부분 인덱스 (Prisma 스키마로 선언되지 않는다)
-- ============================================================================

-- ① 판단 전
ALTER TABLE "cases"
  ADD CONSTRAINT "cases_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "cases_year_public_check" CHECK ("year_public" BETWEEN 1900 AND 2100),
  ADD CONSTRAINT "cases_size_bucket_check" CHECK ("size_bucket" IN ('소형', '중형', '대형')),
  ADD CONSTRAINT "cases_horizon_days_check" CHECK ("horizon_days" IN (90, 180, 365)),
  ADD CONSTRAINT "cases_difficulty_check" CHECK ("difficulty" BETWEEN 1 AND 5),
  ADD CONSTRAINT "cases_evidence_options_check" CHECK (jsonb_typeof("evidence_options") = 'array' AND jsonb_array_length("evidence_options") BETWEEN 3 AND 8),
  ADD CONSTRAINT "cases_risk_options_check" CHECK (jsonb_typeof("risk_options") = 'array' AND jsonb_array_length("risk_options") BETWEEN 2 AND 6);

ALTER TABLE "case_blocks"
  ADD CONSTRAINT "case_blocks_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "case_blocks_payload_check" CHECK (jsonb_typeof("payload") = 'object');

ALTER TABLE "quizzes"
  ADD CONSTRAINT "quizzes_options_check" CHECK (jsonb_typeof("options") = 'array' AND jsonb_array_length("options") BETWEEN 2 AND 4),
  ADD CONSTRAINT "quizzes_answer_index_check" CHECK ("answer_index" >= 0 AND "answer_index" < jsonb_array_length("options"));

-- ② 공개 뒤
ALTER TABLE "case_outcomes"
  ADD CONSTRAINT "case_outcomes_dates_check" CHECK ("end_date" > "start_date"),
  ADD CONSTRAINT "case_outcomes_price_path_check" CHECK (jsonb_typeof("price_path") = 'array' AND jsonb_array_length("price_path") = 14),
  ADD CONSTRAINT "case_outcomes_bench_path_check" CHECK (jsonb_typeof("bench_path") = 'array' AND jsonb_array_length("bench_path") = 14);

ALTER TABLE "case_reveal"
  ADD CONSTRAINT "case_reveal_key_points_check" CHECK (jsonb_typeof("key_points") = 'array' AND jsonb_array_length("key_points") <= 3);

ALTER TABLE "case_learning_points"
  ADD CONSTRAINT "case_learning_points_rank_check" CHECK ("rank" >= 1);

-- 사용자·인증
ALTER TABLE "users"
  ADD CONSTRAINT "users_nickname_check" CHECK (char_length("nickname") BETWEEN 1 AND 20);

ALTER TABLE "invites"
  ADD CONSTRAINT "invites_used_check" CHECK ("used_by" IS NULL OR "used_at" IS NOT NULL);

ALTER TABLE "sessions_auth"
  ADD CONSTRAINT "sessions_auth_expiry_check" CHECK ("expires_at" > "created_at");

ALTER TABLE "rate_limits"
  ADD CONSTRAINT "rate_limits_hits_check" CHECK ("hits" >= 0);

-- 판단
ALTER TABLE "judgments"
  ADD CONSTRAINT "judgments_confidence_check" CHECK ("confidence" BETWEEN 1 AND 5),
  ADD CONSTRAINT "judgments_case_version_check" CHECK ("case_version" >= 1),
  ADD CONSTRAINT "judgments_risk_pair_check" CHECK (("risk_id" IS NULL) = ("risk_factor" IS NULL)),
  ADD CONSTRAINT "judgments_self_check_after_reveal_check" CHECK ("self_check" IS NULL OR "revealed_at" IS NOT NULL),
  ADD CONSTRAINT "judgments_panels_viewed_check" CHECK (jsonb_typeof("panels_viewed") = 'array');

-- 비슷함(even)은 적중·실패로 세지 않는다: hit는 even일 때만 null (ADR-0002)
ALTER TABLE "judgment_outcomes"
  ADD CONSTRAINT "judgment_outcomes_hit_check" CHECK (("state" = 'even') = ("hit" IS NULL));

-- AI
ALTER TABLE "ai_dialogs"
  ADD CONSTRAINT "ai_dialogs_template_type_check" CHECK ("template_type" IS NULL OR "template_type" BETWEEN 1 AND 6),
  ADD CONSTRAINT "ai_dialogs_latency_check" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0);

ALTER TABLE "ai_usage_daily"
  ADD CONSTRAINT "ai_usage_daily_calls_check" CHECK ("calls" >= 0);

-- 개념·복습
ALTER TABLE "concept_progress"
  ADD CONSTRAINT "concept_progress_level_check" CHECK ("level" BETWEEN 0 AND 3),
  ADD CONSTRAINT "concept_progress_counts_check" CHECK ("quiz_correct" BETWEEN 0 AND "quiz_total");

ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_option_index_check" CHECK ("option_index" BETWEEN 0 AND 3),
  ADD CONSTRAINT "quiz_attempts_level_after_check" CHECK ("level_after" BETWEEN 0 AND 3);

ALTER TABLE "daily_sessions"
  ADD CONSTRAINT "daily_sessions_case_ids_check" CHECK ("case_ids" IS NOT NULL AND cardinality("case_ids") <= 3);

-- 신고·이벤트
ALTER TABLE "reports"
  ADD CONSTRAINT "reports_case_version_check" CHECK ("case_version" >= 1),
  ADD CONSTRAINT "reports_note_check" CHECK ("note" IS NULL OR char_length("note") <= 500);

ALTER TABLE "events"
  ADD CONSTRAINT "events_event_check" CHECK (char_length("event") BETWEEN 1 AND 40);

-- 부분 인덱스
-- 오늘 세트: 미판단 live 카드를 deck_order 순으로
CREATE INDEX "cases_live_deck_order_idx" ON "cases" ("deck_order") WHERE "status" = 'live';
-- 결과 대기 판단
CREATE INDEX "judgments_unrevealed_idx" ON "judgments" ("user_id", "created_at") WHERE "revealed_at" IS NULL;
-- 복습 기한
CREATE INDEX "concept_progress_due_idx" ON "concept_progress" ("user_id", "due_on") WHERE "due_on" IS NOT NULL;
-- AI 해설은 판단당 한 번 생성 후 캐시
CREATE UNIQUE INDEX "ai_dialogs_explainer_judgment_key" ON "ai_dialogs" ("judgment_id") WHERE "role" = 'explainer';

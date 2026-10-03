-- AlterTable
ALTER TABLE "concepts" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

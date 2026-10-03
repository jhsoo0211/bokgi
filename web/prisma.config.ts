/**
 * Prisma 7 설정. 스키마 파일에는 datasource url을 두지 않고 여기서 읽는다.
 * Prisma 7 CLI는 .env를 자동으로 읽지 않으므로 직접 불러온다(이미 있는 환경변수는 덮어쓰지 않는다).
 * DATABASE_URL이 없을 때(예: 이미지 빌드 단계의 `prisma generate`)는 datasource를 비워 둔다.
 */
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});

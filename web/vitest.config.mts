import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);

/** tests/api/testDb.ts와 같은 규칙(설정 파일은 ESM이라 그 파일을 직접 가져오지 않는다) */
function testDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const u = new URL(explicit ?? process.env.DATABASE_URL ?? "postgresql://bokgi:bokgi-dev@127.0.0.1:5434/bokgi");
  if (!explicit) u.pathname = "/bokgi_test";
  if (!u.pathname.endsWith("_test")) throw new Error(`시험 DB 이름은 _test로 끝나야 해요: ${u.pathname}`);
  return u.toString();
}

const alias = {
  "@": `${root}src`,
  // Next 밖(Vitest)에서는 react-server 조건이 없으므로 server-only를 빈 모듈로 바꾼다
  "server-only": `${root}node_modules/server-only/empty.js`,
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "api",
          include: ["tests/api/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/api/globalSetup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
          env: {
            DATABASE_URL: testDatabaseUrl(),
            PUBLIC_ORIGIN: "http://localhost:3000",
            APP_TZ: "Asia/Seoul",
            AI_ENABLED: "false",
            NODE_ENV: "test",
          },
        },
      },
    ],
  },
});

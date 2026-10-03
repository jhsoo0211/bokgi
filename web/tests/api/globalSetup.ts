/**
 * API 시험 준비(한 번): 시험 DB(bokgi_test)가 없으면 만들고 → prisma migrate deploy(추가형, 지우지 않음)
 * → 앱 테이블 비우기(시험 DB만, 이름이 _test로 끝날 때만) → 예시 카드 3장 + 카나리 카드 시드(npm run seed와 같은 코드).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { testDatabaseUrl } from "./testDb";

const root = fileURLToPath(new URL("../..", import.meta.url));

async function ensureDatabase(url: string): Promise<void> {
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, "");
  u.pathname = "/postgres";
  const client = new pg.Client({ connectionString: u.toString() });
  await client.connect();
  try {
    const r = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (r.rowCount === 0) await client.query(`CREATE DATABASE "${name.replace(/"/g, "")}"`);
  } finally {
    await client.end();
  }
}

export async function truncateAll(url: string): Promise<void> {
  if (!new URL(url).pathname.endsWith("_test")) throw new Error("시험 DB가 아니면 비우지 않는다");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const r = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (r.rows.length) await client.query(`TRUNCATE ${r.rows.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  await ensureDatabase(url);
  const env = { ...process.env, DATABASE_URL: url };
  execFileSync(`${root}node_modules/.bin/prisma`, ["migrate", "deploy"], { cwd: root, env, stdio: "pipe" });
  await truncateAll(url);
  execFileSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/seed.ts", "--content", "tests/fixtures/content", "--content", "tests/fixtures/canary"],
    { cwd: root, env, stdio: "pipe" },
  );
}

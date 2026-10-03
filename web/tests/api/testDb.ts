/**
 * API 시험용 DB 주소: TEST_DATABASE_URL이 있으면 그것, 없으면 .env의 DATABASE_URL에서 DB 이름만 bokgi_test로 바꾼다.
 * 이름이 _test로 끝나지 않으면 거절한다(개발·운영 DB를 비우는 사고 방지).
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.TEST_DATABASE_URL;
  const base = explicit ?? env.DATABASE_URL ?? "postgresql://bokgi:bokgi-dev@127.0.0.1:5434/bokgi";
  const u = new URL(base);
  if (!explicit) u.pathname = "/bokgi_test";
  const name = u.pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) throw new Error(`시험 DB 이름은 _test로 끝나야 해요: ${name}`);
  return u.toString();
}

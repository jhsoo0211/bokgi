/**
 * 복기 초대 코드 관리(로컬·운영 compose 네트워크 안에서). 코드 원문은 여기서 한 번만 출력하고 DB에는 해시만 둔다.
 *
 *   npm run invite -- create [--count 5] [--label 베타1] [--expires-days 30]
 *   npm run invite -- recover --user <사용자 uuid | 닉네임> [--expires-days 3]   # 쿠키를 잃은 사용자 재발급(같은 계정)
 *   npm run invite -- list                                                    # 코드 원문 없이 상태만
 *
 * 실행: node --conditions=react-server --import tsx scripts/invite.ts (package.json의 invite 스크립트)
 */
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/server/generated/prisma/client";
import { generateInviteCode, hashInviteCode } from "../src/lib/server/crypto";

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function expiresAt(days: string | undefined, fallback: number | null): Date | null {
  const d = days === undefined ? fallback : Number(days);
  if (d === null) return null;
  if (!Number.isFinite(d) || d <= 0) throw new Error("--expires-days는 양수여야 해요");
  return new Date(Date.now() + d * 86_400_000);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const [cmd, ...rest] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL이 비어 있어요(.env 확인)");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    if (cmd === "create") {
      const count = Number(flag(rest, "--count") ?? "1");
      if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("--count는 1~100");
      const label = flag(rest, "--label") ?? null;
      const exp = expiresAt(flag(rest, "--expires-days"), 30);
      const codes: string[] = [];
      for (let i = 0; i < count; i++) {
        const code = generateInviteCode();
        await prisma.invite.create({ data: { codeHash: hashInviteCode(code), label, expiresAt: exp } });
        codes.push(code);
      }
      console.log(`초대 코드 ${count}개${label ? ` (${label})` : ""}${exp ? `, 만료 ${exp.toISOString().slice(0, 10)}` : ""} — 다시 볼 수 없으니 지금 옮겨 두세요:`);
      for (const c of codes) console.log(`  ${c}`);
    } else if (cmd === "recover") {
      const who = flag(rest, "--user");
      if (!who) throw new Error("--user <uuid|닉네임>이 필요해요");
      const users = UUID_RE.test(who) ? await prisma.user.findMany({ where: { id: who } }) : await prisma.user.findMany({ where: { nickname: who } });
      if (users.length !== 1) throw new Error(users.length === 0 ? "사용자를 찾지 못했어요" : "같은 닉네임이 여럿이에요 — uuid로 지정하세요");
      const exp = expiresAt(flag(rest, "--expires-days"), 3);
      const code = generateInviteCode();
      await prisma.invite.create({ data: { codeHash: hashInviteCode(code), label: "recover", expiresAt: exp, forUserId: users[0].id } });
      console.log(`재발급 코드(같은 계정으로 로그인, 닉네임 입력은 무시됨)${exp ? `, 만료 ${exp.toISOString().slice(0, 10)}` : ""}:`);
      console.log(`  ${code}`);
    } else if (cmd === "list") {
      const rows = await prisma.invite.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
      for (const r of rows) {
        const state = r.usedAt ? `사용 ${r.usedAt.toISOString().slice(0, 10)}` : r.expiresAt && r.expiresAt < new Date() ? "만료" : "미사용";
        console.log(`  ${r.codeHash.slice(0, 8)}…  ${state.padEnd(14)} ${r.label ?? ""}${r.forUserId ? " (재발급)" : ""}`);
      }
      console.log(`총 ${rows.length}개(최근 100개까지)`);
    } else {
      console.log("사용법: npm run invite -- create [--count N] [--label L] [--expires-days D] | recover --user <uuid|닉네임> | list");
      process.exitCode = cmd ? 2 : 0;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(`invite: 실패 — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

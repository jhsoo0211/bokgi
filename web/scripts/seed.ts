/**
 * 복기 시드 — 카드·개념 원본 JSON을 DB에 upsert한다(삭제 없음, 두 번 돌려도 같다).
 *
 *   npm run seed                                   # 기본 콘텐츠 폴더(CONTENT_DIR → ../content → ./content)
 *   npm run seed -- --content tests/fixtures/content   # 예시 자료(프로토타입 카드 3장, 실측 아님)
 *   npm run seed -- --dry-run                      # 검사와 생성·갱신 수만 보고 쓰지 않는다
 *   npm run seed -- --retire-missing               # 콘텐츠에 없는 live 카드는 retired, 개념은 active=false(삭제 아님) — 예시 → 실제 카드로 바꿀 때
 *
 * 카드는 세 등급으로 나뉘어 들어간다: 판단 전(cases·case_blocks) / 공개 뒤(case_outcomes·case_reveal·
 * case_learning_points) / 서버 전용(case_internal). 판단 전 구획에 회사명·티커·누수 낱말·절대 날짜가 있으면 멈춘다.
 * 실행: node --conditions=react-server --import tsx scripts/seed.ts (package.json의 seed 스크립트)
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/server/generated/prisma/client";
import { ContentError, loadContent } from "../src/server/content/cards";
import { seedContent } from "../src/server/content/seed";

function parseArgs(argv: string[]) {
  const dirs: string[] = [];
  let dryRun = false;
  let retireMissing = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--retire-missing") retireMissing = true;
    else if (a === "--content") {
      const v = argv[++i];
      if (!v) throw new Error("--content 뒤에 폴더가 필요해요");
      dirs.push(path.resolve(process.cwd(), v));
    } else if (a === "-h" || a === "--help") {
      console.log("사용법: npm run seed -- [--content <폴더>]... [--dry-run] [--retire-missing]");
      process.exit(0);
    } else throw new Error(`모르는 옵션: ${a}`);
  }
  return { dirs, dryRun, retireMissing };
}

function defaultContentDir(): string | null {
  const candidates = [process.env.CONTENT_DIR, path.resolve(process.cwd(), "../content"), path.resolve(process.cwd(), "content")];
  for (const c of candidates) if (c && existsSync(c)) return path.resolve(c);
  return null;
}

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const { dirs, dryRun, retireMissing } = parseArgs(process.argv.slice(2));
  if (dirs.length === 0) {
    const d = defaultContentDir();
    if (!d) throw new ContentError("콘텐츠 폴더를 찾지 못했어요. --content <폴더> 또는 CONTENT_DIR을 주세요(예시: --content tests/fixtures/content).");
    dirs.push(d);
  }
  const contents = dirs.map((d) => loadContent(d));
  const total = contents.reduce((s, c) => s + c.cards.length, 0);
  for (const c of contents) console.log(`seed: ${c.dir} — 개념 ${c.concepts.length}개, 카드 ${c.cards.length}장`);
  if (total === 0 && contents.every((c) => c.concepts.length === 0)) {
    console.log("seed: 넣을 것이 없어요(개념·카드 0). 예시 자료는 --content tests/fixtures/content");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL이 비어 있어요(.env 확인)");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const r = await seedContent(prisma, contents, { dryRun, retireMissing });
    for (const w of r.warnings) console.warn(`seed: 경고 — ${w}`);
    const verb = dryRun ? "(dry-run, 쓰지 않음)" : "완료";
    console.log(
      `seed: ${verb} — 개념 새로 ${r.concepts.create}·갱신 ${r.concepts.update}${r.concepts.retired ? `·내림 ${r.concepts.retired}` : ""}, ` +
        `문제 새로 ${r.quizzes.create}·갱신 ${r.quizzes.update}${r.quizzes.retired ? `·내림 ${r.quizzes.retired}` : ""}, ` +
        `카드 새로 ${r.cases.create}·갱신 ${r.cases.update}(live ${r.cases.live})` +
        (r.cases.retired ? `, 콘텐츠에 없는 live 카드 ${r.cases.retired}장 retired` : ""),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(`seed: 실패 — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

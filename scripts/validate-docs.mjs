// 마크다운 링크·제어문자 검사. IfSave의 같은 이름 스크립트를 복기용으로 줄인 것(서드파티 스킬 예외 없음).
// 사용: node scripts/validate-docs.mjs   (저장소 루트 기준으로 모든 .md를 검사한다)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([".git", ".next", "build", "node_modules", "output", "tmp"]);

const markdown = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const target = path.join(dir, name);
    const stat = statSync(target);
    if (stat.isDirectory()) walk(target);
    else if (name.toLowerCase().endsWith(".md")) markdown.push(target);
  }
}
walk(repo);

const failures = [];
const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const link = /\[[^\]]*\]\(([^)]+)\)/g;
for (const file of markdown) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(control)) {
    const line = text.slice(0, match.index).split(/\r?\n/).length;
    failures.push(`${path.relative(repo, file)}:${line}: control character U+${match[0].charCodeAt(0).toString(16).padStart(4, "0")}`);
  }
  for (const match of text.matchAll(link)) {
    let href = match[1].trim();
    if (href.startsWith("<") && href.endsWith(">")) href = href.slice(1, -1);
    if (!href || href.startsWith("#") || /^(?:https?:|mailto:|tel:)/i.test(href)) continue;
    href = href.split("#", 1)[0].split("?", 1)[0];
    try { href = decodeURIComponent(href); } catch { failures.push(`${path.relative(repo, file)}: invalid URL encoding: ${match[1]}`); continue; }
    const target = path.resolve(path.dirname(file), href);
    if (!existsSync(target)) failures.push(`${path.relative(repo, file)}: missing link target: ${match[1]}`);
  }
}
if (failures.length > 0) { console.error(failures.join("\n")); process.exit(1); }
console.log(`Validated ${markdown.length} Markdown files: links and control characters OK.`);

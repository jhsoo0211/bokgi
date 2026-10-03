import "server-only";

/**
 * 조사: 앞말의 받침에 따라 고른다(프로토타입 state.js josa 이식). josa('매출', '을', '를') → '을'.
 * 숫자·영문·기호는 읽는 소리로 본다: 27 → 칠(받침), 5 → 오, R → 알(받침), F → 에프, % → 퍼센트.
 */
export function josa(word: string | number, withFinal: string, withoutFinal: string): string {
  const s = String(word).replace(/[\s'"‘’“”)\]]+$/, "");
  const ch = s.charAt(s.length - 1);
  const code = ch.charCodeAt(0);
  let fin = false;
  if (code >= 0xac00 && code <= 0xd7a3) fin = (code - 0xac00) % 28 !== 0;
  else if (/[0-9]/.test(ch)) fin = "013678".includes(ch); // 영 일 삼 육 칠 팔
  else if (/[a-z]/i.test(ch)) fin = "lmnr".includes(ch.toLowerCase()); // 엘 엠 엔 알
  return fin ? withFinal : withoutFinal;
}

/**
 * 근거 칩 → 근거 종류: 숫자가 든 낱말·'%'가 든 낱말·'vs'를 뺀다. 'PER 38 vs 27' → 'PER', '매출 +23%' → '매출'.
 * 칩 글자는 카드마다 다르므로 같은 종류끼리 묶어야 횟수가 쌓인다(state.js evidenceKind 이식, '%' 낱말 제외를 더함).
 */
export function evidenceKind(label: string | null | undefined): string {
  const full = String(label ?? "").trim();
  const kind = full
    .split(/\s+/)
    .filter((t) => /[가-힣a-z]/i.test(t) && !/\d/.test(t) && !t.includes("%") && t.toLowerCase() !== "vs")
    .join(" ");
  return kind || full.replace(/[%\d.+\-−]/g, "").trim() || "근거";
}

/** 공개 화면과 같은 부호 표기(−는 U+2212) */
export function signed1(n: number): string {
  return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1);
}

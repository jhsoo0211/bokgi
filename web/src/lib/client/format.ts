/**
 * 화면 문구·숫자·날짜 도우미. 문구는 프로토타입(prototype/app/js/app.js)과 같다.
 * 결과 상태 이름(RESULT·SHAPE)은 공개 화면과 일지의 공개된 행에서만 쓴다.
 */
import type { ConceptBranch, ConceptState, Direction, InfoGroup, InfoLevel, LabelKind, PanelKind, ReportCategory, ResultState, SelfCheck, UndoSeconds } from "./types";

/** 부호: 음수는 U+2212(−), 소수 한 자리 */
export const fmtSigned = (n: number): string => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1);
/** 지수 값(처음 = 100): 정수는 그대로, 아니면 소수 한 자리 */
export const fmtIndex = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const DIR: Record<Direction, string> = { outperform: "시장보다 앞섰다", underperform: "시장보다 뒤졌다" };
export const RESULT: Record<ResultState, string> = { ahead: "앞섬", behind: "뒤짐", even: "비슷" };
export const SHAPE: Record<ResultState, string> = { ahead: "▲", behind: "▼", even: "■" };
export const CONCEPT_STATE: Record<ConceptState, string> = { new: "신규", learning: "학습 중", review: "복습 필요", known: "이해" };
export const BRANCHES: readonly ConceptBranch[] = ["outcome", "numbers", "then", "self"];
export const BRANCH_LABEL: Record<ConceptBranch, string> = { outcome: "결과 읽기", numbers: "숫자 읽기", then: "그때 읽기", self: "내 판단 읽기" };
export const PANELS: readonly (readonly [PanelKind, string])[] = [["flow", "흐름"], ["numbers", "숫자"], ["then", "그때"]];
export const DEFAULT_PANEL: PanelKind = "numbers";
export const REPORT_CATS: readonly (readonly [ReportCategory, string])[] = [
  ["data_error", "데이터 오류"],
  ["identifiable", "기업 유추 가능"],
  ["missing_info", "중요 정보 누락"],
  ["outcome_explanation", "결과 설명 부정확"],
  ["concept_unclear", "개념 설명 이해 어려움"],
  ["source_error", "출처 오류"],
  ["ai_as_fact", "AI 추론이 사실처럼 보임"],
  ["other", "기타"],
];
/** ○△✕ 자기 평가: 원칙을 지켰나가 아니라 '내 근거가 이 개념과 맞았나'를 묻는 개념 확인. 기록만, 점수 없음 */
export const SELF_CHECK: Record<SelfCheck, readonly [string, string]> = { o: ["○", "맞았다"], tri: ["△", "일부"], x: ["✕", "달랐다"] };
export const SELF_CHECK_ORDER: readonly SelfCheck[] = ["o", "tri", "x"];
export const SELF_CHECK_FB: Record<SelfCheck, string> = {
  o: "기록했어요. 일지에 ○로 남아요.",
  tri: "기록했어요. 아래 개념 설명에서 근거와 어긋난 부분을 찾아보세요.",
  x: "기록했어요. 아래 개념 설명을 먼저 읽고 확인 문제를 풀어 보세요.",
};
export const LABEL_TEXT: Record<LabelKind, string> = { source: "📄 출처", inference: "🔍 추론", uncertain: "❓ 불확실" };
export const EXPLAIN_HEAD = { good: "이번에 잘 읽은 것", change: "다음에 바꿀 것", concept: "개념 연결" } as const;
export const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;
export const CALIBRATION_FEW = "비슷함을 뺀 판단이 10장 넘게 쌓이면 확신도 보정을 글로 알려 드려요.";
export const MIN_INSIGHT = 3;

/** 첫 실행 안내. 넷째 장은 정보 수준 고르기(D16) — 시험이 아니라 세 판에서 볼 정보의 깊이를 정한다 */
export const ONBOARDING = [
  { title: "복기는 주가 맞히기 게임이 아니에요", body: "근거를 남기는 연습이에요. 맞혔는지보다 무엇을 보고 판단했는지가 남아요.", art: "chip" },
  { title: "하루 3장, 5분", body: "카드 3장을 판단하고, 전에 배운 개념은 복습 문제로 두 개까지 다시 풀어요.", art: "cards" },
  { title: "결과와 회사 이름은 판단한 뒤에만 보여요", body: "근거와 확신도를 고르고 판단을 남기면, 그때 회사와 결과가 공개돼요.", art: "masked" },
  { title: "어느 정도 아세요?", body: "시험이 아니에요. 카드의 세 판에서 볼 정보의 깊이만 정해요.", art: "level" },
] as const;

/* ---------- 정보 수준(D16, 02 §7.1) ---------- */
/** 머리줄 단추·일지 표시의 짧은 이름 */
export const LEVEL_SHORT: Record<InfoLevel, string> = { basic: "핵심만", standard: "기본", advanced: "전부", custom: "지정" };
/** 설정 시트·온보딩의 이름 */
export const LEVEL_NAME: Record<InfoLevel, string> = { basic: "초급 「핵심만」", standard: "중급 「기본」", advanced: "고급 「전부」", custom: "사용자 지정" };
/** 프리셋 세 가지(온보딩 넷째 장·설정 시트): 누구에게 맞는지 + 무엇이 보이는지 */
export const LEVEL_PRESETS: readonly { level: Exclude<InfoLevel, "custom">; who: string; what: string }[] = [
  { level: "basic", who: "처음이에요", what: "매출·이익률·PER·금리 같은 핵심 숫자만" },
  { level: "standard", who: "기본 지표는 알아요", what: "시장 비교선·EPS·가이던스·부채비율까지" },
  { level: "advanced", who: "재무제표를 읽어요", what: "PBR·PSR·순현금·FCF·환율·원자재까지 전부" },
];
/** 판 아래 '더 보기' 줄의 앞말(숨긴 묶음이 있을 때만 보인다) */
export const LEVEL_MORE: Record<InfoLevel, string> = { basic: "핵심만 보고 있어요", standard: "기본 정보만 보고 있어요", advanced: "고른 정보만 보고 있어요", custom: "고른 정보만 보고 있어요" };
/** 묶음 아홉 개의 이름(INFO_GROUPS 순서로 쓴다). panel은 설정 시트의 작은 머리 */
export const GROUP_LABEL: Record<InfoGroup, { panel: string; label: string; note?: string }> = {
  marketLine: { panel: "흐름", label: "시장 비교선" },
  volume: { panel: "흐름", label: "거래량 추세" },
  growthDetail: { panel: "숫자", label: "성장 세부", note: "EPS·가이던스" },
  healthBasic: { panel: "숫자", label: "재무 건강 기본", note: "부채비율" },
  valuationDetail: { panel: "숫자", label: "밸류에이션 세부", note: "PBR·PSR" },
  healthDetail: { panel: "숫자", label: "재무 건강 세부", note: "순현금·FCF" },
  allNotes: { panel: "그때", label: "이슈 전부", note: "끄면 공시·통계 우선 2개" },
  fxCommodity: { panel: "그때", label: "환율·원자재 메모" },
  riskChips: { panel: "고르기", label: "위험 칩", note: "선택 입력" },
};
export const UNDO_CHOICES: readonly UndoSeconds[] = [2.5, 5, 10];

/* ---------- 조사 ---------- */
/** 앞말의 받침에 따라 고른다. josa('매출', '을', '를') → '을'. 숫자·영문은 읽는 소리로 본다(27 → 칠, R → 알) */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const s = String(word).replace(/[\s'"‘’“”)\]]+$/, "");
  const ch = s.charAt(s.length - 1);
  const code = ch.charCodeAt(0);
  let fin = false;
  if (code >= 0xac00 && code <= 0xd7a3) fin = (code - 0xac00) % 28 !== 0;
  else if (/[0-9]/.test(ch)) fin = "013678".includes(ch);
  else if (/[a-z]/i.test(ch)) fin = "lmnr".includes(ch.toLowerCase());
  return fin ? withFinal : withoutFinal;
}

/* ---------- 날짜 (YYYY-MM-DD 문자열, 기기 현지 날짜) ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
export const dayKeyOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 오늘(기기 현지). 베타 서버는 Asia/Seoul 고정이라 한국 사용자에게는 같은 날이다 */
export const localDayKey = (): string => dayKeyOf(new Date());
export const parseDayKey = (k: string): Date => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
export const addDays = (k: string, n: number): string => {
  const d = parseDayKey(k);
  return dayKeyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
export const monthOf = (k: string): string => k.slice(0, 7);
export const addMonths = (month: string, n: number): string => {
  const d = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
export const monthIndex = (month: string): number => +month.slice(0, 4) * 12 + (+month.slice(5, 7) - 1);
/** '10월 4일' */
export const md = (k: string): string => `${+k.slice(5, 7)}월 ${+k.slice(8, 10)}일`;
/** 복습 예정 표기: 지났거나 오늘이면 '오늘', 내일이면 '내일 (10월 4일)', 그 밖은 '10월 7일' */
export function dueLabel(dueOn: string, today: string): string {
  if (dueOn <= today) return "오늘";
  return dueOn === addDays(today, 1) ? `내일 (${md(dueOn)})` : md(dueOn);
}

/* ---------- 인사이트 카드: 문장 머리의 종류 표시(서버는 문장만 준다) ---------- */
export function insightKind(text: string): string | null {
  if (/^확신도/.test(text)) return "확신도";
  if (/근거로 한 판단/.test(text)) return "근거";
  if (/^아는 회사/.test(text)) return "아는 회사";
  return null;
}

export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

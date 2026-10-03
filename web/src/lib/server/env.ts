import "server-only";

/**
 * 환경변수는 호출할 때마다 읽는다(시험에서 바꿀 수 있게, 빌드 때 값이 굳지 않게).
 * 이름은 .env.example과 같다.
 */
const DEFAULT_TZ = "Asia/Seoul";

function read(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function int(name: string, fallback: number): number {
  const v = read(name);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  /** 비GET 요청의 Origin이 이것과 같아야 한다. 쿠키 Secure 여부도 이것(https)으로 정한다. */
  publicOrigin: (): string => (read("PUBLIC_ORIGIN") ?? "http://localhost:3000").replace(/\/+$/, ""),
  appTz: (): string => read("APP_TZ") ?? DEFAULT_TZ,
  isProduction: (): boolean => process.env.NODE_ENV === "production",
  version: (): string => read("APP_VERSION") ?? read("GIT_SHA") ?? "dev",

  aiEnabled: (): boolean => read("AI_ENABLED") === "true",
  aiDailyCallCap: (): number => int("AI_DAILY_CALL_CAP", 300),
  aiPrimary: () => provider("AI"),
  aiFallback: () => provider("AI_FALLBACK"),
};

export interface AiProvider {
  name: "primary" | "fallback";
  apiKey: string;
  baseUrl: string;
  model: string;
}

function provider(prefix: "AI" | "AI_FALLBACK"): AiProvider | null {
  const apiKey = read(`${prefix}_API_KEY`);
  const baseUrl = read(`${prefix}_BASE_URL`);
  const model = read(`${prefix}_MODEL`);
  if (!apiKey || !baseUrl || !model) return null;
  return { name: prefix === "AI" ? "primary" : "fallback", apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), model };
}

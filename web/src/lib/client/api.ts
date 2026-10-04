/**
 * 복기 API 클라이언트. 경로·본문·응답은 src/shared/contract.ts(유일한 계약)와 05 §4를 따른다.
 *
 * 목 모드: `next dev`에서 NEXT_PUBLIC_USE_MOCK=1이면 ./mock(브라우저 메모리 + localStorage)으로 동작한다.
 * 운영 빌드(NODE_ENV=production)에서는 조건이 컴파일 때 거짓으로 접혀 목 모듈(예시 카드의 결과 자료 포함)이
 * 번들·청크에 들어가지 않는다. 그래서 목 모드는 개발 서버 전용이다.
 */
import type {
  ConceptList, EventsBody, Explain, InviteBody, Journal, JudgmentBody, JudgmentCreated, Me, PublicCase,
  Question, QuestionBody, QuizBody, QuizResultX, ReportBody, Reveal, SelfCheck, Today,
} from "./types";

import { ApiError } from "./errors";

export { ApiError };

export type CallOpts = { keepalive?: boolean };

export interface BokgiApi {
  /** 온보딩 완료는 UI 이벤트 onboarding_done으로 서버가 기록한다(패키지 A 계약 보충) → me().user.onboarded */
  me(): Promise<Me>;
  invite(body: InviteBody): Promise<void>;
  /** extra: 세트를 다 판단했으면 cards에 '한 장 더' 카드 1장(오늘 판단하고 아직 공개하지 않은 한 장 더가 있으면 그 카드) — A 계약 보충 ?extra=1 */
  today(opts?: { extra?: boolean }): Promise<Today>;
  getCase(id: string): Promise<PublicCase>;
  createJudgment(body: JudgmentBody, opts?: CallOpts): Promise<JudgmentCreated>;
  reveal(judgmentId: string): Promise<Reveal>;
  selfCheck(judgmentId: string, value: SelfCheck): Promise<void>;
  quiz(conceptId: string, body: QuizBody): Promise<QuizResultX>;
  concepts(): Promise<ConceptList>;
  /** ?month=YYYY-MM (달력의 달, A 계약 보충) */
  journal(month?: string): Promise<Journal>;
  explain(judgmentId: string): Promise<Explain>;
  question(body: QuestionBody): Promise<Question>;
  report(body: ReportBody): Promise<void>;
  events(body: EventsBody, opts?: CallOpts): Promise<void>;
}

type ErrorBody = { error: { code: string; message: string } };
const isErrorBody = (v: unknown): v is ErrorBody =>
  typeof v === "object" && v !== null && "error" in v && typeof (v as { error: unknown }).error === "object" && (v as { error: unknown }).error !== null;

/** 응답을 기다리는 한도. 넘으면 '불러오는 중…'에 갇히지 않고 다시 시도할 수 있는 오류로 바꾼다(페이지를 떠날 때의 keepalive 전송은 제외).
 *  판단·퀴즈·이벤트는 서버가 멱등(유일 키·clientAttemptId·clientEventId)이라 시간 초과 뒤 다시 보내도 두 번 세지 않는다. */
const TIMEOUT_MS = 15_000;

async function http<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown, opts?: CallOpts): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const ctl = opts?.keepalive ? null : new AbortController();
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
  let res: Response;
  let text: string;
  try {
    res = await fetch(path, {
      method, headers, credentials: "same-origin", cache: "no-store",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: opts?.keepalive,
      signal: ctl?.signal,
    });
    text = res.status === 204 ? "" : await res.text();
  } catch {
    if (ctl?.signal.aborted) throw new ApiError(0, "timeout", "응답이 늦어요. 잠시 뒤에 다시 시도해 주세요.");
    throw new ApiError(0, "network", "인터넷 연결을 확인해 주세요.");
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data: unknown;
  if (text) {
    try { data = JSON.parse(text); } catch { data = undefined; }
  }
  if (!res.ok) {
    const e = isErrorBody(data) ? data.error : { code: `http_${res.status}`, message: "잠시 뒤에 다시 시도해 주세요." };
    throw new ApiError(res.status, String(e.code), String(e.message));
  }
  return data as T;
}

const enc = encodeURIComponent;

const realApi: BokgiApi = {
  me: () => http<Me>("GET", "/api/me"),
  invite: async (body) => { await http<unknown>("POST", "/api/auth/invite", body); },
  today: (opts) => http<Today>("GET", opts?.extra ? "/api/session/today?extra=1" : "/api/session/today"),
  getCase: (id) => http<PublicCase>("GET", `/api/cases/${enc(id)}`),
  createJudgment: (body, opts) => http<JudgmentCreated>("POST", "/api/judgments", body, opts),
  reveal: (id) => http<Reveal>("POST", `/api/judgments/${enc(id)}/reveal`, {}),
  selfCheck: async (id, value) => { await http<unknown>("PUT", `/api/judgments/${enc(id)}/self-check`, { value }); },
  quiz: (conceptId, body) => http<QuizResultX>("POST", `/api/concepts/${enc(conceptId)}/quiz`, body),
  concepts: () => http<ConceptList>("GET", "/api/concepts"),
  journal: (month) => http<Journal>("GET", month ? `/api/journal?month=${enc(month)}` : "/api/journal"),
  explain: (judgmentId) => http<Explain>("POST", "/api/ai/explain", { judgmentId }),
  question: (body) => http<Question>("POST", "/api/ai/question", body),
  report: async (body) => { await http<unknown>("POST", "/api/reports", body); },
  events: async (body, opts) => { await http<unknown>("POST", "/api/events", body, opts); },
};

let impl: BokgiApi | null = null;
let loading: Promise<BokgiApi> | null = null;

/** 목 모드인가. 운영 빌드에서는 늘 false(상수로 접힌다) */
export const USE_MOCK = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_USE_MOCK === "1";

function load(): Promise<BokgiApi> {
  // 조건을 import() 자리에 그대로 둔다 — 운영 빌드에서 이 가지째 지워져 목 청크가 생기지 않게
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_USE_MOCK === "1") {
    return import("./mock").then((m) => m.createMockApi());
  }
  return Promise.resolve(realApi);
}

/** 앱 시작 때 한 번. 목 모듈을 미리 읽어 두면 이후 호출(페이지를 떠날 때의 보류 전송 포함)이 바로 실행된다 */
export function initApi(): Promise<BokgiApi> {
  if (impl) return Promise.resolve(impl);
  if (!loading) loading = load().then((a) => (impl = a));
  return loading;
}

async function withApi<T>(f: (a: BokgiApi) => Promise<T>): Promise<T> {
  return f(impl ?? (await initApi()));
}

export const api: BokgiApi = {
  me: () => withApi((a) => a.me()),
  invite: (b) => withApi((a) => a.invite(b)),
  today: (o) => withApi((a) => a.today(o)),
  getCase: (id) => withApi((a) => a.getCase(id)),
  createJudgment: (b, o) => withApi((a) => a.createJudgment(b, o)),
  reveal: (id) => withApi((a) => a.reveal(id)),
  selfCheck: (id, v) => withApi((a) => a.selfCheck(id, v)),
  quiz: (c, b) => withApi((a) => a.quiz(c, b)),
  concepts: () => withApi((a) => a.concepts()),
  journal: (m) => withApi((a) => a.journal(m)),
  explain: (id) => withApi((a) => a.explain(id)),
  question: (b) => withApi((a) => a.question(b)),
  report: (b) => withApi((a) => a.report(b)),
  events: (b, o) => withApi((a) => a.events(b, o)),
};

export const isApiError = (e: unknown, status?: number): e is ApiError =>
  e instanceof ApiError && (status === undefined || e.status === status);

/** 화면에 보여 줄 오류 문구(서버 문구는 고정 문장이라 그대로 써도 된다) */
export const errorText = (e: unknown): string =>
  e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요.";

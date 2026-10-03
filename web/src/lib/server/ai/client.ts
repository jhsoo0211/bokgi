import "server-only";
import { z } from "zod";
import { env, type AiProvider } from "../env";

/**
 * OpenAI 호환 chat/completions 클라이언트. 1차(AI_*) 실패 시 대체(AI_FALLBACK_*).
 * 호출은 6초 제한, DB 트랜잭션 밖에서 부른다. 프롬프트·응답 원문은 로그에 남기지 않는다(실패 종류만).
 * consume()이 false면(하루 상한) 호출하지 않는다.
 */
export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatResult {
  text: string;
  provider: AiProvider["name"];
  latencyMs: number;
}

const ChatResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

export const AI_TIMEOUT_MS = 6000;

async function callOnce(p: AiProvider, messages: ChatMessage[], maxTokens: number, temperature: number): Promise<string | null> {
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const parsed = ChatResponse.safeParse(await res.json());
  if (!parsed.success) return null;
  const text = parsed.data.choices[0].message.content?.trim();
  return text ? text : null;
}

export async function chat(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; consume: () => Promise<boolean> },
): Promise<ChatResult | null> {
  const providers = [env.aiPrimary(), env.aiFallback()].filter((p): p is AiProvider => p !== null);
  for (const p of providers) {
    if (!(await opts.consume())) return null;
    const started = Date.now();
    try {
      const text = await callOnce(p, messages, opts.maxTokens ?? 220, opts.temperature ?? 0.3);
      if (text) return { text, provider: p.name, latencyMs: Date.now() - started };
    } catch (e) {
      const kind = e instanceof Error ? e.name : "unknown";
      console.warn(`[ai] ${p.name} call failed: ${kind}`);
    }
  }
  return null;
}

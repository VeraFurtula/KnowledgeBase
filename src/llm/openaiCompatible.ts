export type ApiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

/**
 * POST to an OpenAI-compatible `/v1/chat/completions` endpoint.
 * Works with Groq, Together, OpenRouter, Ollama (`http://127.0.0.1:11434/v1`), vLLM, etc.
 */
export async function fetchChatCompletion(params: {
  messages: ApiChatMessage[];
  signal?: AbortSignal;
}): Promise<string> {
  const base = import.meta.env.VITE_LLM_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const model = import.meta.env.VITE_LLM_MODEL?.trim() ?? "";
  if (!base || !model) {
    throw new Error("Set VITE_LLM_BASE_URL and VITE_LLM_MODEL in your environment.");
  }

  const url = `${base}/chat/completions`;
  const apiKey = import.meta.env.VITE_LLM_API_KEY?.trim() ?? "";
  const maxTokensRaw = import.meta.env.VITE_LLM_MAX_TOKENS;
  const tempRaw = import.meta.env.VITE_LLM_TEMPERATURE;
  /** Default high enough for long-form consultant-style doc-grounded answers (override with VITE_LLM_MAX_TOKENS). */
  const maxTokens = maxTokensRaw ? Number(maxTokensRaw) : 8192;
  const temperature = tempRaw ? Number(tempRaw) : 0.1;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: Number.isFinite(temperature) ? temperature : 0.1,
      max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 8192,
    }),
    signal: params.signal,
  });

  const raw = await res.text();
  let data: ChatCompletionResponse;
  try {
    data = JSON.parse(raw) as ChatCompletionResponse;
  } catch {
    throw new Error(res.ok ? "Invalid JSON from model server." : `${res.status}: ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = data.error?.message ?? raw.slice(0, 400);
    throw new Error(`${res.status}: ${msg}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty reply from model.");
  return content;
}

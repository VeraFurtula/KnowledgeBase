/** True when the app should call a remote Llama (or other) model via OpenAI-compatible HTTP. */
export function isLlmConfigured(): boolean {
  const base = import.meta.env.VITE_LLM_BASE_URL?.trim();
  const model = import.meta.env.VITE_LLM_MODEL?.trim();
  return Boolean(base && model);
}

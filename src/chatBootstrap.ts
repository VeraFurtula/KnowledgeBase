/** Dedupe rapid double-invocation (e.g. React StrictMode) when bootstrapping `/chat`. */
let stash: { id: string; at: number } | null = null;

export function takeFreshChatId(create: () => string, maxAgeMs = 1500): string {
  const now = Date.now();
  if (stash && now - stash.at < maxAgeMs) return stash.id;
  const id = create();
  stash = { id, at: now };
  return id;
}

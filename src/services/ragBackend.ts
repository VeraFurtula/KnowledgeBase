/** LangChain/Chroma RAG server (see `server/app.py`). */

/** Must match server `collection_name` normalization (lower-case email). */
export function ragUserId(email: string): string {
  return email.trim().toLowerCase();
}

function ragBase(): string {
  const raw = import.meta.env.VITE_RAG_API_URL;
  if (raw === "") return "";
  const trimmed = typeof raw === "string" ? raw.trim().replace(/\/$/, "") : "";
  if (trimmed) return trimmed;
  /** Dev: Vite proxies `/api/rag` → `server` (see `vite.config.ts`) so RAG works without `.env`. */
  if (import.meta.env.DEV) return "/api/rag";
  return "";
}

export function isRagBackendConfigured(): boolean {
  return Boolean(ragBase());
}

export async function reindexUserDocuments(
  userId: string,
  documents: { id: string; text: string; filename: string }[]
): Promise<void> {
  const base = ragBase();
  if (!base) return;
  const res = await fetch(`${base}/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: ragUserId(userId),
      documents: documents.map((d) => ({
        id: d.id,
        text: d.text,
        filename: d.filename,
      })),
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`RAG index failed: ${res.status} ${t.slice(0, 200)}`);
  }
}

export async function fetchRagContext(userId: string, query: string, k = 12): Promise<string | null> {
  const base = ragBase();
  if (!base) return null;
  const res = await fetch(`${base}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: ragUserId(userId), query, k }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[RAG search] HTTP", res.status, t.slice(0, 300));
    return null;
  }
  const data = (await res.json()) as { context?: string };
  return typeof data.context === "string" ? data.context : null;
}

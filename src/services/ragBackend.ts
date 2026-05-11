/** LangChain/Chroma RAG server (see `server/app.py`). */
import type { SourceImage } from "../types/chat";

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

export type RagSearchResult = {
  context: string | null;
  imageRefs: SourceImage[];
};

export async function fetchRagContext(userId: string, query: string, k = 12): Promise<RagSearchResult> {
  const base = ragBase();
  if (!base) return { context: null, imageRefs: [] };
  const res = await fetch(`${base}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: ragUserId(userId), query, k }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[RAG search] HTTP", res.status, t.slice(0, 300));
    return { context: null, imageRefs: [] };
  }
  const data = (await res.json()) as { context?: string; image_refs?: unknown[] };
  const rawRefs = Array.isArray(data.image_refs) ? data.image_refs : [];
  const imageRefs: SourceImage[] = rawRefs
    .filter((r): r is { source: string; slide: number; url: string } =>
      typeof r === "object" && r !== null &&
      typeof (r as Record<string, unknown>).url === "string"
    )
    .map((r) => ({
      source: String(r.source ?? ""),
      slide: Number(r.slide ?? 0),
      url: base + r.url,
    }));
  return {
    context: typeof data.context === "string" ? data.context : null,
    imageRefs,
  };
}

/** Return the list of source filenames Chroma has indexed for this user. */
export async function fetchIndexedSources(userId: string): Promise<{ sources: string[]; chunkCount: number }> {
  const base = ragBase();
  if (!base) return { sources: [], chunkCount: 0 };
  try {
    const res = await fetch(`${base}/sources/${encodeURIComponent(ragUserId(userId))}`);
    if (!res.ok) return { sources: [], chunkCount: 0 };
    const data = (await res.json()) as { sources?: string[]; chunk_count?: number };
    return {
      sources: Array.isArray(data.sources) ? data.sources : [],
      chunkCount: typeof data.chunk_count === "number" ? data.chunk_count : 0,
    };
  } catch {
    return { sources: [], chunkCount: 0 };
  }
}

/** Upload a PPTX file for image extraction. Best-effort — silently skips if backend doesn't support it. */
export async function extractImagesFromFile(userId: string, filename: string, file: File): Promise<void> {
  const base = ragBase();
  if (!base) return;
  const fd = new FormData();
  fd.append("user_id", ragUserId(userId));
  fd.append("filename", filename);
  fd.append("file", file, filename);
  try {
    await fetch(`${base}/extract-images`, { method: "POST", body: fd });
  } catch {
    // Silently ignore — image extraction is best-effort
  }
}

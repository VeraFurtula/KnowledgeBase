/** Ping the RAG backend health endpoint. Retries up to 3 times to handle slow startup. */
export async function checkRagHealth(): Promise<boolean> {
  const raw = import.meta.env.VITE_RAG_API_URL;
  const base =
    typeof raw === "string" && raw.trim()
      ? raw.trim().replace(/\/$/, "")
      : import.meta.env.DEV
        ? "/api/rag"
        : "";
  if (!base) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      // retry after short delay
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

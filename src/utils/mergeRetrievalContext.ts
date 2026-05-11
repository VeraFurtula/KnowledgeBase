/**
 * Merge Chroma (semantic) hits with keyword-aligned excerpts without dropping
 * the entire keyword block when RAG returns a long string (common with many chunks).
 */
export function mergeRagWithKeywordBudget(
  rag: string,
  keyword: string,
  separator: string,
  maxChars: number,
  /** Minimum characters to keep from keyword excerpts when both sides are non-empty. */
  minKeywordChars = 10_000
): string {
  const r = rag.trim();
  const k = keyword.trim();
  if (!k) return r.length <= maxChars ? r : `${r.slice(0, maxChars)}\n\n…(RAG context truncated)`;
  if (!r) return k.length <= maxChars ? k : `${k.slice(0, maxChars)}\n\n…(keyword excerpts truncated)`;

  const sepLen = separator.length;
  const minK = Math.min(k.length, minKeywordChars, Math.max(4_000, Math.floor(maxChars * 0.28)));
  const kPart = k.slice(0, minK);
  const roomR = maxChars - kPart.length - sepLen - 80;
  if (roomR < 1_000) {
    const k2 = k.slice(0, Math.min(k.length, Math.floor(maxChars * 0.35)));
    const r2 = r.slice(0, Math.max(0, maxChars - k2.length - sepLen - 40));
    return `${r2}${separator}${k2}${
      r.length > r2.length || k.length > k2.length ? "\n\n…(retrieval truncated; keyword + RAG both preserved in part)" : ""
    }`;
  }
  const rPart = r.length <= roomR ? r : `${r.slice(0, roomR)}\n\n…(RAG hits truncated; keyword excerpts kept)`;
  const kSuffix = k.length > kPart.length ? "\n\n…(further keyword windows truncated)" : "";
  return `${rPart}${separator}${kPart}${kSuffix}`;
}
